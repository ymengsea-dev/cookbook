//! Where each imported file goes (IO-1 to IO-3). Nothing is written here: the plan only
//! picks free names, so the import can fix links before writing.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use vault_core::{Vault, VaultPath, is_portable_internal};

use crate::IoError;
use crate::names::{clean_name, has_extension, numbered};
use crate::walk::files_under;

/// Give up numbering after this many clashes for one name.
const MAX_NUMBER: u32 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    Note,
    Attachment,
    /// A synced file from `.vault/`, such as a view. Skipped if the vault already has one.
    Internal,
}

#[derive(Debug, Clone)]
pub struct PlannedItem {
    pub source: PathBuf,
    /// Its path inside what is being imported, `/`-separated.
    pub from: String,
    pub to: VaultPath,
    pub kind: ItemKind,
}

#[derive(Debug, Default)]
pub struct Plan {
    pub items: Vec<PlannedItem>,
    /// Internal files the vault already has: (path, reason).
    pub skipped: Vec<(String, String)>,
    /// The folder a folder import went into.
    pub destination: Option<VaultPath>,
}

/// A folder comes in as a new top-level folder named after it, so nothing inside clashes.
pub fn plan_folder(vault: &Vault, folder: &Path) -> Result<Plan, IoError> {
    let name = folder
        .file_name()
        .and_then(|name| name.to_str())
        .map_or_else(|| "Imported".to_string(), clean_name);
    let destination = free_path(vault, None, &name, &HashSet::new())?;
    let mut plan = plan_tree(vault, folder, Some(&destination), false)?;
    plan.destination = Some(destination);
    Ok(plan)
}

/// Single `.md` or `.txt` files go to the vault root (IO-2).
pub fn plan_files(vault: &Vault, files: &[PathBuf]) -> Result<Plan, IoError> {
    let mut plan = Plan::default();
    let mut taken = HashSet::new();
    for file in files {
        let name = file
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled.md");
        let from = name.to_string();
        if !is_note_name(name) {
            plan.skipped.push((
                from,
                "Only .md and .txt files can be imported as notes.".to_string(),
            ));
            continue;
        }
        let to = free_path(vault, None, &note_name(name), &taken)?;
        taken.insert(to.as_str().to_string());
        plan.items.push(PlannedItem {
            source: file.clone(),
            from,
            to,
            kind: ItemKind::Note,
        });
    }
    Ok(plan)
}

/// Everything under `root`, keeping its folders, placed under `destination` (or the root).
pub fn plan_tree(
    vault: &Vault,
    root: &Path,
    destination: Option<&VaultPath>,
    with_vault_dir: bool,
) -> Result<Plan, IoError> {
    let mut plan = Plan::default();
    let mut taken = HashSet::new();
    for from in files_under(root, with_vault_dir)? {
        let source = root.join(&from);
        if from.starts_with(".vault/") {
            plan_internal(vault, &from, source, &mut plan)?;
            continue;
        }
        let mut parts: Vec<String> = from.split('/').map(clean_name).collect();
        let Some(file_name) = parts.pop() else {
            continue;
        };
        let kind = if is_note_name(&file_name) {
            ItemKind::Note
        } else {
            ItemKind::Attachment
        };
        let file_name = if kind == ItemKind::Note {
            note_name(&file_name)
        } else {
            file_name
        };
        let folder = join_folder(destination, &parts)?;
        let to = free_path(vault, folder.as_ref(), &file_name, &taken)?;
        taken.insert(to.as_str().to_string());
        plan.items.push(PlannedItem {
            source,
            from,
            to,
            kind,
        });
    }
    Ok(plan)
}

fn plan_internal(
    vault: &Vault,
    from: &str,
    source: PathBuf,
    plan: &mut Plan,
) -> Result<(), IoError> {
    if !is_portable_internal(from) {
        // Device-only files, such as settings.local.json with its code runners, never come in.
        return Ok(());
    }
    let to = VaultPath::parse(from)?;
    if to.to_fs_path(vault.root()).exists() {
        plan.skipped.push((
            from.to_string(),
            "This vault already has this file.".to_string(),
        ));
        return Ok(());
    }
    plan.items.push(PlannedItem {
        source,
        from: from.to_string(),
        to,
        kind: ItemKind::Internal,
    });
    Ok(())
}

fn join_folder(
    destination: Option<&VaultPath>,
    parts: &[String],
) -> Result<Option<VaultPath>, IoError> {
    let mut folder = destination.cloned();
    for part in parts {
        folder = Some(VaultPath::child_of(folder.as_ref(), part)?);
    }
    Ok(folder)
}

/// `name` in `folder`, numbered until it is free on disk and not already planned.
fn free_path(
    vault: &Vault,
    folder: Option<&VaultPath>,
    name: &str,
    taken: &HashSet<String>,
) -> Result<VaultPath, IoError> {
    for number in 1..=MAX_NUMBER {
        let path = VaultPath::child_of(folder, &numbered(name, number))?;
        let free = !taken.contains(path.as_str()) && !path.to_fs_path(vault.root()).exists();
        if free {
            return Ok(path);
        }
    }
    Err(IoError::Vault(vault_core::VaultError::AlreadyExists(
        name.to_string(),
    )))
}

fn is_note_name(name: &str) -> bool {
    has_extension(name, "md") || has_extension(name, "txt")
}

/// Text files become notes: `Ideas.txt` comes in as `Ideas.md`.
fn note_name(name: &str) -> String {
    if has_extension(name, "txt") {
        return format!("{}.md", &name[..name.len() - ".txt".len()]);
    }
    name.to_string()
}
