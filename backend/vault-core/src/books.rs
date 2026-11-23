//! PDF books (R-1, R-6): importing into `books/`, finding every PDF in the vault, and the
//! fingerprint that keys a book's progress, so renaming or moving the file keeps it.

use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::vault_path::is_pdf_name;
use crate::{Vault, VaultError, VaultPath};

/// Imported books are copied here.
pub const BOOKS_DIR: &str = "books";
/// The fingerprint reads this much from each end of the file, so listing 100 books stays fast.
const SAMPLE_BYTES: u64 = 64 * 1024;
const PDF_MAGIC: &[u8] = b"%PDF-";
const MAX_COPY_NUMBER: u32 = 1000;

/// A book's identity: a BLAKE3 hash of its size, first 64 KB and last 64 KB, as hex.
/// The end of a PDF holds its ID and cross-reference table, so different files differ there.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(try_from = "String", into = "String")]
#[ts(export, type = "string")]
pub struct BookId(String);

impl BookId {
    pub fn parse(raw: &str) -> Result<Self, VaultError> {
        let is_hash = raw.len() == 64 && raw.chars().all(|c| c.is_ascii_hexdigit());
        if !is_hash {
            return Err(VaultError::InvalidPath(raw.to_string()));
        }
        Ok(Self(raw.to_ascii_lowercase()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for BookId {
    type Error = VaultError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<BookId> for String {
    fn from(id: BookId) -> Self {
        id.0
    }
}

/// A PDF somewhere in the vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BookFile {
    pub id: BookId,
    pub path: VaultPath,
}

impl Vault {
    /// Copies a PDF into `books/`. A name already taken gets a number, so nothing is replaced.
    pub fn import_book(&self, source: &Path) -> Result<VaultPath, VaultError> {
        let label = source.display().to_string();
        let name = source
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| is_pdf_name(name))
            .ok_or_else(|| VaultError::NotAPdf(label.clone()))?;
        let bytes = fs::read(source).map_err(VaultError::io("import", label.clone()))?;
        if !bytes.starts_with(PDF_MAGIC) {
            return Err(VaultError::NotAPdf(label));
        }

        let folder = VaultPath::parse(BOOKS_DIR)?;
        fs::create_dir_all(folder.to_fs_path(self.root()))
            .map_err(VaultError::io("create", BOOKS_DIR))?;
        for number in 1..=MAX_COPY_NUMBER {
            let path = folder.join(&numbered_name(name, number))?;
            let created =
                self.writer()
                    .create_new(&path.to_fs_path(self.root()), &bytes, path.as_str());
            match created {
                Ok(_) => return Ok(path),
                Err(VaultError::AlreadyExists(_)) => continue,
                Err(error) => return Err(error),
            }
        }
        Err(VaultError::AlreadyExists(format!("{BOOKS_DIR}/{name}")))
    }

    /// Every PDF in the vault, wherever the user moved it. Hidden folders are skipped.
    pub fn book_files(&self) -> Result<Vec<BookFile>, VaultError> {
        let mut paths = Vec::new();
        collect_pdfs(self.root(), None, &mut paths)?;
        paths.sort_by(|a, b| a.as_str().cmp(b.as_str()));
        let mut books = Vec::new();
        for path in paths {
            let id = book_fingerprint(&path.to_fs_path(self.root()))
                .map_err(VaultError::io("read", path.to_string()))?;
            books.push(BookFile { id, path });
        }
        Ok(books)
    }

    pub fn read_book(&self, path: &VaultPath) -> Result<Vec<u8>, VaultError> {
        if !is_pdf_name(path.file_name()) {
            return Err(VaultError::NotAPdf(path.to_string()));
        }
        fs::read(path.to_fs_path(self.root())).map_err(VaultError::io("read", path.to_string()))
    }
}

/// `Book.pdf`, then `Book 2.pdf`, `Book 3.pdf` and so on.
fn numbered_name(name: &str, number: u32) -> String {
    if number == 1 {
        return name.to_string();
    }
    let stem_end = name.len() - ".pdf".len();
    format!("{} {number}{}", &name[..stem_end], &name[stem_end..])
}

fn collect_pdfs(
    root: &Path,
    folder: Option<&VaultPath>,
    found: &mut Vec<VaultPath>,
) -> Result<(), VaultError> {
    let folder_path = folder.map_or_else(|| root.to_path_buf(), |folder| folder.to_fs_path(root));
    let label = folder.map_or_else(String::new, ToString::to_string);
    let items = fs::read_dir(&folder_path).map_err(VaultError::io("read folder", label.clone()))?;
    for item in items {
        let item = item.map_err(VaultError::io("read folder", label.clone()))?;
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
            collect_pdfs(root, Some(&path), found)?;
        } else if file_type.is_file() && is_pdf_name(&name) {
            found.push(path);
        }
    }
    Ok(())
}

/// The `BookId` of the PDF at `file`.
pub fn book_fingerprint(file: &Path) -> io::Result<BookId> {
    let mut reader = File::open(file)?;
    let size = reader.metadata()?.len();
    let mut hasher = blake3::Hasher::new();
    hasher.update(&size.to_le_bytes());

    let mut head = Vec::new();
    (&mut reader).take(SAMPLE_BYTES).read_to_end(&mut head)?;
    hasher.update(&head);
    if size > SAMPLE_BYTES {
        let tail_start = size.saturating_sub(SAMPLE_BYTES).max(SAMPLE_BYTES);
        reader.seek(SeekFrom::Start(tail_start))?;
        let mut tail = Vec::new();
        reader.read_to_end(&mut tail)?;
        hasher.update(&tail);
    }
    Ok(BookId(hasher.finalize().to_hex().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pdf_bytes(marker: &str) -> Vec<u8> {
        format!("%PDF-1.7\n{marker}\n%%EOF\n").into_bytes()
    }

    #[test]
    fn importing_copies_into_books_and_never_replaces_a_book() {
        let source = tempfile::tempdir().unwrap();
        let pdf = source.path().join("Deep Work.pdf");
        fs::write(&pdf, pdf_bytes("one")).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();

        let first = vault.import_book(&pdf).unwrap();
        let second = vault.import_book(&pdf).unwrap();

        assert_eq!(first.as_str(), "books/Deep Work.pdf");
        assert_eq!(second.as_str(), "books/Deep Work 2.pdf");
        assert!(pdf.exists(), "the original stays where it was");
    }

    #[test]
    fn a_file_that_is_not_a_pdf_is_refused() {
        let source = tempfile::tempdir().unwrap();
        let fake = source.path().join("fake.pdf");
        fs::write(&fake, "just text").unwrap();
        let text = source.path().join("notes.txt");
        fs::write(&text, pdf_bytes("x")).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();

        assert!(matches!(
            vault.import_book(&fake),
            Err(VaultError::NotAPdf(_))
        ));
        assert!(matches!(
            vault.import_book(&text),
            Err(VaultError::NotAPdf(_))
        ));
    }

    #[test]
    fn renaming_or_moving_a_book_keeps_its_id() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("books")).unwrap();
        fs::create_dir_all(dir.path().join("Reading")).unwrap();
        fs::create_dir_all(dir.path().join(".vault/trash")).unwrap();
        fs::write(dir.path().join("books/a.pdf"), pdf_bytes("a")).unwrap();
        fs::write(dir.path().join(".vault/trash/hidden.pdf"), pdf_bytes("h")).unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let before = vault.book_files().unwrap();

        fs::rename(
            dir.path().join("books/a.pdf"),
            dir.path().join("Reading/Renamed.pdf"),
        )
        .unwrap();
        let after = vault.book_files().unwrap();

        assert_eq!(before.len(), 1);
        assert_eq!(after[0].path.as_str(), "Reading/Renamed.pdf");
        assert_eq!(after[0].id, before[0].id);
    }

    #[test]
    fn different_books_get_different_ids_even_when_long() {
        let dir = tempfile::tempdir().unwrap();
        let mut long_a = vec![b'x'; 300_000];
        let mut long_b = long_a.clone();
        long_a.extend_from_slice(b"/ID [<aaaa>]");
        long_b.extend_from_slice(b"/ID [<bbbb>]");
        fs::write(dir.path().join("a.pdf"), &long_a).unwrap();
        fs::write(dir.path().join("b.pdf"), &long_b).unwrap();

        let a = book_fingerprint(&dir.path().join("a.pdf")).unwrap();
        let b = book_fingerprint(&dir.path().join("b.pdf")).unwrap();

        assert_ne!(a, b);
        assert_eq!(BookId::parse(a.as_str()).unwrap(), a);
    }
}
