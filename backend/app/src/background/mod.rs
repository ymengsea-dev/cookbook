//! Work that outlives a single command: indexing, import and export jobs, code runs, files
//! dropped on the window, and the quit handshake.

pub mod file_drop;
pub mod imports;
pub mod indexing;
pub mod io_jobs;
pub mod lifecycle;
pub mod runs;
