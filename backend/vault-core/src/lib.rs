//! Notes, front matter, paths, atomic writes, trash, settings files and books.
//!
//! This crate must build and test without Tauri and without any network crate.

mod books;
mod error;
mod front_matter;
mod hash;
mod keys;
mod library;
mod notes;
mod reader;
mod settings;
mod trash;
mod tree;
mod vault;
mod vault_path;
mod watcher;
mod writer;

pub use books::{BOOKS_DIR, BookFile, BookId, book_fingerprint};
pub use error::VaultError;
pub use front_matter::{
    Property, PropertyValue, note_body, read_properties, read_property, remove_property,
    set_property,
};
pub use hash::ContentHash;
pub use keys::{AdoptReport, KEY_PROPERTY, SkippedNote, ensure_key, has_key, replace_key};
pub use library::Book;
pub use reader::{BookRecord, ReadingPosition};
pub use settings::{
    AppSettings, EditorSettings, JsonFile, LocalSettings, SCHEMA_VERSION, SettingsSnapshot,
    VaultSettings, load_app_settings, remember_vault,
};
pub use trash::TrashEntry;
pub use tree::{TreeEntry, TreeEntryKind, read_tree};
pub use vault::{NoteFile, Vault};
pub use vault_path::{VAULT_DIR, VaultPath, is_portable_internal};
pub use watcher::{VaultChange, VaultWatcher};
pub use writer::VaultWriter;
