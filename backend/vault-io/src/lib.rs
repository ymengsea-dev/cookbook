//! Import and export (IO-1 to IO-5). Notes come in and go out as plain files, and an
//! import never overwrites anything: a name clash gets a number added.
//!
//! Every file written into the vault goes through `VaultWriter::create_new`.

mod error;
mod export;
mod import;
mod job;
mod shared;

pub use error::IoError;
pub use export::html::export_note_html;
pub use export::markdown::export_note_markdown;
pub use export::zip_archive::{ZipExport, ZipOptions, export_zip};
pub use import::report::{ImportReport, RenamedItem, SkippedItem};
pub use import::{ImportSource, import};
pub use job::{Job, QuietJob};
