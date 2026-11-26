//! Importing notes (IO-1 to IO-3): a folder, single files or a ZIP. Nothing in the vault is
//! ever overwritten, and links between the imported notes keep working.

pub(crate) mod keys;
pub(crate) mod plan;
pub(crate) mod report;

use std::collections::HashMap;
use std::fs::{self, File};
use std::path::{Path, PathBuf};

use tempfile::TempDir;
use vault_core::Vault;
use zip::ZipArchive;

use crate::import::keys::KeyBook;
use crate::import::plan::{ItemKind, Plan, PlannedItem, plan_files, plan_folder, plan_tree};
use crate::import::report::{ImportReport, RenamedItem, SkippedItem};
use crate::shared::links::{
    encode_target, folder_of, is_local_target, map_link_targets, map_wikilinks, percent_decode,
    relative_link, resolve, split_anchor,
};
use crate::shared::names::stem;
use crate::{IoError, Job};

pub enum ImportSource {
    /// A folder of notes, kept as a new top-level folder.
    Folder(PathBuf),
    /// Single `.md` or `.txt` files, placed at the vault root.
    Files(Vec<PathBuf>),
    /// A ZIP, such as one exported by this app. Its contents go to the vault root.
    Zip(PathBuf),
}

/// Imports `source`, writes a report to `.vault/imports/`, and returns it.
pub fn import(
    vault: &Vault,
    source: &ImportSource,
    job: &dyn Job,
    now_seconds: u64,
) -> Result<ImportReport, IoError> {
    // Keeps the unpacked ZIP alive until the import is done.
    let mut _unpacked: Option<TempDir> = None;
    let plan = match source {
        ImportSource::Folder(folder) => plan_folder(vault, folder)?,
        ImportSource::Files(files) => plan_files(vault, files)?,
        ImportSource::Zip(zip) => {
            let folder = unpack_zip(zip)?;
            let plan = plan_tree(vault, folder.path(), None, true)?;
            _unpacked = Some(folder);
            plan
        }
    };

    let mut report = ImportReport {
        destination: plan.destination.clone(),
        ..ImportReport::default()
    };
    for (path, reason) in &plan.skipped {
        report.skipped.push(SkippedItem {
            path: path.clone(),
            reason: reason.clone(),
        });
    }
    let linker = Linker::new(&plan);
    let mut keys = KeyBook::load(vault)?;
    let total = plan.items.len();
    for (index, item) in plan.items.iter().enumerate() {
        if job.is_cancelled() {
            report.cancelled = true;
            break;
        }
        match copy_item(vault, item, &linker, &mut keys) {
            Ok(links_fixed) => record(&mut report, item, links_fixed),
            Err(error) => report.skipped.push(SkippedItem {
                path: item.from.clone(),
                reason: error.to_string(),
            }),
        }
        job.progress(index + 1, total);
    }
    report.rekeyed = keys.rekeyed;
    report.code_note_keys = keys.code_notes;
    report.save(vault, now_seconds)?;
    Ok(report)
}

fn record(report: &mut ImportReport, item: &PlannedItem, links_fixed: usize) {
    match item.kind {
        ItemKind::Note => report.notes += 1,
        ItemKind::Attachment => report.attachments += 1,
        ItemKind::Internal => {}
    }
    report.links_fixed += links_fixed;
    let from_name = item.from.rsplit('/').next().unwrap_or(&item.from);
    if from_name != item.to.file_name() {
        report.renamed.push(RenamedItem {
            from: item.from.clone(),
            to: item.to.clone(),
        });
    }
}

/// Copies one file. Notes get their links fixed and their key checked. Returns links fixed.
fn copy_item(
    vault: &Vault,
    item: &PlannedItem,
    linker: &Linker,
    keys: &mut KeyBook,
) -> Result<usize, IoError> {
    let bytes = fs::read(&item.source).map_err(IoError::file("read", item.from.clone()))?;
    let (bytes, links_fixed) = match item.kind {
        ItemKind::Note => {
            let text = String::from_utf8(bytes)
                .map_err(|_| vault_core::VaultError::NotText(item.from.clone()))?;
            let (text, links_fixed) = linker.fix(&text, item);
            (keys.adjust(&text)?.into_bytes(), links_fixed)
        }
        ItemKind::Attachment | ItemKind::Internal => (bytes, 0),
    };
    let target = item.to.to_fs_path(vault.root());
    if let Some(folder) = target.parent() {
        fs::create_dir_all(folder).map_err(IoError::file("create", item.to.to_string()))?;
    }
    vault
        .writer()
        .create_new(&target, &bytes, item.to.as_str())?;
    Ok(links_fixed)
}

/// Knows where every imported file went, so links can follow renamed files.
struct Linker {
    /// Path inside the import → path in the vault.
    by_source: HashMap<String, String>,
    /// File name or note title inside the import → its new name, for wikilinks.
    by_name: HashMap<String, Option<String>>,
}

impl Linker {
    fn new(plan: &Plan) -> Self {
        let mut by_source = HashMap::new();
        let mut by_name: HashMap<String, Option<String>> = HashMap::new();
        for item in &plan.items {
            by_source.insert(item.from.clone(), item.to.as_str().to_string());
            let old_name = item.from.rsplit('/').next().unwrap_or(&item.from);
            let new_name = item.to.file_name();
            let mut names = vec![(old_name.to_lowercase(), new_name.to_string())];
            if item.kind == ItemKind::Note {
                names.push((stem(old_name).to_lowercase(), stem(new_name).to_string()));
            }
            for (old, new) in names {
                // Two files with one name: a wikilink to it is ambiguous, so leave it.
                by_name
                    .entry(old)
                    .and_modify(|known| *known = None)
                    .or_insert(Some(new));
            }
        }
        Self { by_source, by_name }
    }

    fn fix(&self, text: &str, note: &PlannedItem) -> (String, usize) {
        let source_folder = folder_of(&note.from);
        let target_folder = folder_of(note.to.as_str());
        let (text, markdown_fixed) = map_link_targets(text, &mut |target| {
            self.relink(target, source_folder, target_folder)
        });
        let (text, wiki_fixed) = map_wikilinks(&text, &mut |target| self.rename_wikilink(target));
        (text, markdown_fixed + wiki_fixed)
    }

    fn relink(&self, target: &str, source_folder: &str, target_folder: &str) -> Option<String> {
        if !is_local_target(target) {
            return None;
        }
        let (path, anchor) = split_anchor(target);
        let decoded = percent_decode(path);
        let linked = resolve(source_folder, &decoded)?;
        let new_path = self.by_source.get(&linked)?;
        let new_link = relative_link(target_folder, new_path);
        if new_link == decoded {
            return None;
        }
        Some(format!("{}{anchor}", encode_target(&new_link)))
    }

    fn rename_wikilink(&self, target: &str) -> Option<String> {
        if target.contains('/') {
            return None;
        }
        let new_name = self.by_name.get(&target.to_lowercase())?.as_ref()?;
        (new_name != target).then(|| new_name.clone())
    }
}

/// Unpacks a ZIP into a temp folder. Entries that would land outside it are skipped.
fn unpack_zip(zip: &Path) -> Result<TempDir, IoError> {
    let label = zip.display().to_string();
    let file = File::open(zip).map_err(IoError::file("open", label.clone()))?;
    let mut archive = ZipArchive::new(file).map_err(|_| IoError::BadZip(label.clone()))?;
    let folder = tempfile::tempdir().map_err(IoError::file(
        "create a temporary folder for",
        label.clone(),
    ))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|_| IoError::BadZip(label.clone()))?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        if entry.is_dir() {
            continue;
        }
        let target = folder.path().join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(IoError::file("unpack", label.clone()))?;
        }
        let mut output = File::create(&target).map_err(IoError::file("unpack", label.clone()))?;
        std::io::copy(&mut entry, &mut output).map_err(IoError::file("unpack", label.clone()))?;
    }
    Ok(folder)
}
