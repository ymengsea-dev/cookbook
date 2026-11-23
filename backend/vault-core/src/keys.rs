//! Stable note keys (V-4) and the "adopt vault" step that adds them in bulk (V-5).

use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use ts_rs::TS;
use ulid::Ulid;

use crate::front_matter::{PropertyValue, read_property, set_property};
use crate::tree::{TreeEntry, TreeEntryKind};
use crate::{VAULT_DIR, Vault, VaultError, VaultPath};

/// The one front matter key the app owns.
pub const KEY_PROPERTY: &str = "key";

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AdoptReport {
    pub updated: Vec<VaultPath>,
    pub skipped: Vec<SkippedNote>,
    /// Vault-relative folder holding a copy of every note before it changed.
    pub backup: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct SkippedNote {
    pub path: VaultPath,
    pub reason: String,
}

/// True when the note has a non-empty `key`. Notes with broken YAML count as keyed,
/// because the app must not rewrite front matter it cannot read.
pub fn has_key(content: &str) -> bool {
    match read_property(content, KEY_PROPERTY) {
        Ok(Some(PropertyValue::Text(key))) => !key.trim().is_empty(),
        Ok(Some(PropertyValue::Null) | None) => false,
        Ok(Some(_)) | Err(_) => true,
    }
}

/// Returns `content` with a new ULID `key`, or unchanged if it already has one.
pub fn ensure_key(content: &str) -> Result<String, VaultError> {
    if has_key(content) {
        return Ok(content.to_string());
    }
    let key = PropertyValue::Text(Ulid::generate().to_string());
    set_property(content, KEY_PROPERTY, &key)
}

/// Returns `content` with a fresh `key`, for a copy whose key another note already has (V-10).
pub fn replace_key(content: &str) -> Result<String, VaultError> {
    let key = PropertyValue::Text(Ulid::generate().to_string());
    set_property(content, KEY_PROPERTY, &key)
}

impl Vault {
    /// Every note that would get a key from "adopt vault", for the preview.
    pub fn notes_without_key(&self) -> Result<Vec<VaultPath>, VaultError> {
        let mut missing = Vec::new();
        for path in note_paths(&self.tree()?) {
            let note = self.read_note(&path)?;
            if !has_key(&note.content) {
                missing.push(path);
            }
        }
        Ok(missing)
    }

    /// Copies every note that needs a key into `.vault/backups/`, then adds the keys.
    /// A note that fails is skipped and reported; the others still get their keys.
    pub fn adopt(&self) -> Result<AdoptReport, VaultError> {
        let missing = self.notes_without_key()?;
        let backup = format!("{VAULT_DIR}/backups/adopt-{}", now_seconds());
        self.back_up(&missing, &backup)?;

        let mut report = AdoptReport {
            updated: Vec::new(),
            skipped: Vec::new(),
            backup,
        };
        for path in missing {
            match self.add_key(&path) {
                Ok(()) => report.updated.push(path),
                Err(error) => report.skipped.push(SkippedNote {
                    path,
                    reason: error.to_string(),
                }),
            }
        }
        Ok(report)
    }

    fn add_key(&self, path: &VaultPath) -> Result<(), VaultError> {
        let note = self.read_note(path)?;
        let with_key = ensure_key(&note.content)?;
        self.write_checked(path, &with_key, &note.hash)?;
        Ok(())
    }

    fn back_up(&self, notes: &[VaultPath], backup: &str) -> Result<(), VaultError> {
        let backup_root = self.root().join(backup);
        for path in notes {
            let target = path.to_fs_path(&backup_root);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(VaultError::io("back up", path.to_string()))?;
            }
            fs::copy(path.to_fs_path(self.root()), &target)
                .map_err(VaultError::io("back up", path.to_string()))?;
        }
        Ok(())
    }
}

/// Every note in the tree, depth first.
pub(crate) fn note_paths(entries: &[TreeEntry]) -> Vec<VaultPath> {
    let mut notes = Vec::new();
    for entry in entries {
        match entry.kind {
            TreeEntryKind::Note => notes.push(entry.path.clone()),
            TreeEntryKind::Folder => notes.extend(note_paths(&entry.children)),
        }
    }
    notes
}

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since_epoch| since_epoch.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ContentHash;

    fn vault_with(files: &[(&str, &str)]) -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        for (path, content) in files {
            let full = dir.path().join(path);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, content).unwrap();
        }
        let vault = Vault::open(dir.path()).unwrap();
        (dir, vault)
    }

    fn key_of(content: &str) -> String {
        match read_property(content, KEY_PROPERTY).unwrap() {
            Some(PropertyValue::Text(key)) => key,
            other => panic!("no key: {other:?}"),
        }
    }

    #[test]
    fn ensure_key_adds_a_ulid_once() {
        let with_key = ensure_key("# Title\n").unwrap();
        assert_eq!(key_of(&with_key).len(), 26);
        assert_eq!(ensure_key(&with_key).unwrap(), with_key);
    }

    #[test]
    fn broken_yaml_is_left_alone() {
        let broken = "---\na: [unclosed\n---\nBody\n";
        assert_eq!(ensure_key(broken).unwrap(), broken);
    }

    #[test]
    fn the_first_real_save_adds_a_key_and_an_unchanged_save_writes_nothing() {
        let (dir, vault) = vault_with(&[("Note.md", "Body\n")]);
        let path = VaultPath::parse("Note.md").unwrap();
        let note = vault.read_note(&path).unwrap();

        vault.save_note(&path, &note.content, &note.hash).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("Note.md")).unwrap(),
            "Body\n"
        );

        let saved = vault.save_note(&path, "Edited\n", &note.hash).unwrap();
        assert!(saved.content.ends_with("---\nEdited\n"));
        assert_eq!(saved.hash, ContentHash::of(saved.content.as_bytes()));
    }

    #[test]
    fn the_key_survives_rename_and_move() {
        let (_dir, vault) = vault_with(&[("Note.md", "Body\n"), ("Archive/.keep.md", "")]);
        let path = VaultPath::parse("Note.md").unwrap();
        let note = vault.read_note(&path).unwrap();
        let key = key_of(
            &vault
                .save_note(&path, "Edited\n", &note.hash)
                .unwrap()
                .content,
        );

        let renamed = vault.rename(&path, "Plan").unwrap();
        let moved = vault
            .move_into(&renamed, Some(&VaultPath::parse("Archive").unwrap()))
            .unwrap();

        assert_eq!(key_of(&vault.read_note(&moved).unwrap().content), key);
    }

    #[test]
    fn adopt_backs_up_then_adds_only_the_key_line() {
        let original = "---\ntags: [a]\n---\nBody\n";
        let (dir, vault) = vault_with(&[
            ("a.md", original),
            ("Folder/b.md", "No front matter\n"),
            ("c.md", "---\nkey: 01JD8Y3N6Q4F9K2V7R5T0W1XZB\n---\n"),
        ]);
        let missing = vault.notes_without_key().unwrap();
        assert_eq!(missing.len(), 2);

        let report = vault.adopt().unwrap();

        assert_eq!(report.updated.len(), 2);
        assert!(report.skipped.is_empty());
        let adopted = fs::read_to_string(dir.path().join("a.md")).unwrap();
        assert!(adopted.starts_with("---\ntags: [a]\nkey: "));
        assert!(adopted.ends_with("\n---\nBody\n"));
        let backup = dir.path().join(&report.backup).join("a.md");
        assert_eq!(fs::read_to_string(backup).unwrap(), original);
        assert!(vault.notes_without_key().unwrap().is_empty());
    }
}
