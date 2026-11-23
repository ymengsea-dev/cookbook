//! Book details and reading progress in `.vault/reader.json` (R-1, R-4, R-6), keyed by
//! `BookId`. The file syncs. Covers are a device-only cache in `.vault/cache/covers/`.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::PoisonError;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

use crate::{BookId, JsonFile, Vault, VaultError};

const READER_FILE: &str = ".vault/reader.json";
const READER_LABEL: &str = "reader.json";
const COVERS_DIR: &str = ".vault/cache/covers";
/// A cover is a small JPEG of page one; anything bigger is a mistake.
const MAX_COVER_BYTES: usize = 2 * 1024 * 1024;

/// What `reader.json` holds for one book. Keys it doesn't know, such as later bookmarks, stay.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct BookRecord {
    /// From the PDF's metadata, once the reader has opened it.
    pub title: Option<String>,
    pub pages: Option<u32>,
    /// The page last read, counting from 1.
    pub page: u32,
    /// How far down that page, from 0 (top) to 1 (bottom).
    pub position: f64,
    /// Milliseconds since 1970.
    #[ts(type = "number | null")]
    pub last_read_at: Option<u64>,
}

impl Default for BookRecord {
    fn default() -> Self {
        Self {
            title: None,
            pages: None,
            page: 1,
            position: 0.0,
            last_read_at: None,
        }
    }
}

/// Where a reader stopped, as saved after each page change and on close (R-4).
#[derive(Debug, Clone, Copy, PartialEq, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReadingPosition {
    pub page: u32,
    pub position: f64,
}

impl Vault {
    /// Every book record, by id. A broken record is skipped rather than failing the library.
    pub fn book_records(&self) -> HashMap<BookId, BookRecord> {
        let mut file = self.reader_file();
        let books: Map<String, Value> = file.get("/books", Map::new(), |_| true);
        let mut records = HashMap::new();
        for (raw_id, value) in books {
            let Ok(id) = BookId::parse(&raw_id) else {
                continue;
            };
            if let Ok(record) = serde_json::from_value::<BookRecord>(value) {
                records.insert(id, record);
            }
        }
        records
    }

    /// Saves what the reader learned from the PDF (R-1).
    pub fn save_book_details(
        &self,
        id: &BookId,
        title: &str,
        pages: u32,
    ) -> Result<(), VaultError> {
        if pages == 0 {
            return Err(VaultError::InvalidProperty("pages".to_string()));
        }
        let base = format!("/books/{}", id.as_str());
        self.edit_reader_file(|file| {
            file.set(&format!("{base}/title"), Value::from(title.trim()));
            file.set(&format!("{base}/pages"), Value::from(pages));
        })
    }

    /// Saves where reading stopped, and when (R-4).
    pub fn save_reading_position(
        &self,
        id: &BookId,
        position: ReadingPosition,
        now_millis: u64,
    ) -> Result<(), VaultError> {
        let inside_page = position.position.is_finite() && (0.0..=1.0).contains(&position.position);
        if position.page == 0 || !inside_page {
            return Err(VaultError::InvalidProperty("position".to_string()));
        }
        let base = format!("/books/{}", id.as_str());
        self.edit_reader_file(|file| {
            file.set(&format!("{base}/page"), Value::from(position.page));
            file.set(&format!("{base}/position"), Value::from(position.position));
            file.set(&format!("{base}/lastReadAt"), Value::from(now_millis));
        })
    }

    pub fn save_book_cover(&self, id: &BookId, jpeg: &[u8]) -> Result<(), VaultError> {
        if jpeg.is_empty() || jpeg.len() > MAX_COVER_BYTES {
            return Err(VaultError::InvalidProperty("cover".to_string()));
        }
        let path = self.cover_path(id);
        if let Some(folder) = path.parent() {
            fs::create_dir_all(folder).map_err(VaultError::io("create", COVERS_DIR))?;
        }
        self.writer().write(&path, jpeg, "book cover")?;
        Ok(())
    }

    /// The cached cover, or `None` until the reader has drawn one on this Mac.
    pub fn book_cover(&self, id: &BookId) -> Option<Vec<u8>> {
        fs::read(self.cover_path(id)).ok()
    }

    pub fn has_book_cover(&self, id: &BookId) -> bool {
        self.cover_path(id).is_file()
    }

    fn cover_path(&self, id: &BookId) -> PathBuf {
        self.root()
            .join(COVERS_DIR)
            .join(format!("{}.jpg", id.as_str()))
    }

    fn reader_file(&self) -> JsonFile {
        JsonFile::load(&self.root().join(READER_FILE), READER_LABEL)
    }

    // One edit at a time, so a progress save never undoes a details save.
    fn edit_reader_file(&self, edit: impl FnOnce(&mut JsonFile)) -> Result<(), VaultError> {
        let _guard = self
            .reader_lock()
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let mut file = self.reader_file();
        edit(&mut file);
        file.save(self.writer())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(fill: char) -> BookId {
        BookId::parse(&fill.to_string().repeat(64)).unwrap()
    }

    #[test]
    fn details_and_position_round_trip_and_keep_unknown_keys() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".vault")).unwrap();
        let book = id('a');
        let raw = format!(
            r#"{{ "books": {{ "{}": {{ "bookmarks": [3, 9] }} }}, "theme": "sepia" }}"#,
            book.as_str()
        );
        fs::write(dir.path().join(READER_FILE), raw).unwrap();
        let vault = Vault::open(dir.path()).unwrap();

        vault.save_book_details(&book, " Deep Work ", 300).unwrap();
        let position = ReadingPosition {
            page: 120,
            position: 0.25,
        };
        vault.save_reading_position(&book, position, 1_000).unwrap();

        let record = vault.book_records().remove(&book).unwrap();
        assert_eq!(record.title.as_deref(), Some("Deep Work"));
        assert_eq!((record.pages, record.page), (Some(300), 120));
        assert_eq!(record.last_read_at, Some(1_000));
        let text = fs::read_to_string(dir.path().join(READER_FILE)).unwrap();
        assert!(text.contains("\"bookmarks\""));
        assert!(text.contains("\"theme\": \"sepia\""));
        assert!(text.starts_with("{\n  \"schemaVersion\": 1"));
    }

    #[test]
    fn a_position_outside_the_book_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let bad_page = ReadingPosition {
            page: 0,
            position: 0.0,
        };
        let bad_offset = ReadingPosition {
            page: 1,
            position: f64::NAN,
        };
        assert!(vault.save_reading_position(&id('b'), bad_page, 1).is_err());
        assert!(
            vault
                .save_reading_position(&id('b'), bad_offset, 1)
                .is_err()
        );
    }

    #[test]
    fn covers_are_cached_per_book() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        assert_eq!(vault.book_cover(&id('c')), None);

        vault.save_book_cover(&id('c'), b"\xff\xd8jpeg").unwrap();

        assert!(vault.has_book_cover(&id('c')));
        assert_eq!(vault.book_cover(&id('c')).unwrap(), b"\xff\xd8jpeg");
    }
}
