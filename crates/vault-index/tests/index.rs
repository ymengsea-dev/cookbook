//! T-11, T-12, T-14: the index matches the files, updates incrementally,
//! and finds words in languages written without spaces.

// Test helpers may panic: a failed setup should stop the test.
#![allow(clippy::unwrap_used)]

use std::fs;
use std::path::Path;

use rusqlite::Connection;
use vault_core::{Vault, VaultPath};
use vault_index::{NoteIndex, SyncReport};

const FIXTURES: &[&str] = &[
    "khmer.md",
    "japanese.md",
    "chinese.md",
    "thai.md",
    "english.md",
];

fn vault_with_fixtures() -> (tempfile::TempDir, Vault) {
    let dir = tempfile::tempdir().unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    fs::create_dir_all(dir.path().join("Languages")).unwrap();
    for name in FIXTURES {
        fs::copy(source.join(name), dir.path().join("Languages").join(name)).unwrap();
    }
    let vault = Vault::open(dir.path()).unwrap();
    (dir, vault)
}

fn sync(index: &NoteIndex, vault: &Vault) -> SyncReport {
    index.sync(vault, |_| {}).unwrap()
}

fn found(index: &NoteIndex, query: &str) -> Vec<String> {
    let mut paths: Vec<String> = index
        .search(query, 50)
        .unwrap()
        .into_iter()
        .map(|hit| hit.path)
        .collect();
    paths.sort();
    paths
}

/// Every row of every table, without the internal ids, in a stable order.
fn dump(vault: &Vault) -> Vec<String> {
    let connection = Connection::open(vault.root().join(".vault/index/index.db")).unwrap();
    let queries = [
        "SELECT key || '|' || path || '|' || title || '|' || hash FROM notes ORDER BY path",
        "SELECT n.path || '|' || p.name || '|' || p.type || '|' || p.value FROM props p JOIN notes n ON n.id = p.note_id ORDER BY 1",
        "SELECT n.path || '|' || t.tag FROM tags t JOIN notes n ON n.id = t.note_id ORDER BY 1",
        "SELECT n.path || '|' || f.title || '|' || f.headings || '|' || f.body FROM notes_fts f JOIN notes n ON n.id = f.rowid ORDER BY 1",
    ];
    let mut rows = Vec::new();
    for query in queries {
        let mut statement = connection.prepare(query).unwrap();
        let values = statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap();
        rows.extend(values.map(Result::unwrap));
    }
    rows
}

#[test]
fn deleting_the_index_and_rebuilding_gives_the_same_data() {
    let (_dir, vault) = vault_with_fixtures();
    sync(&NoteIndex::open(&vault).unwrap(), &vault);
    let before = dump(&vault);
    assert!(!before.is_empty());

    fs::remove_dir_all(vault.root().join(".vault/index")).unwrap();
    sync(&NoteIndex::open(&vault).unwrap(), &vault);

    assert_eq!(dump(&vault), before);
}

#[test]
fn editing_one_note_reindexes_only_that_note() {
    let (_dir, vault) = vault_with_fixtures();
    let index = NoteIndex::open(&vault).unwrap();
    assert_eq!(sync(&index, &vault).indexed, FIXTURES.len());

    fs::write(
        vault.root().join("Languages/english.md"),
        "# Website plan\n\nNew text, longer than before.\n",
    )
    .unwrap();
    let report = sync(&index, &vault);

    assert_eq!(report.indexed, 1);
    assert_eq!(report.unchanged, FIXTURES.len() - 1);
    assert_eq!(found(&index, "longer than"), ["Languages/english.md"]);
}

#[test]
fn the_apps_own_save_is_indexed_once_with_no_loop() {
    let (_dir, vault) = vault_with_fixtures();
    let index = NoteIndex::open(&vault).unwrap();
    sync(&index, &vault);

    let path = VaultPath::parse("Languages/english.md").unwrap();
    let note = vault.read_note(&path).unwrap();
    vault
        .save_note(&path, &format!("{}More.\n", note.content), &note.hash)
        .unwrap();

    assert_eq!(sync(&index, &vault).indexed, 1);
    assert_eq!(sync(&index, &vault).indexed, 0);
}

#[test]
fn words_in_languages_without_spaces_are_found() {
    let (_dir, vault) = vault_with_fixtures();
    let index = NoteIndex::open(&vault).unwrap();
    sync(&index, &vault);

    for (word, note) in [
        ("ដកឃ្លា", "khmer.md"),
        ("ភាសា", "khmer.md"),
        ("東京", "japanese.md"),
        ("会議", "japanese.md"),
        ("搜索", "chinese.md"),
        ("空格", "chinese.md"),
        ("ครับ", "thai.md"),
        ("ช่องว่าง", "thai.md"),
        ("landing page", "english.md"),
    ] {
        assert_eq!(found(&index, word), [format!("Languages/{note}")], "{word}");
    }
}

#[test]
fn deleted_notes_leave_the_index() {
    let (_dir, vault) = vault_with_fixtures();
    let index = NoteIndex::open(&vault).unwrap();
    sync(&index, &vault);

    fs::remove_file(vault.root().join("Languages/thai.md")).unwrap();

    assert_eq!(sync(&index, &vault).removed, 1);
    assert!(found(&index, "ครับ").is_empty());
}

#[test]
fn an_old_schema_version_is_rebuilt() {
    let (_dir, vault) = vault_with_fixtures();
    sync(&NoteIndex::open(&vault).unwrap(), &vault);
    let database = vault.root().join(".vault/index/index.db");
    Connection::open(&database)
        .unwrap()
        .pragma_update(None, "user_version", 0)
        .unwrap();

    let index = NoteIndex::open(&vault).unwrap();

    assert_eq!(sync(&index, &vault).indexed, FIXTURES.len());
}
