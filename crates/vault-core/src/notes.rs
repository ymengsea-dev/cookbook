//! Creating, saving, renaming, moving and deleting notes. Every write goes through `VaultWriter`.

use std::fs;

use crate::front_matter::{PropertyValue, set_property};
use crate::keys::ensure_key;
use crate::trash::{TrashEntry, list_trash, move_to_trash, restore_from_trash};
use crate::{ContentHash, NoteFile, Vault, VaultError, VaultPath};

const UNTITLED: &str = "Untitled";

impl Vault {
    /// Saves an edit from the editor. Adds a `key` on the first real save (V-4).
    /// Saving text that matches the file writes nothing, so untouched notes stay byte for byte.
    pub fn save_note(
        &self,
        path: &VaultPath,
        content: &str,
        expected: &ContentHash,
    ) -> Result<NoteFile, VaultError> {
        let on_disk = self.read_note(path)?;
        if &on_disk.hash != expected {
            return Err(VaultError::ChangedOnDisk(path.to_string()));
        }
        if on_disk.content == content {
            return Ok(on_disk);
        }
        let with_key = ensure_key(content)?;
        self.write_checked(path, &with_key, expected)
    }

    /// Sets one front matter property, changing only that line of the file (V-3).
    pub fn set_note_property(
        &self,
        path: &VaultPath,
        key: &str,
        value: &PropertyValue,
        expected: &ContentHash,
    ) -> Result<NoteFile, VaultError> {
        let note = self.read_note(path)?;
        if &note.hash != expected {
            return Err(VaultError::ChangedOnDisk(path.to_string()));
        }
        let updated = set_property(&note.content, key, value)?;
        self.write_checked(path, &updated, expected)
    }

    /// Writes `content` only if the file on disk still has the `expected` hash.
    pub(crate) fn write_checked(
        &self,
        path: &VaultPath,
        content: &str,
        expected: &ContentHash,
    ) -> Result<NoteFile, VaultError> {
        reject_internal(path)?;
        let target = path.to_fs_path(self.root());
        let on_disk = fs::read(&target).map_err(VaultError::io("save", path.to_string()))?;
        if &ContentHash::of(&on_disk) != expected {
            return Err(VaultError::ChangedOnDisk(path.to_string()));
        }
        let hash = self
            .writer()
            .write(&target, content.as_bytes(), path.as_str())?;
        Ok(NoteFile {
            path: path.clone(),
            content: content.to_string(),
            hash,
        })
    }

    /// Creates an empty note named "Untitled", "Untitled 2", … in `folder` (or the vault root).
    pub fn create_note(&self, folder: Option<&VaultPath>) -> Result<NoteFile, VaultError> {
        if let Some(folder) = folder {
            reject_internal(folder)?;
        }
        for number in 1..=1000 {
            let name = untitled_name(number);
            let path = VaultPath::child_of(folder, &name)?;
            let target = path.to_fs_path(self.root());
            match self.writer().create_new(&target, b"", path.as_str()) {
                Ok(hash) => {
                    return Ok(NoteFile {
                        path,
                        content: String::new(),
                        hash,
                    });
                }
                Err(VaultError::AlreadyExists(_)) => continue,
                Err(error) => return Err(error),
            }
        }
        Err(VaultError::AlreadyExists(format!("{UNTITLED}.md")))
    }

    /// Renames a note or folder in place. Notes keep their `.md` extension.
    pub fn rename(&self, path: &VaultPath, new_name: &str) -> Result<VaultPath, VaultError> {
        let name = clean_new_name(path, new_name)?;
        let target = VaultPath::child_of(path.parent().as_ref(), &name)?;
        self.move_path(path, &target)
    }

    /// Moves a note or folder into `folder`, or to the vault root when `folder` is `None`.
    pub fn move_into(
        &self,
        path: &VaultPath,
        folder: Option<&VaultPath>,
    ) -> Result<VaultPath, VaultError> {
        if let Some(folder) = folder {
            let inside_itself = folder == path || folder.as_str().starts_with(&format!("{path}/"));
            if inside_itself {
                return Err(VaultError::InvalidPath(folder.to_string()));
            }
        }
        let target = VaultPath::child_of(folder, path.file_name())?;
        self.move_path(path, &target)
    }

    /// Moves a note or folder into `.vault/trash`, where it can be restored.
    pub fn delete(&self, path: &VaultPath) -> Result<TrashEntry, VaultError> {
        reject_internal(path)?;
        move_to_trash(self.root(), path)
    }

    pub fn trash(&self) -> Result<Vec<TrashEntry>, VaultError> {
        list_trash(self.root())
    }

    pub fn restore(&self, trash_id: &str) -> Result<VaultPath, VaultError> {
        restore_from_trash(self.root(), trash_id)
    }

    fn move_path(&self, from: &VaultPath, to: &VaultPath) -> Result<VaultPath, VaultError> {
        reject_internal(from)?;
        reject_internal(to)?;
        if from == to {
            return Ok(to.clone());
        }
        let target = to.to_fs_path(self.root());
        // macOS ignores case, so "plan.md" -> "Plan.md" finds itself; that rename is allowed.
        let only_case_changes = from.as_str().eq_ignore_ascii_case(to.as_str());
        if target.symlink_metadata().is_ok() && !only_case_changes {
            return Err(VaultError::AlreadyExists(to.to_string()));
        }
        fs::rename(from.to_fs_path(self.root()), &target)
            .map_err(VaultError::io("move", from.to_string()))?;
        Ok(to.clone())
    }
}

fn untitled_name(number: u32) -> String {
    if number == 1 {
        format!("{UNTITLED}.md")
    } else {
        format!("{UNTITLED} {number}.md")
    }
}

/// Trims the name, rejects hidden or nested names, and keeps `.md` on notes.
fn clean_new_name(path: &VaultPath, new_name: &str) -> Result<String, VaultError> {
    let name = new_name.trim();
    if name.is_empty() || name.starts_with('.') || name.contains('/') {
        return Err(VaultError::InvalidPath(new_name.to_string()));
    }
    let needs_extension = path.is_markdown() && !name.to_lowercase().ends_with(".md");
    Ok(if needs_extension {
        format!("{name}.md")
    } else {
        name.to_string()
    })
}

fn reject_internal(path: &VaultPath) -> Result<(), VaultError> {
    if path.is_internal() {
        return Err(VaultError::InvalidPath(path.to_string()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn path(raw: &str) -> VaultPath {
        VaultPath::parse(raw).unwrap()
    }

    #[test]
    fn save_writes_when_the_file_is_unchanged() {
        let (dir, vault) = vault_with(&[("Note.md", "old")]);
        let note = vault.read_note(&path("Note.md")).unwrap();

        vault.save_note(&note.path, "new", &note.hash).unwrap();

        let saved = fs::read_to_string(dir.path().join("Note.md")).unwrap();
        assert!(saved.ends_with("\n---\nnew"), "{saved}");
    }

    #[test]
    fn save_refuses_when_the_file_changed_on_disk() {
        let (dir, vault) = vault_with(&[("Note.md", "old")]);
        let note = vault.read_note(&path("Note.md")).unwrap();
        fs::write(dir.path().join("Note.md"), "edited elsewhere").unwrap();

        let result = vault.save_note(&note.path, "mine", &note.hash);

        assert!(matches!(result, Err(VaultError::ChangedOnDisk(_))));
        assert_eq!(
            fs::read_to_string(dir.path().join("Note.md")).unwrap(),
            "edited elsewhere"
        );
    }

    #[test]
    fn new_notes_get_numbered_names() {
        let (_dir, vault) = vault_with(&[("Untitled.md", "taken")]);
        let note = vault.create_note(None).unwrap();
        assert_eq!(note.path.as_str(), "Untitled 2.md");
    }

    #[test]
    fn rename_keeps_the_extension_and_refuses_to_overwrite() {
        let (_dir, vault) = vault_with(&[("a.md", "a"), ("b.md", "b")]);
        assert_eq!(
            vault.rename(&path("a.md"), "Plan").unwrap().as_str(),
            "Plan.md"
        );
        assert!(matches!(
            vault.rename(&path("Plan.md"), "b"),
            Err(VaultError::AlreadyExists(_))
        ));
    }

    #[test]
    fn rename_can_change_only_the_case() {
        let (_dir, vault) = vault_with(&[("plan.md", "a")]);
        assert_eq!(
            vault.rename(&path("plan.md"), "Plan").unwrap().as_str(),
            "Plan.md"
        );
    }

    #[test]
    fn move_into_a_folder_and_never_into_itself() {
        let (_dir, vault) = vault_with(&[("Note.md", "n"), ("Projects/Web/Plan.md", "p")]);
        let moved = vault
            .move_into(&path("Note.md"), Some(&path("Projects")))
            .unwrap();
        assert_eq!(moved.as_str(), "Projects/Note.md");
        assert!(
            vault
                .move_into(&path("Projects"), Some(&path("Projects/Web")))
                .is_err()
        );
    }

    #[test]
    fn delete_then_restore_gives_back_the_same_bytes_in_the_same_place() {
        let (dir, vault) = vault_with(&[("Inbox/Note.md", "keep these bytes\r\n")]);

        let entry = vault.delete(&path("Inbox/Note.md")).unwrap();
        assert!(!dir.path().join("Inbox/Note.md").exists());
        assert_eq!(vault.trash().unwrap(), vec![entry.clone()]);

        let restored = vault.restore(&entry.id).unwrap();
        assert_eq!(restored.as_str(), "Inbox/Note.md");
        assert_eq!(
            fs::read_to_string(dir.path().join("Inbox/Note.md")).unwrap(),
            "keep these bytes\r\n"
        );
        assert!(vault.trash().unwrap().is_empty());
    }

    #[test]
    fn restore_refuses_when_the_place_is_taken() {
        let (dir, vault) = vault_with(&[("Note.md", "old")]);
        let entry = vault.delete(&path("Note.md")).unwrap();
        fs::write(dir.path().join("Note.md"), "new").unwrap();

        assert!(matches!(
            vault.restore(&entry.id),
            Err(VaultError::AlreadyExists(_))
        ));
    }

    #[test]
    fn the_vault_folder_itself_is_off_limits() {
        let (_dir, vault) = vault_with(&[("Note.md", "n")]);
        assert!(vault.delete(&path(".vault")).is_err());
        assert!(
            vault
                .move_into(&path("Note.md"), Some(&path(".vault")))
                .is_err()
        );
    }
}
