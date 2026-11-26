//! The search index: a disposable SQLite cache built from the vault's files (X-1 to X-7).
//! Deleting `.vault/index/` loses nothing; the next sync fills it again.

mod db;
mod extract;
mod index;
mod search;

pub use db::rows::IndexedNote;
pub use db::schema::SCHEMA_VERSION;
pub use extract::{NoteRecord, extract};
pub use index::{IndexProgress, NoteIndex, SyncReport};
pub use search::{MATCH_END, MATCH_START, SearchHit, make_snippet};

#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error("The search index could not be read or written: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("{0}")]
    Vault(#[from] vault_core::VaultError),

    #[error("The search index folder could not be created: {0}")]
    Io(String),
}
