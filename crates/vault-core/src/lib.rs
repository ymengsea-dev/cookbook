//! Notes, front matter, paths, atomic writes and trash.
//!
//! This crate must build and test without Tauri and without any network crate.

use std::path::{Component, Path};

/// The app's own folder inside every vault.
pub const VAULT_DIR: &str = ".vault";

/// Whether a vault-relative path points inside the app's `.vault` folder,
/// which is never treated as a note.
pub fn is_internal(relative: &Path) -> bool {
    matches!(relative.components().next(), Some(Component::Normal(first)) if first == VAULT_DIR)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_inside_vault_dir_are_internal() {
        assert!(is_internal(Path::new(".vault/settings.json")));
        assert!(is_internal(Path::new(".vault")));
    }

    #[test]
    fn notes_are_not_internal() {
        assert!(!is_internal(Path::new("Inbox/Meeting notes.md")));
        assert!(!is_internal(Path::new("Projects/.vault/odd.md")));
        assert!(!is_internal(Path::new("")));
    }
}
