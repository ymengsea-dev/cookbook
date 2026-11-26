//! Notes, front matter, paths, atomic writes, trash, settings files and books.
//!
//! This crate must build and test without Tauri and without any network crate.

mod books;
mod error;
mod hash;
mod notes;
mod settings;
mod vault;
mod vault_path;
mod watcher;
mod writer;

pub use books::{BOOKS_DIR, Book, BookFile, BookId, BookRecord, ReadingPosition, book_fingerprint};
pub use error::VaultError;
pub use hash::ContentHash;
pub use notes::{
    AdoptReport, KEY_PROPERTY, Property, PropertyValue, SkippedNote, TrashEntry, TreeEntry,
    TreeEntryKind, ensure_key, has_key, note_body, read_properties, read_property, read_tree,
    remove_property, replace_key, set_property,
};
pub use settings::{
    AppSettings, AppearanceSettings, Density, EditorSettings, FontSettings, JsonFile,
    LayoutSettings, LocalSettings, SCHEMA_VERSION, SettingsSnapshot, SidebarSide, THEMES_DIR, Theme,
    ThemeColors, ThemeFile, ThemeList, ThemeMode, VaultSettings, load_app_settings, remember_vault,
};
pub use vault::{NoteFile, Vault};
pub use vault_path::{VAULT_DIR, VaultPath, is_portable_internal};
pub use watcher::{VaultChange, VaultWatcher};
pub use writer::VaultWriter;
