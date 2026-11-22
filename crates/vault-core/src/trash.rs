use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use ts_rs::TS;

use crate::{VAULT_DIR, VaultError, VaultPath};

/// Each deleted item lives in its own folder: `.vault/trash/<id>/<file name>`,
/// with its original path stored next to it in `.vault/trash/<id>/.origin` (V-8).
const ORIGIN_FILE: &str = ".origin";

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrashEntry {
    pub id: String,
    /// Where the item was before it was deleted.
    pub path: VaultPath,
    /// Milliseconds since 1970, from the id.
    #[ts(type = "number")]
    pub deleted_at: u64,
}

pub(crate) fn trash_folder(root: &Path) -> PathBuf {
    root.join(VAULT_DIR).join("trash")
}

/// Moves a note or folder into the trash and returns its trash entry.
pub(crate) fn move_to_trash(root: &Path, path: &VaultPath) -> Result<TrashEntry, VaultError> {
    let deleted_at = now_millis();
    let id = new_id(deleted_at);
    let slot = trash_folder(root).join(&id);
    fs::create_dir_all(&slot).map_err(VaultError::io(
        "create the trash folder for",
        path.to_string(),
    ))?;
    fs::write(slot.join(ORIGIN_FILE), path.as_str())
        .map_err(VaultError::io("delete", path.to_string()))?;

    let source = path.to_fs_path(root);
    if let Err(error) = fs::rename(&source, slot.join(path.file_name())) {
        let _ = fs::remove_dir_all(&slot);
        return Err(VaultError::io("delete", path.to_string())(error));
    }
    Ok(TrashEntry {
        id,
        path: path.clone(),
        deleted_at,
    })
}

/// Lists deleted items, newest first. Slots without a readable origin are skipped.
pub(crate) fn list_trash(root: &Path) -> Result<Vec<TrashEntry>, VaultError> {
    let folder = trash_folder(root);
    if !folder.exists() {
        return Ok(Vec::new());
    }
    let slots = fs::read_dir(&folder).map_err(VaultError::io("read", ".vault/trash"))?;

    let mut entries = Vec::new();
    for slot in slots.flatten() {
        let Ok(id) = slot.file_name().into_string() else {
            continue;
        };
        if let Some(entry) = read_entry(&folder, &id) {
            entries.push(entry);
        }
    }
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.deleted_at));
    Ok(entries)
}

/// Puts a deleted item back where it was. Fails if something new is in its place.
pub(crate) fn restore_from_trash(root: &Path, id: &str) -> Result<VaultPath, VaultError> {
    let folder = trash_folder(root);
    let entry =
        read_entry(&folder, id).ok_or_else(|| VaultError::NotFound(format!("Trash item {id}")))?;
    let target = entry.path.to_fs_path(root);
    if target.symlink_metadata().is_ok() {
        return Err(VaultError::AlreadyExists(entry.path.to_string()));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(VaultError::io("restore", entry.path.to_string()))?;
    }

    let slot = folder.join(id);
    fs::rename(slot.join(entry.path.file_name()), &target)
        .map_err(VaultError::io("restore", entry.path.to_string()))?;
    let _ = fs::remove_dir_all(&slot);
    Ok(entry.path)
}

fn read_entry(folder: &Path, id: &str) -> Option<TrashEntry> {
    // An id is one folder name; anything else could reach outside the trash.
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.starts_with('.') {
        return None;
    }
    let origin = fs::read_to_string(folder.join(id).join(ORIGIN_FILE)).ok()?;
    let path = VaultPath::parse(&origin).ok()?;
    let deleted_at = id.split('-').next()?.parse().ok()?;
    Some(TrashEntry {
        id: id.to_string(),
        path,
        deleted_at,
    })
}

fn new_id(millis: u64) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!("{millis}-{}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn now_millis() -> u64 {
    let since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    u64::try_from(since_epoch.as_millis()).unwrap_or(u64::MAX)
}
