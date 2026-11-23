use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};

use crate::{ContentHash, VaultError};

/// The only way the app writes files. Every write goes to a temp file first, is flushed,
/// then renamed over the target, so a crash never leaves half a file (V-6).
#[derive(Debug, Default)]
pub struct VaultWriter {
    /// Hash of the last bytes the app wrote to each file, so the watcher can ignore them.
    own_writes: Mutex<HashMap<PathBuf, ContentHash>>,
}

impl VaultWriter {
    /// Replaces `target` with `bytes` atomically.
    pub fn write(
        &self,
        target: &Path,
        bytes: &[u8],
        label: &str,
    ) -> Result<ContentHash, VaultError> {
        let temp = temp_path_for(target);
        write_temp_file(&temp, bytes, label)?;
        if let Err(error) = fs::rename(&temp, target) {
            let _ = fs::remove_file(&temp);
            return Err(VaultError::io("save", label)(error));
        }
        sync_parent_folder(target);
        Ok(self.remember(target, bytes))
    }

    /// Creates a new file and fails if one already exists at `target`.
    pub fn create_new(
        &self,
        target: &Path,
        bytes: &[u8],
        label: &str,
    ) -> Result<ContentHash, VaultError> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)
            .map_err(VaultError::io("create", label))?;
        file.write_all(bytes)
            .map_err(VaultError::io("create", label))?;
        file.sync_all().map_err(VaultError::io("create", label))?;
        Ok(self.remember(target, bytes))
    }

    /// True when `hash` matches what the app itself last wrote to `target`.
    pub fn is_own_write(&self, target: &Path, hash: &ContentHash) -> bool {
        let own_writes = self
            .own_writes
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        own_writes.get(target) == Some(hash)
    }

    fn remember(&self, target: &Path, bytes: &[u8]) -> ContentHash {
        let hash = ContentHash::of(bytes);
        let mut own_writes = self
            .own_writes
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        own_writes.insert(target.to_path_buf(), hash.clone());
        hash
    }
}

/// A hidden temp file next to the target, so the final rename stays on the same disk.
fn temp_path_for(target: &Path) -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let name = target
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    target.with_file_name(format!(".{name}.{}-{count}.tmp", std::process::id()))
}

pub(crate) fn write_temp_file(temp: &Path, bytes: &[u8], label: &str) -> Result<(), VaultError> {
    let mut file = File::create(temp).map_err(VaultError::io("save", label))?;
    file.write_all(bytes)
        .map_err(VaultError::io("save", label))?;
    file.sync_all().map_err(VaultError::io("save", label))
}

/// Makes the rename itself durable. Best effort: some file systems refuse to sync a folder.
fn sync_parent_folder(target: &Path) {
    if let Some(parent) = target.parent()
        && let Ok(folder) = File::open(parent)
    {
        let _ = folder.sync_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_replaces_the_file_and_leaves_no_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("Note.md");
        fs::write(&target, "old").unwrap();

        let writer = VaultWriter::default();
        let hash = writer.write(&target, b"new", "Note.md").unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "new");
        assert!(writer.is_own_write(&target, &hash));
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_crash_before_the_rename_keeps_the_old_file_whole() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("Note.md");
        fs::write(&target, "old text").unwrap();

        // Simulates a crash: the temp file is written but the rename never happens.
        write_temp_file(
            &temp_path_for(&target),
            b"new text that never lands",
            "Note.md",
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "old text");
    }

    #[test]
    fn create_new_refuses_to_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("Note.md");
        fs::write(&target, "keep me").unwrap();

        let result = VaultWriter::default().create_new(&target, b"", "Note.md");

        assert!(matches!(result, Err(VaultError::AlreadyExists(_))));
        assert_eq!(fs::read_to_string(&target).unwrap(), "keep me");
    }
}
