//! Listing the files under a folder, as `/`-separated relative paths.

use std::fs;
use std::path::Path;

use crate::IoError;

/// Names that macOS and other tools leave behind, never worth importing or exporting.
const JUNK: &[&str] = &["__MACOSX", "Thumbs.db", "desktop.ini"];

/// Every regular file under `root`, sorted. Hidden names and symbolic links are skipped,
/// except a top-level `.vault` folder when `with_vault_dir` is set.
pub fn files_under(root: &Path, with_vault_dir: bool) -> Result<Vec<String>, IoError> {
    let mut found = Vec::new();
    collect(root, "", with_vault_dir, &mut found)?;
    found.sort();
    Ok(found)
}

fn collect(
    root: &Path,
    prefix: &str,
    with_vault_dir: bool,
    found: &mut Vec<String>,
) -> Result<(), IoError> {
    let folder = if prefix.is_empty() {
        root.to_path_buf()
    } else {
        root.join(prefix)
    };
    let items = fs::read_dir(&folder)
        .map_err(IoError::file("read folder", folder.display().to_string()))?;
    for item in items {
        let item = item.map_err(IoError::file("read folder", folder.display().to_string()))?;
        let Ok(name) = item.file_name().into_string() else {
            continue;
        };
        let keep_vault_dir = with_vault_dir && prefix.is_empty() && name == ".vault";
        if (name.starts_with('.') && !keep_vault_dir) || JUNK.contains(&name.as_str()) {
            continue;
        }
        let relative = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        let file_type = item
            .file_type()
            .map_err(IoError::file("read", relative.clone()))?;
        if file_type.is_dir() {
            collect(root, &relative, with_vault_dir, found)?;
        } else if file_type.is_file() {
            found.push(relative);
        }
    }
    Ok(())
}
