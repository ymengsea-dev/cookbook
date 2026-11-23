//! Imports and exports on real folders, the way the app runs them.
#![allow(clippy::unwrap_used)]

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use vault_core::{Vault, VaultPath};
use vault_io::{
    ImportSource, IoError, Job, QuietJob, ZipOptions, export_note_html, export_note_markdown,
    export_zip, import,
};

fn write(root: &Path, path: &str, content: &[u8]) {
    let full = root.join(path);
    fs::create_dir_all(full.parent().unwrap()).unwrap();
    fs::write(full, content).unwrap();
}

/// Every file under `root` with its bytes, skipping `skip_prefixes`.
fn snapshot(root: &Path, skip_prefixes: &[&str]) -> BTreeMap<String, Vec<u8>> {
    let mut files = BTreeMap::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(folder) = stack.pop() {
        for item in fs::read_dir(folder).unwrap() {
            let path = item.unwrap().path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let relative = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if !skip_prefixes
                .iter()
                .any(|prefix| relative.starts_with(prefix))
            {
                files.insert(relative, fs::read(&path).unwrap());
            }
        }
    }
    files
}

/// Checks every relative Markdown link in the vault's notes points at a file that exists.
fn broken_links(root: &Path) -> Vec<String> {
    let mut broken = Vec::new();
    for (path, bytes) in snapshot(root, &[".vault/"]) {
        if !path.ends_with(".md") {
            continue;
        }
        let folder = Path::new(&path).parent().unwrap().to_path_buf();
        let text = String::from_utf8(bytes).unwrap();
        for part in text.split("](").skip(1) {
            let target = part.split(')').next().unwrap().replace("%20", " ");
            if !root.join(&folder).join(&target).exists() {
                broken.push(format!("{path} → {target}"));
            }
        }
    }
    broken
}

fn notes_folder(count: usize) -> tempfile::TempDir {
    let source = tempfile::tempdir().unwrap();
    let root = source.path().join("Research");
    for index in 0..count {
        let next = (index + 1) % count;
        let text = format!(
            "# Note {index}\n\nNext: [note](../Topic%20{}/Note%20{next}.md) ![](../attachments/pic.png)\n",
            next % 10
        );
        write(
            &root,
            &format!("Topic {}/Note {index}.md", index % 10),
            text.as_bytes(),
        );
    }
    write(&root, "attachments/pic.png", b"\x89PNG");
    write(
        &root,
        "Ideas.txt",
        b"Plain text idea. See [first](/Topic%200/Note%200.md).\n",
    );
    write(
        &root,
        "Index.md",
        b"Ideas are in [[Ideas]] and [the text](Ideas.txt).\n",
    );
    write(&root, ".obsidian/app.json", b"{}");
    source
}

#[test]
fn a_500_note_folder_imports_with_its_links_working() {
    let source = notes_folder(500);
    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::open(dir.path()).unwrap();

    let report = import(
        &vault,
        &ImportSource::Folder(source.path().join("Research")),
        &QuietJob,
        1,
    )
    .unwrap();

    assert_eq!(report.notes, 502);
    assert_eq!(report.attachments, 1);
    assert_eq!(
        report.destination.as_ref().map(VaultPath::as_str),
        Some("Research")
    );
    assert!(
        dir.path().join("Research/Ideas.md").exists(),
        ".txt becomes a note"
    );
    assert!(
        !dir.path().join("Research/.obsidian").exists(),
        "hidden folders stay out"
    );
    assert_eq!(broken_links(dir.path()), Vec::<String>::new());
    let index = fs::read_to_string(dir.path().join("Research/Index.md")).unwrap();
    assert!(index.contains("[the text](Ideas.md)"));
    assert!(report.saved_as.is_some());
}

#[test]
fn importing_the_same_folder_again_overwrites_nothing() {
    let source = notes_folder(20);
    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::open(dir.path()).unwrap();
    let folder = ImportSource::Folder(source.path().join("Research"));

    import(&vault, &folder, &QuietJob, 1).unwrap();
    let first = snapshot(&dir.path().join("Research"), &[]);
    let again = import(&vault, &folder, &QuietJob, 2).unwrap();

    assert_eq!(
        again.destination.as_ref().map(VaultPath::as_str),
        Some("Research 2")
    );
    assert_eq!(snapshot(&dir.path().join("Research"), &[]), first);
    assert_eq!(broken_links(dir.path()), Vec::<String>::new());
}

#[test]
fn single_files_get_a_number_on_a_clash_and_keys_never_repeat() {
    let source = tempfile::tempdir().unwrap();
    let keyed = b"---\nkey: 01JD8Y3N6Q4F9K2V7R5T0W1XZB\n---\n```sh\necho hi\n```\n";
    write(source.path(), "Plan.md", keyed);
    write(source.path(), "notes.txt", b"plain");
    write(source.path(), "photo.jpg", b"jpg");
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "Plan.md", keyed);
    let vault = Vault::open(dir.path()).unwrap();
    let files = ["Plan.md", "notes.txt", "photo.jpg"]
        .map(|name| source.path().join(name))
        .to_vec();

    let report = import(&vault, &ImportSource::Files(files), &QuietJob, 1).unwrap();

    assert_eq!(report.notes, 2);
    assert_eq!(report.skipped.len(), 1, "a photo is not a note");
    assert_eq!(
        fs::read(dir.path().join("Plan.md")).unwrap(),
        keyed,
        "the existing note is untouched"
    );
    let copy = fs::read_to_string(dir.path().join("Plan 2.md")).unwrap();
    assert!(
        !copy.contains("01JD8Y3N6Q4F9K2V7R5T0W1XZB"),
        "the copy got its own key"
    );
    assert_eq!(report.rekeyed, 1);
    assert_eq!(
        report.code_note_keys.len(),
        1,
        "the note with code must be trusted first"
    );
    assert!(dir.path().join("notes.md").exists());
}

#[test]
fn a_vault_exported_to_zip_imports_into_an_empty_vault_as_the_same_files() {
    let original = tempfile::tempdir().unwrap();
    let root = original.path();
    write(
        root,
        "Inbox/Meeting.md",
        "---\nkey: 01JD8Y3N6Q4F9K2V7R5T0W1XZB\n---\n# Meeting ខ្មែរ\n```js\n1\n```\n".as_bytes(),
    );
    write(
        root,
        "Projects/Web/Plan.md",
        b"See ![](../../attachments/d.png)\n",
    );
    write(root, "attachments/d.png", b"\x89PNG");
    write(root, "books/Book.pdf", b"%PDF-1.7");
    write(root, ".vault/settings.json", b"{}");
    write(root, ".vault/views/board.json", b"{\"id\":\"board\"}");
    write(
        root,
        ".vault/settings.local.json",
        b"{\"codeRun\":{\"warningAccepted\":true}}",
    );
    write(root, ".vault/trash/old.md", b"gone");
    let vault = Vault::open(root).unwrap();
    let zip_dir = tempfile::tempdir().unwrap();
    let zip = zip_dir.path().join("Vault.zip");
    let options = ZipOptions {
        folder: None,
        include_vault_dir: true,
        strip_keys: false,
    };

    let exported = export_zip(&vault, &options, &zip, &QuietJob).unwrap();
    let empty = tempfile::tempdir().unwrap();
    let report = import(
        &Vault::open(empty.path()).unwrap(),
        &ImportSource::Zip(zip),
        &QuietJob,
        1,
    )
    .unwrap();

    let device_only = [
        ".vault/settings.local.json",
        ".vault/trash/",
        ".vault/imports/",
    ];
    assert_eq!(exported.files, 6);
    assert_eq!(
        snapshot(empty.path(), &device_only),
        snapshot(root, &device_only)
    );
    assert!(report.renamed.is_empty());
}

#[test]
fn a_folder_zip_can_leave_out_keys() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "Share/Note.md", b"---\nkey: 01J\n---\n# Hi\n");
    write(dir.path(), "Other/Skip.md", b"no");
    let vault = Vault::open(dir.path()).unwrap();
    let zip = dir.path().join("out.zip");
    let options = ZipOptions {
        folder: Some(VaultPath::parse("Share").unwrap()),
        include_vault_dir: true,
        strip_keys: true,
    };

    export_zip(&vault, &options, &zip, &QuietJob).unwrap();
    let target = tempfile::tempdir().unwrap();
    import(
        &Vault::open(target.path()).unwrap(),
        &ImportSource::Zip(zip),
        &QuietJob,
        1,
    )
    .unwrap();

    assert_eq!(
        fs::read_to_string(target.path().join("Share/Note.md")).unwrap(),
        "# Hi\n"
    );
    assert!(!target.path().join("Other").exists());
}

#[test]
fn one_note_exports_as_markdown_with_attachments_and_as_html_with_images() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "Notes/Trip.md",
        b"---\nkey: 01J\n---\n# Trip\n\n![map](../img/map%201.png)\n\n| a |\n|---|\n| b |\n",
    );
    write(dir.path(), "img/map 1.png", b"\x89PNG");
    let vault = Vault::open(dir.path()).unwrap();
    let note = VaultPath::parse("Notes/Trip.md").unwrap();
    let out = tempfile::tempdir().unwrap();

    let folder = export_note_markdown(&vault, &note, out.path()).unwrap();
    let again = export_note_markdown(&vault, &note, out.path()).unwrap();
    let html_file = out.path().join("Trip.html");
    export_note_html(&vault, &note, &html_file).unwrap();

    assert_eq!(folder, out.path().join("Trip"));
    assert_eq!(
        again,
        out.path().join("Trip 2"),
        "an export never replaces another"
    );
    let markdown = fs::read_to_string(folder.join("Trip.md")).unwrap();
    assert!(markdown.contains("![map](attachments/map%201.png)"));
    assert!(folder.join("attachments/map 1.png").exists());
    let html = fs::read_to_string(html_file).unwrap();
    assert!(html.contains("<img src=\"data:image/png;base64,iVBORw==\""));
    assert!(html.contains("<table>"));
    assert!(
        !html.contains("key: 01J"),
        "front matter stays out of the page"
    );
}

struct CancelAfterFirst(AtomicBool);

impl Job for CancelAfterFirst {
    fn progress(&self, _done: usize, _total: usize) {
        self.0.store(true, Ordering::SeqCst);
    }

    fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[test]
fn a_cancelled_import_keeps_what_it_copied_and_says_so() {
    let source = notes_folder(10);
    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::open(dir.path()).unwrap();
    let job = CancelAfterFirst(AtomicBool::new(false));

    let report = import(
        &vault,
        &ImportSource::Folder(source.path().join("Research")),
        &job,
        1,
    )
    .unwrap();
    let zip = dir.path().join("x.zip");
    let options = ZipOptions {
        folder: None,
        include_vault_dir: false,
        strip_keys: false,
    };
    let cancelled = export_zip(&vault, &options, &zip, &job);

    assert!(report.cancelled);
    assert_eq!(report.notes + report.attachments, 1);
    assert!(matches!(cancelled, Err(IoError::Cancelled(_))));
    assert!(!zip.exists() && !dir.path().join("x.zip.partial").exists());
}
