//! V-3: notes written by other editors survive the app byte for byte.

// Test helpers may panic: a failed setup should stop the test.
#![allow(clippy::unwrap_used)]

use std::fs;
use std::path::Path;

use vault_core::{PropertyValue, Vault, VaultPath, read_properties};

const FIXTURES: &[&str] = &["obsidian.md", "vscode-crlf.md", "no-front-matter.md"];

fn vault_with_fixtures() -> (tempfile::TempDir, Vault) {
    let dir = tempfile::tempdir().unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    for name in FIXTURES {
        fs::copy(source.join(name), dir.path().join(name)).unwrap();
    }
    let vault = Vault::open(dir.path()).unwrap();
    (dir, vault)
}

fn changed_lines(before: &str, after: &str) -> usize {
    let before: Vec<&str> = before.lines().collect();
    let after: Vec<&str> = after.lines().collect();
    assert_eq!(before.len(), after.len(), "line count changed");
    before.iter().zip(&after).filter(|(a, b)| a != b).count()
}

#[test]
fn an_untouched_note_is_saved_back_byte_for_byte() {
    let (dir, vault) = vault_with_fixtures();
    for name in FIXTURES {
        let original = fs::read(dir.path().join(name)).unwrap();
        let note = vault.read_note(&VaultPath::parse(name).unwrap()).unwrap();

        vault
            .save_note(&note.path, &note.content, &note.hash)
            .unwrap();

        assert_eq!(fs::read(dir.path().join(name)).unwrap(), original, "{name}");
    }
}

#[test]
fn every_fixture_with_front_matter_parses() {
    let (_dir, vault) = vault_with_fixtures();
    for name in ["obsidian.md", "vscode-crlf.md"] {
        let note = vault.read_note(&VaultPath::parse(name).unwrap()).unwrap();
        assert!(
            !read_properties(&note.content).unwrap().is_empty(),
            "{name}"
        );
    }
}

#[test]
fn changing_one_property_changes_exactly_one_line() {
    let (dir, vault) = vault_with_fixtures();
    for (name, key) in [("obsidian.md", "due"), ("vscode-crlf.md", "priority")] {
        let path = VaultPath::parse(name).unwrap();
        let before = vault.read_note(&path).unwrap();

        let value = PropertyValue::Text("2027-01-15".to_string());
        vault
            .set_note_property(&path, key, &value, &before.hash)
            .unwrap();

        let after = fs::read_to_string(dir.path().join(name)).unwrap();
        assert_eq!(changed_lines(&before.content, &after), 1, "{name}");
    }
}
