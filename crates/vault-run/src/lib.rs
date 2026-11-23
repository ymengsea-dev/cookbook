//! Runs code blocks from notes (E-11 to E-16): finds the runner for a fence label, writes
//! the code to a temp file, runs it in the note's folder with a time limit, and streams output.
//!
//! Nothing here runs by itself. A program starts only through `start`, which the app calls
//! when the user presses Run or ⌘↩. This crate has no network code.

mod config;
mod error;
mod events;
mod locate;
mod output;
mod program;
mod run;
mod trust;

pub use config::{RunSettings, Runner};
pub use error::RunError;
pub use events::{OutputStream, RunEvent, RunOutcome};
pub use program::{OUTPUT_LIMIT_BYTES, Program, Stopper};
pub use run::{CodeRequest, Consent, start};
pub use trust::{RunTrust, accept_warning, mark_untrusted, trust_note};
