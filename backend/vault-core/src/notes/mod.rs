//! Note files: front matter, stable keys, the folder tree, the trash, and the writes that
//! change them.

mod actions;
mod front_matter;
mod keys;
mod trash;
mod tree;

pub use front_matter::{
    Property, PropertyValue, note_body, read_properties, read_property, remove_property,
    set_property,
};
pub use keys::{AdoptReport, KEY_PROPERTY, SkippedNote, ensure_key, has_key, replace_key};
pub use trash::TrashEntry;
pub use tree::{TreeEntry, TreeEntryKind, read_tree};

pub(crate) use keys::note_paths;
