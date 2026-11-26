//! Saved list and board views (L-1 to L-8, B-1 to B-7): view files and the engine
//! that filters, sorts and groups the indexed notes. Note edits go through `vault-core`.

mod actions;
mod board;
mod files;
mod query;

pub use actions::{move_card, new_note_in_view, open_view, rename_board_column};
pub use board::{BoardColumn, card_column, column_value, rename_column};
pub use files::definition::{
    BoardSettings, Column, Filter, FilterOp, NO_VALUE, PropertyType, SortDirection, SortRule,
    ViewDefinition, ViewKind, ViewSource,
};
pub use files::store::{VIEW_SCHEMA_VERSION, create_view, list_views, load_view, save_view};
pub use query::engine::{PropertyInfo, RowGroup, ViewContent, ViewData, ViewRow, run_view};
pub use query::values::typed_value;

#[derive(Debug, thiserror::Error)]
pub enum ViewError {
    #[error("The view \"{0}\" was not found.")]
    NotFound(String),

    #[error("The view file {0}.json could not be read: {1}")]
    Broken(String, String),

    #[error(
        "The view {0}.json was saved by a newer version of the app, so it can't be changed here."
    )]
    NewerVersion(String),

    #[error("A view needs a name.")]
    InvalidName(String),

    #[error("The views folder could not be created: {0}")]
    Io(String),

    #[error("{0}")]
    Vault(#[from] vault_core::VaultError),

    #[error("{0}")]
    Index(#[from] vault_index::IndexError),
}
