//! Finds a runner's program. An app opened from the Finder gets a short PATH without
//! Homebrew, so the usual install folders are searched too.

use std::env;
use std::ffi::OsString;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

const USUAL_FOLDERS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
];

/// The folders to search, in order: this app's PATH, then the usual install folders.
pub fn search_folders() -> Vec<PathBuf> {
    let mut folders: Vec<PathBuf> = env::var_os("PATH")
        .map(|path| env::split_paths(&path).collect())
        .unwrap_or_default();
    // An empty or relative entry would search the app's own working folder.
    folders.retain(|folder| folder.is_absolute());
    for usual in USUAL_FOLDERS {
        let usual = PathBuf::from(usual);
        if !folders.contains(&usual) {
            folders.push(usual);
        }
    }
    folders
}

/// The PATH given to the program, so a script can call `npm` or `git` like in Terminal.
pub fn program_path_variable() -> OsString {
    env::join_paths(search_folders()).unwrap_or_default()
}

/// The full path of `command`: the command itself when it is a path, else the first
/// program with that name in `folders`.
pub fn find_program(command: &str, folders: &[PathBuf]) -> Option<PathBuf> {
    if command.contains('/') {
        let path = expand_home(command);
        return is_executable(&path).then_some(path);
    }
    folders
        .iter()
        .map(|folder| folder.join(command))
        .find(|path| is_executable(path))
}

// Lets settings say `~/.nvm/versions/node/v22.16.0/bin/node`.
fn expand_home(command: &str) -> PathBuf {
    match (command.strip_prefix("~/"), env::var_os("HOME")) {
        (Some(rest), Some(home)) => PathBuf::from(home).join(rest),
        _ => PathBuf::from(command),
    }
}

fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_program_by_name_in_the_folders() {
        let found = find_program("sh", &[PathBuf::from("/nowhere"), PathBuf::from("/bin")]);
        assert_eq!(found, Some(PathBuf::from("/bin/sh")));
    }

    #[test]
    fn a_full_path_is_used_as_it_is() {
        assert_eq!(find_program("/bin/sh", &[]), Some(PathBuf::from("/bin/sh")));
    }

    #[test]
    fn a_missing_or_non_executable_program_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("notes.txt"), "not a program").unwrap();
        let folders = [dir.path().to_path_buf()];

        assert_eq!(find_program("notes.txt", &folders), None);
        assert_eq!(find_program("no-such-interpreter", &folders), None);
    }

    #[test]
    fn the_usual_folders_are_always_searched() {
        let folders = search_folders();
        assert!(folders.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(folders.iter().all(|folder| folder.is_absolute()));
    }
}
