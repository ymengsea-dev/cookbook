//! Notes, front matter, paths, atomic writes and trash.
//!
//! This crate must build and test without Tauri and without any network crate.

mod error;
mod front_matter;
mod hash;
mod keys;
mod notes;
mod settings;
mod trash;
mod tree;
mod vault;
mod vault_path;
mod watcher;
mod writer;

pub use error::VaultError;
pub use front_matter::{Property, PropertyValue, read_properties, read_property, set_property};
pub use hash::ContentHash;
pub use keys::{AdoptReport, KEY_PROPERTY, SkippedNote, ensure_key, has_key};
pub use settings::{
    AppSettings, EditorSettings, LocalSettings, SCHEMA_VERSION, SettingsSnapshot, VaultSettings,
    load_app_settings, remember_vault,
};
pub use trash::TrashEntry;
pub use tree::{TreeEntry, TreeEntryKind, read_tree};
pub use vault::{NoteFile, Vault};
pub use vault_path::{VAULT_DIR, VaultPath};
pub use watcher::{VaultChange, VaultWatcher};
pub use writer::VaultWriter;
