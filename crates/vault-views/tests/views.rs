//! T-16 to T-20 "check it works": views over a real vault and index.

// Test helpers may panic: a failed setup should stop the test.
#![allow(clippy::unwrap_used, clippy::panic)]

use std::fs;

use vault_core::{PropertyValue, Vault, VaultPath};
use vault_index::NoteIndex;
use vault_views::{
    Filter, FilterOp, SortDirection, SortRule, ViewContent, ViewData, ViewKind, ViewSource,
    create_view, move_card, new_note_in_view, open_view, rename_board_column, save_view,
};

const STATUSES: [&str; 3] = ["todo", "doing", "done"];

/// 200 notes in `Projects/`, each with a `status` and a `rank`.
fn vault_with_notes() -> (tempfile::TempDir, Vault, NoteIndex) {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("Projects");
    fs::create_dir_all(&folder).unwrap();
    for number in 0..200 {
        let status = STATUSES[number % 3];
        let text = format!(
            "---\nkey: KEY{number:03}\nstatus: {status}\nrank: {number}\n---\n# Note {number:03}\n"
        );
        fs::write(folder.join(format!("Note {number:03}.md")), text).unwrap();
    }
    fs::write(dir.path().join("Outside.md"), "---\nstatus: todo\n---\n").unwrap();
    let vault = Vault::open(dir.path()).unwrap();
    let index = NoteIndex::open(&vault).unwrap();
    index.sync(&vault, |_| {}).unwrap();
    (dir, vault, index)
}

fn projects() -> ViewSource {
    ViewSource::Folder {
        folder: VaultPath::parse("Projects").unwrap(),
        recursive: true,
    }
}

fn board(vault: &Vault) -> String {
    let mut view = create_view(vault, "Board", ViewKind::Board, projects()).unwrap();
    view.board.group_by = Some("status".to_string());
    view.board.columns = STATUSES.iter().map(ToString::to_string).collect();
    save_view(vault, &view).unwrap().id
}

/// Column value and card titles, for every column.
fn columns(data: &ViewData) -> Vec<(String, Vec<String>)> {
    let ViewContent::Board { columns } = &data.content else {
        panic!("not a board");
    };
    columns
        .iter()
        .map(|column| {
            let titles = column.cards.iter().map(|card| card.title.clone()).collect();
            (column.value.clone(), titles)
        })
        .collect()
}

fn column_of(data: &ViewData, title: &str) -> String {
    columns(data)
        .into_iter()
        .find(|(_, titles)| titles.iter().any(|t| t == title))
        .map(|(value, _)| value)
        .unwrap()
}

fn changed_lines(before: &str, after: &str) -> usize {
    let before: Vec<&str> = before.lines().collect();
    let after: Vec<&str> = after.lines().collect();
    assert_eq!(before.len(), after.len());
    before.iter().zip(&after).filter(|(a, b)| a != b).count()
}

#[test]
fn a_list_filters_sorts_and_counts() {
    let (_dir, vault, index) = vault_with_notes();
    let mut view = create_view(&vault, "List", ViewKind::List, projects()).unwrap();
    view.filter.push(Filter {
        property: "status".to_string(),
        op: FilterOp::Is,
        value: "doing".to_string(),
    });
    view.sort.push(SortRule {
        property: "rank".to_string(),
        dir: SortDirection::Desc,
    });
    save_view(&vault, &view).unwrap();

    let data = open_view(&vault, &index, &view.id).unwrap();
    assert_eq!(data.total, 67);
    let ViewContent::List { groups } = &data.content else {
        panic!("not a list");
    };
    let titles: Vec<&str> = groups[0]
        .rows
        .iter()
        .take(3)
        .map(|row| row.title.as_str())
        .collect();
    assert_eq!(titles, ["Note 199", "Note 196", "Note 193"]);
}

#[test]
fn moving_a_card_changes_exactly_one_line_in_one_file() {
    let (dir, vault, index) = vault_with_notes();
    let id = board(&vault);
    let path = VaultPath::parse("Projects/Note 001.md").unwrap();
    let before_all = snapshot(dir.path());
    let note = vault.read_note(&path).unwrap();

    let order = vec!["KEY001".to_string()];
    move_card(
        &vault,
        &index,
        &id,
        &path,
        &note.hash,
        "done",
        order.clone(),
    )
    .unwrap();

    let after_all = snapshot(dir.path());
    let changed: Vec<&String> = before_all
        .iter()
        .filter(|(name, text)| after_all.iter().any(|(n, t)| n == name && t != text))
        .map(|(name, _)| name)
        .collect();
    assert_eq!(changed, ["Projects/Note 001.md"]);
    let after = vault.read_note(&path).unwrap().content;
    assert_eq!(changed_lines(&note.content, &after), 1);
    assert!(after.contains("status: done\n"));

    index.sync(&vault, |_| {}).unwrap();
    let data = open_view(&vault, &index, &id).unwrap();
    assert_eq!(column_of(&data, "Note 001"), "done");
    assert_eq!(data.definition.board.card_order.get("done"), Some(&order));
    assert_eq!(columns(&data)[2].1[0], "Note 001");
}

#[test]
fn changing_the_property_by_hand_moves_the_card() {
    let (dir, vault, index) = vault_with_notes();
    let id = board(&vault);
    assert_eq!(
        column_of(&open_view(&vault, &index, &id).unwrap(), "Note 000"),
        "todo"
    );

    let file = dir.path().join("Projects/Note 000.md");
    let text = fs::read_to_string(&file)
        .unwrap()
        .replace("status: todo", "status: done");
    fs::write(&file, text).unwrap();
    index.sync(&vault, |_| {}).unwrap();

    assert_eq!(
        column_of(&open_view(&vault, &index, &id).unwrap(), "Note 000"),
        "done"
    );
}

#[test]
fn every_note_lands_in_its_column() {
    let (_dir, vault, index) = vault_with_notes();
    let data = open_view(&vault, &index, &board(&vault)).unwrap();
    let counts: Vec<(String, usize)> = columns(&data)
        .into_iter()
        .map(|(value, titles)| (value, titles.len()))
        .collect();
    let expected = [("todo", 67), ("doing", 67), ("done", 66), ("", 0)];
    let expected: Vec<(String, usize)> =
        expected.iter().map(|(v, n)| (v.to_string(), *n)).collect();
    assert_eq!(counts, expected);
}

#[test]
fn a_new_note_gets_the_view_folder_and_values() {
    let (_dir, vault, index) = vault_with_notes();
    let mut view = create_view(&vault, "Doing", ViewKind::List, projects()).unwrap();
    view.filter.push(Filter {
        property: "rank".to_string(),
        op: FilterOp::Is,
        value: "7".to_string(),
    });
    save_view(&vault, &view).unwrap();

    let note = new_note_in_view(&vault, &index, &view.id, None).unwrap();
    assert_eq!(note.path.as_str(), "Projects/Untitled.md");
    let rank = vault_core::read_property(&note.content, "rank").unwrap();
    assert_eq!(rank, Some(PropertyValue::Number(7.0)));

    let id = board(&vault);
    let card = new_note_in_view(&vault, &index, &id, Some("doing")).unwrap();
    assert!(card.content.contains("status: doing\n"));
}

#[test]
fn renaming_a_column_rewrites_its_cards() {
    let (_dir, vault, index) = vault_with_notes();
    let id = board(&vault);
    let renamed = rename_board_column(&vault, &index, &id, "doing", "active").unwrap();
    assert_eq!(renamed, 67);

    index.sync(&vault, |_| {}).unwrap();
    let data = open_view(&vault, &index, &id).unwrap();
    let names: Vec<String> = columns(&data).into_iter().map(|(value, _)| value).collect();
    assert_eq!(names, ["todo", "active", "done", ""]);
    assert_eq!(column_of(&data, "Note 001"), "active");
}

/// Every Markdown file in the vault with its text, sorted by path.
fn snapshot(root: &std::path::Path) -> Vec<(String, String)> {
    let mut files = Vec::new();
    for folder in [root.to_path_buf(), root.join("Projects")] {
        for entry in fs::read_dir(&folder).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_some_and(|ext| ext == "md") {
                let name = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                files.push((name, fs::read_to_string(&path).unwrap()));
            }
        }
    }
    files.sort();
    files
}
