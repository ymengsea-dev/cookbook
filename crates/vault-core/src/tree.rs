use std::fs;
use std::path::Path;

use serde::Serialize;
use ts_rs::TS;

use crate::vault_path::is_markdown_name;
use crate::{VaultError, VaultPath};

/// One folder or note in the sidebar tree.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TreeEntry {
    pub path: VaultPath,
    pub name: String,
    pub kind: TreeEntryKind,
    pub children: Vec<TreeEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TreeEntryKind {
    Folder,
    Note,
}

/// Lists every folder and `.md` file under `root`, folders first, then by name.
/// Hidden files, `.vault/` and symbolic links are skipped.
pub fn read_tree(root: &Path) -> Result<Vec<TreeEntry>, VaultError> {
    read_folder(root, None)
}

fn read_folder(root: &Path, folder: Option<&VaultPath>) -> Result<Vec<TreeEntry>, VaultError> {
    let folder_path = folder.map_or_else(|| root.to_path_buf(), |folder| folder.to_fs_path(root));
    let folder_label = folder.map_or_else(String::new, ToString::to_string);
    let items =
        fs::read_dir(&folder_path).map_err(VaultError::io("read folder", folder_label.clone()))?;

    let mut entries = Vec::new();
    for item in items {
        let item = item.map_err(VaultError::io("read folder", folder_label.clone()))?;
        // Names that are not valid UTF-8 cannot be shown or addressed, so they are skipped.
        let Ok(name) = item.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }

        let path = VaultPath::child_of(folder, &name)?;
        let file_type = item
            .file_type()
            .map_err(VaultError::io("read", path.to_string()))?;
        if file_type.is_dir() {
            let children = read_folder(root, Some(&path))?;
            entries.push(TreeEntry {
                path,
                name,
                kind: TreeEntryKind::Folder,
                children,
            });
        } else if file_type.is_file() && is_markdown_name(&name) {
            entries.push(TreeEntry {
                path,
                name,
                kind: TreeEntryKind::Note,
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(compare_entries);
    Ok(entries)
}

fn compare_entries(a: &TreeEntry, b: &TreeEntry) -> std::cmp::Ordering {
    let a_is_note = a.kind == TreeEntryKind::Note;
    let b_is_note = b.kind == TreeEntryKind::Note;
    a_is_note
        .cmp(&b_is_note)
        .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_folders_first_and_skips_hidden_and_other_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("Projects/Website")).unwrap();
        fs::create_dir_all(root.join(".vault/trash")).unwrap();
        fs::write(root.join("b.md"), "b").unwrap();
        fs::write(root.join("A.md"), "a").unwrap();
        fs::write(root.join("photo.png"), "").unwrap();
        fs::write(root.join(".hidden.md"), "").unwrap();
        fs::write(root.join("Projects/Website/Plan.md"), "plan").unwrap();

        let tree = read_tree(root).unwrap();

        let names: Vec<&str> = tree.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, ["Projects", "A.md", "b.md"]);
        let plan = &tree[0].children[0].children[0];
        assert_eq!(plan.path.as_str(), "Projects/Website/Plan.md");
        assert_eq!(plan.kind, TreeEntryKind::Note);
    }
}
