use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::VaultError;

/// The app's own folder inside every vault.
pub const VAULT_DIR: &str = ".vault";

/// A file or folder path inside the vault, relative to its root, with `/` separators.
/// It can only be built through `parse`, so it can never point outside the vault.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(try_from = "String", into = "String")]
#[ts(export, type = "string")]
pub struct VaultPath(String);

impl VaultPath {
    pub fn parse(raw: &str) -> Result<Self, VaultError> {
        let trimmed = raw.trim_matches('/');
        if trimmed.is_empty() {
            return Err(VaultError::InvalidPath(raw.to_string()));
        }
        for part in trimmed.split('/') {
            if !is_valid_name(part) {
                return Err(VaultError::InvalidPath(raw.to_string()));
            }
        }
        Ok(Self(trimmed.to_string()))
    }

    /// Converts an absolute file-system path back into a vault path.
    pub fn from_fs_path(root: &Path, path: &Path) -> Option<Self> {
        let relative = path.strip_prefix(root).ok()?;
        let mut parts = Vec::new();
        for component in relative.components() {
            match component {
                Component::Normal(part) => parts.push(part.to_str()?),
                _ => return None,
            }
        }
        Self::parse(&parts.join("/")).ok()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The last part of the path, for example `Plan.md`.
    pub fn file_name(&self) -> &str {
        self.0.rsplit('/').next().unwrap_or(&self.0)
    }

    /// The folder that holds this path, or `None` at the vault root.
    pub fn parent(&self) -> Option<Self> {
        self.0
            .rsplit_once('/')
            .map(|(parent, _)| Self(parent.to_string()))
    }

    pub fn join(&self, name: &str) -> Result<Self, VaultError> {
        Self::parse(&format!("{}/{}", self.0, name))
    }

    /// Builds `name` inside `folder`, or at the vault root when `folder` is `None`.
    pub fn child_of(folder: Option<&Self>, name: &str) -> Result<Self, VaultError> {
        match folder {
            Some(folder) => folder.join(name),
            None => Self::parse(name),
        }
    }

    pub fn to_fs_path(&self, root: &Path) -> PathBuf {
        let mut path = root.to_path_buf();
        path.extend(self.0.split('/'));
        path
    }

    /// True for anything inside `.vault/`, which is never a note.
    pub fn is_internal(&self) -> bool {
        self.0 == VAULT_DIR || self.0.starts_with(".vault/")
    }

    pub fn is_markdown(&self) -> bool {
        is_markdown_name(self.file_name())
    }
}

pub(crate) fn is_markdown_name(name: &str) -> bool {
    name.to_lowercase().ends_with(".md")
}

fn is_valid_name(part: &str) -> bool {
    !part.is_empty() && part != "." && part != ".." && !part.contains('\\') && !part.contains('\0')
}

impl TryFrom<String> for VaultPath {
    type Error = VaultError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<VaultPath> for String {
    fn from(path: VaultPath) -> Self {
        path.0
    }
}

impl std::fmt::Display for VaultPath {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_paths() {
        let path = VaultPath::parse("Projects/Website/Plan.md").unwrap();
        assert_eq!(path.file_name(), "Plan.md");
        assert_eq!(path.parent().unwrap().as_str(), "Projects/Website");
        assert!(path.is_markdown());
    }

    #[test]
    fn rejects_paths_that_escape_the_vault() {
        for raw in [
            "",
            "/",
            "../secret.md",
            "a/../../b.md",
            "a//b.md",
            "./a.md",
            "a\\b.md",
        ] {
            assert!(VaultPath::parse(raw).is_err(), "{raw} should be rejected");
        }
    }

    #[test]
    fn spots_internal_paths() {
        assert!(
            VaultPath::parse(".vault/settings.json")
                .unwrap()
                .is_internal()
        );
        assert!(VaultPath::parse(".vault").unwrap().is_internal());
        assert!(
            !VaultPath::parse("Projects/.vault/odd.md")
                .unwrap()
                .is_internal()
        );
    }

    #[test]
    fn converts_from_file_system_paths() {
        let root = Path::new("/vault");
        let path = VaultPath::from_fs_path(root, Path::new("/vault/Inbox/Note.md")).unwrap();
        assert_eq!(path.as_str(), "Inbox/Note.md");
        assert!(VaultPath::from_fs_path(root, Path::new("/elsewhere/Note.md")).is_none());
    }
}
