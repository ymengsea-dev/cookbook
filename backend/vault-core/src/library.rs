//! The Books page's list (R-2): every PDF in the vault with its details and progress,
//! most recently read first.

use std::cmp::Ordering;

use serde::Serialize;
use ts_rs::TS;

use crate::{BookId, BookRecord, Vault, VaultError, VaultPath};

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Book {
    pub id: BookId,
    pub path: VaultPath,
    /// From the PDF, or the file name until the reader has opened it.
    pub title: String,
    pub pages: Option<u32>,
    pub page: u32,
    pub position: f64,
    #[ts(type = "number | null")]
    pub last_read_at: Option<u64>,
    /// False until the title, page count and cover have been read on this Mac (R-1).
    pub has_details: bool,
}

impl Vault {
    pub fn library(&self) -> Result<Vec<Book>, VaultError> {
        let mut records = self.book_records();
        let mut books = Vec::new();
        for file in self.book_files()? {
            let record = records.remove(&file.id).unwrap_or_default();
            let has_details = record.pages.is_some() && self.has_book_cover(&file.id);
            books.push(book_from(file.id, file.path, record, has_details));
        }
        books.sort_by(compare_books);
        Ok(books)
    }
}

fn book_from(id: BookId, path: VaultPath, record: BookRecord, has_details: bool) -> Book {
    let file_title = path.file_name().trim_end_matches(".pdf").to_string();
    let title = record
        .title
        .filter(|title| !title.is_empty())
        .unwrap_or(file_title);
    Book {
        id,
        path,
        title,
        pages: record.pages,
        page: record.page,
        position: record.position,
        last_read_at: record.last_read_at,
        has_details,
    }
}

/// Most recently read first; books never opened follow, by title.
fn compare_books(a: &Book, b: &Book) -> Ordering {
    b.last_read_at
        .cmp(&a.last_read_at)
        .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ReadingPosition;
    use std::fs;

    #[test]
    fn the_most_recently_read_book_comes_first() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("books")).unwrap();
        for name in ["Alpha", "Beta", "Gamma"] {
            let bytes = format!("%PDF-1.7\n{name}\n");
            fs::write(dir.path().join(format!("books/{name}.pdf")), bytes).unwrap();
        }
        let vault = Vault::open(dir.path()).unwrap();
        let ids: Vec<BookId> = vault.library().unwrap().into_iter().map(|b| b.id).collect();
        let position = ReadingPosition {
            page: 2,
            position: 0.5,
        };
        vault.save_reading_position(&ids[2], position, 200).unwrap();
        vault.save_reading_position(&ids[1], position, 100).unwrap();

        let titles: Vec<String> = vault
            .library()
            .unwrap()
            .into_iter()
            .map(|book| book.title)
            .collect();

        assert_eq!(titles, ["Gamma", "Beta", "Alpha"]);
    }
}
