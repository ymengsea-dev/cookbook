//! Exporting one note as Markdown with its attachments (IO-4). The note's local links are
//! pointed at an `attachments/` folder next to it, so the copy works anywhere.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use vault_core::{Vault, VaultPath};

use crate::IoError;
use crate::links::{
    encode_target, folder_of, is_local_target, map_link_targets, percent_decode, resolve,
    split_anchor,
};
use crate::names::{has_extension, numbered, stem};

const ATTACHMENTS: &str = "attachments";
const MAX_NUMBER: u32 = 10_000;

/// Writes `<into>/<note title>/<note>.md` plus the files it links to. Returns that folder.
pub fn export_note_markdown(
    vault: &Vault,
    note: &VaultPath,
    into: &Path,
) -> Result<PathBuf, IoError> {
    let content = vault.read_note(note)?.content;
    let folder = new_folder(into, stem(note.file_name()))?;

    // Vault path → name inside attachments/. Two files with one name both keep theirs.
    let mut attachments: HashMap<String, String> = HashMap::new();
    let mut used_names: HashSet<String> = HashSet::new();
    let note_folder = folder_of(note.as_str());
    let (text, _) = map_link_targets(&content, &mut |target| {
        let linked = linked_file(vault, note_folder, target)?;
        let name = match attachments.get(&linked) {
            Some(name) => name.clone(),
            None => {
                let name = free_name(linked.rsplit('/').next().unwrap_or(&linked), &used_names);
                used_names.insert(name.clone());
                attachments.insert(linked, name.clone());
                name
            }
        };
        let (_, anchor) = split_anchor(target);
        Some(format!("{ATTACHMENTS}/{}{anchor}", encode_target(&name)))
    });

    if !attachments.is_empty() {
        let attachments_folder = folder.join(ATTACHMENTS);
        fs::create_dir_all(&attachments_folder).map_err(IoError::file("create", ATTACHMENTS))?;
        for (linked, name) in &attachments {
            let source = VaultPath::parse(linked)?.to_fs_path(vault.root());
            fs::copy(&source, attachments_folder.join(name))
                .map_err(IoError::file("copy", linked.clone()))?;
        }
    }
    let note_file = folder.join(note.file_name());
    fs::write(&note_file, text).map_err(IoError::file("write", note.to_string()))?;
    Ok(folder)
}

/// The vault file a link points at, if it is a local file other than a note.
pub fn linked_file(vault: &Vault, note_folder: &str, target: &str) -> Option<String> {
    if !is_local_target(target) {
        return None;
    }
    let (path, _) = split_anchor(target);
    let linked = resolve(note_folder, &percent_decode(path))?;
    let full = VaultPath::parse(&linked).ok()?.to_fs_path(vault.root());
    let is_attachment = full.is_file() && !has_extension(&linked, "md");
    is_attachment.then_some(linked)
}

fn free_name(name: &str, used: &HashSet<String>) -> String {
    let mut number = 1;
    while used.contains(&numbered(name, number)) {
        number += 1;
    }
    numbered(name, number)
}

/// Creates `<into>/<name>`, numbered if taken, so an export never replaces anything.
fn new_folder(into: &Path, name: &str) -> Result<PathBuf, IoError> {
    for number in 1..=MAX_NUMBER {
        let folder = into.join(numbered(name, number));
        match fs::create_dir(&folder) {
            Ok(()) => return Ok(folder),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(IoError::file("create", folder.display().to_string())(error)),
        }
    }
    Err(IoError::Vault(vault_core::VaultError::AlreadyExists(
        name.to_string(),
    )))
}
