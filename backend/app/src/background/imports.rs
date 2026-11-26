//! Imports that run off the main thread. The File menu commands and drops on the window
//! share them: notes, folders and ZIPs (IO-1, IO-2) and PDF books (R-1).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use ts_rs::TS;
use vault_core::{Vault, VaultPath};
use vault_io::{ImportReport, ImportSource};

use crate::commands::run_in_background;
use crate::error::CommandResult;
use crate::events::IO_FINISHED;
use crate::state::AppState;

/// How an import or export ended, sent as `io-finished`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum IoOutcome {
    Imported {
        report: ImportReport,
    },
    /// `place` is where the files went, shown to the user.
    Exported {
        files: usize,
        place: String,
    },
    /// Only for drops on the window, which have no caller to return an error to.
    Failed {
        message: String,
    },
}

/// What an import did, from the menu or a drop on the window (R-1).
#[derive(Debug, Default, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BookImport {
    pub imported: Vec<VaultPath>,
    /// One message per file that could not be imported.
    pub problems: Vec<String>,
}

/// Runs an import off the main thread, then tells the UI. Used by commands and window drops.
pub async fn import_in_background(app: AppHandle, source: ImportSource) -> CommandResult<()> {
    let worker = app.clone();
    let report = run_in_background(move || import_now(&worker, &source)).await?;
    finished(&app, IoOutcome::Imported { report });
    Ok(())
}

fn import_now(app: &AppHandle, source: &ImportSource) -> CommandResult<ImportReport> {
    let state = app.state::<AppState>();
    let vault = state.vault()?;
    let jobs = Arc::clone(&state.io_jobs);
    let job = jobs.start(app.clone())?;
    let report = vault_io::import(&vault, source, &job, now_seconds())?;
    // Code that came from elsewhere must be trusted once before it runs (E-15).
    vault_run::mark_untrusted(&vault, &report.code_note_keys)?;
    state.request_index_sync();
    Ok(report)
}

pub fn finished(app: &AppHandle, outcome: IoOutcome) {
    // The UI may be reloading; the report is also saved in .vault/imports/.
    let _ = app.emit(IO_FINISHED, outcome);
}

/// Imports each file, carrying on past the ones that fail.
pub fn import_books(vault: &Vault, sources: &[PathBuf]) -> BookImport {
    let mut report = BookImport::default();
    for source in sources {
        match vault.import_book(source) {
            Ok(path) => report.imported.push(path),
            Err(error) => report.problems.push(error.to_string()),
        }
    }
    report
}

pub fn is_zip(path: &std::path::Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
}

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}
