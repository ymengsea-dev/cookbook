use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use ts_rs::TS;

use crate::tree::{TreeEntry, read_tree};
use crate::writer::VaultWriter;
use crate::{ContentHash, VaultError, VaultPath};

/// A note's text as read from disk, with the hash used to detect outside changes.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteFile {
    pub path: VaultPath,
    pub content: String,
    pub hash: ContentHash,
}

/// An open vault: any folder the user picked. The files in it are the only source of truth.
#[derive(Debug)]
pub struct Vault {
    root: PathBuf,
    writer: VaultWriter,
}

impl Vault {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, VaultError> {
        let root = root.as_ref();
        let label = root.display().to_string();
        let root = root
            .canonicalize()
            .map_err(VaultError::io("open", label.clone()))?;
        if !root.is_dir() {
            return Err(VaultError::NotAFolder(label));
        }
        Ok(Self {
            root,
            writer: VaultWriter::default(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn writer(&self) -> &VaultWriter {
        &self.writer
    }

    /// The folder's name, shown as the vault's name.
    pub fn name(&self) -> String {
        self.root.file_name().map_or_else(
            || self.root.display().to_string(),
            |name| name.to_string_lossy().into_owned(),
        )
    }

    pub fn tree(&self) -> Result<Vec<TreeEntry>, VaultError> {
        read_tree(&self.root)
    }

    /// Every note in the vault, depth first.
    pub fn note_paths(&self) -> Result<Vec<VaultPath>, VaultError> {
        Ok(crate::keys::note_paths(&self.tree()?))
    }

    pub fn read_note(&self, path: &VaultPath) -> Result<NoteFile, VaultError> {
        let bytes = fs::read(path.to_fs_path(&self.root))
            .map_err(VaultError::io("read", path.to_string()))?;
        let hash = ContentHash::of(&bytes);
        let content =
            String::from_utf8(bytes).map_err(|_| VaultError::NotText(path.to_string()))?;
        Ok(NoteFile {
            path: path.clone(),
            content,
            hash,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_note_exactly_as_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let text = "---\ntags: [a]\n---\n# Title\r\nBody with ខ្មែរ and 日本語\n";
        fs::write(dir.path().join("Note.md"), text).unwrap();

        let vault = Vault::open(dir.path()).unwrap();
        let note = vault
            .read_note(&VaultPath::parse("Note.md").unwrap())
            .unwrap();

        assert_eq!(note.content, text);
        assert_eq!(note.hash, ContentHash::of(text.as_bytes()));
    }

    #[test]
    fn opening_a_file_instead_of_a_folder_fails() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("Note.md");
        fs::write(&file, "").unwrap();
        assert!(matches!(Vault::open(&file), Err(VaultError::NotAFolder(_))));
    }

    #[test]
    fn missing_note_reports_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let result = vault.read_note(&VaultPath::parse("Missing.md").unwrap());
        assert!(matches!(result, Err(VaultError::NotFound(_))));
    }
}
