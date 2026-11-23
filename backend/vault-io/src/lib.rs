//! Import and export (IO-1 to IO-5). Notes come in and go out as plain files, and an
//! import never overwrites anything: a name clash gets a number added.
//!
//! Every file written into the vault goes through `VaultWriter::create_new`.

mod error;
mod export_html;
mod export_note;
mod export_zip;
mod import;
mod import_keys;
mod job;
mod links;
mod names;
mod plan;
mod report;
mod walk;

pub use error::IoError;
pub use export_html::export_note_html;
pub use export_note::export_note_markdown;
pub use export_zip::{ZipExport, ZipOptions, export_zip};
pub use import::{ImportSource, import};
pub use job::{Job, QuietJob};
pub use report::{ImportReport, RenamedItem, SkippedItem};
