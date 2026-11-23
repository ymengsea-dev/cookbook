use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};
use ts_rs::TS;
use vault_core::VaultPath;
use vault_io::{ImportReport, ImportSource, ZipOptions};

use super::run_in_background;
use crate::error::{CommandError, CommandResult, ErrorCode};
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

/// Imports a folder of notes, keeping its structure (IO-1).
#[tauri::command]
pub async fn io_import_folder(app: AppHandle) -> CommandResult<()> {
    let dialog = app.dialog().file().set_title("Import a Folder of Notes");
    let Some(folder) = ask(dialog, |dialog| dialog.blocking_pick_folder()).await? else {
        return Ok(());
    };
    import_in_background(app, ImportSource::Folder(local_path(folder)?)).await
}

/// Imports `.md` and `.txt` files as notes, and ZIPs with their folders (IO-2).
#[tauri::command]
pub async fn io_import_files(app: AppHandle) -> CommandResult<()> {
    let dialog = app
        .dialog()
        .file()
        .set_title("Import Notes")
        .add_filter("Notes and ZIP files", &["md", "txt", "zip"]);
    let Some(picked) = ask(dialog, |dialog| dialog.blocking_pick_files()).await? else {
        return Ok(());
    };
    let mut files = Vec::new();
    for file in picked {
        files.push(local_path(file)?);
    }
    let (zips, notes): (Vec<PathBuf>, Vec<PathBuf>) =
        files.into_iter().partition(|file| is_zip(file));
    if !notes.is_empty() {
        import_in_background(app.clone(), ImportSource::Files(notes)).await?;
    }
    for zip in zips {
        import_in_background(app.clone(), ImportSource::Zip(zip)).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn io_cancel(state: State<'_, AppState>) -> CommandResult<()> {
    state.io_jobs.cancel();
    Ok(())
}

/// Saves the note and the files it links to into a new folder (IO-4).
#[tauri::command]
pub async fn note_export_markdown(
    path: VaultPath,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let vault = state.vault()?;
    let dialog = app.dialog().file().set_title("Export Note To");
    let Some(folder) = ask(dialog, |dialog| dialog.blocking_pick_folder()).await? else {
        return Ok(());
    };
    let into = local_path(folder)?;
    let written =
        run_in_background(move || vault_io::export_note_markdown(&vault, &path, &into)).await?;
    finished(
        &app,
        IoOutcome::Exported {
            files: 1,
            place: written.display().to_string(),
        },
    );
    Ok(())
}

/// Saves the note as one HTML file with its images inside (IO-4).
#[tauri::command]
pub async fn note_export_html(
    path: VaultPath,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let vault = state.vault()?;
    let name = format!("{}.html", path.file_name().trim_end_matches(".md"));
    let dialog = app
        .dialog()
        .file()
        .set_title("Export as HTML")
        .set_file_name(name)
        .add_filter("HTML", &["html"]);
    let Some(file) = ask(dialog, |dialog| dialog.blocking_save_file()).await? else {
        return Ok(());
    };
    let to = local_path(file)?;
    let place = to.display().to_string();
    run_in_background(move || vault_io::export_note_html(&vault, &path, &to)).await?;
    finished(&app, IoOutcome::Exported { files: 1, place });
    Ok(())
}

/// Saves a folder or the whole vault as a ZIP of plain files (IO-5).
#[tauri::command]
pub async fn io_export_zip(
    options: ZipOptions,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let vault = state.vault()?;
    let name = options
        .folder
        .as_ref()
        .map_or_else(|| vault.name(), |folder| folder.file_name().to_string());
    let dialog = app
        .dialog()
        .file()
        .set_title("Export as ZIP")
        .set_file_name(format!("{name}.zip"))
        .add_filter("ZIP", &["zip"]);
    let Some(file) = ask(dialog, |dialog| dialog.blocking_save_file()).await? else {
        return Ok(());
    };
    let to = local_path(file)?;
    let place = to.display().to_string();
    let job = state.io_jobs.start(app.clone())?;
    let export =
        run_in_background(move || vault_io::export_zip(&vault, &options, &to, &job)).await?;
    finished(
        &app,
        IoOutcome::Exported {
            files: export.files,
            place,
        },
    );
    Ok(())
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

/// Shows a native dialog off the main thread, and waits for the answer.
async fn ask<T: Send + 'static>(
    dialog: FileDialogBuilder<tauri::Wry>,
    show: impl FnOnce(FileDialogBuilder<tauri::Wry>) -> Option<T> + Send + 'static,
) -> CommandResult<Option<T>> {
    tauri::async_runtime::spawn_blocking(move || show(dialog))
        .await
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))
}

fn local_path(file: FilePath) -> CommandResult<PathBuf> {
    file.into_path()
        .map_err(|_| CommandError::new(ErrorCode::InvalidPath, "That location is not on this Mac."))
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
