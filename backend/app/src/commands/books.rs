use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use ts_rs::TS;
use vault_core::{Book, BookId, ReadingPosition, Vault, VaultPath};

use super::run_in_background;
use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::events::BOOKS_IMPORTED;
use crate::state::AppState;

/// What an import did, from the menu or a drop on the window (R-1).
#[derive(Debug, Default, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BookImport {
    pub imported: Vec<VaultPath>,
    /// One message per file that could not be imported.
    pub problems: Vec<String>,
}

/// PDF.js data files bundled with the app, which it asks for while drawing (R-3).
#[derive(Debug, Clone, Copy, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ReaderDataKind {
    /// Character maps for CJK and other non-Latin PDFs.
    CMap,
    /// Fonts for PDFs that don't embed theirs.
    StandardFont,
}

/// Every PDF in the vault, most recently read first (R-2).
#[tauri::command]
pub async fn book_list(state: State<'_, AppState>) -> CommandResult<Vec<Book>> {
    let vault = state.vault()?;
    run_in_background(move || vault.library()).await
}

/// Shows the native file picker and copies the chosen PDFs into `books/`. Like a drop on
/// the window, it reports through `books-imported`.
#[tauri::command]
pub async fn book_import(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    let vault = state.vault()?;
    let dialog = app
        .dialog()
        .file()
        .set_title("Import Books")
        .add_filter("PDF", &["pdf"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_files())
        .await
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;
    let sources: Vec<PathBuf> = picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|file| file.into_path().ok())
        .collect();
    if sources.is_empty() {
        return Ok(());
    }
    let report =
        run_in_background(move || Ok::<_, CommandError>(import_books(&vault, &sources))).await?;
    // The UI may be reloading; the Books page lists the new books when it next loads.
    let _ = app.emit(BOOKS_IMPORTED, report);
    Ok(())
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

/// The PDF's bytes, for PDF.js. Sent raw, not as JSON, because books are large.
#[tauri::command]
pub async fn book_read(path: VaultPath, state: State<'_, AppState>) -> CommandResult<Response> {
    let vault = state.vault()?;
    let bytes = run_in_background(move || vault.read_book(&path)).await?;
    Ok(Response::new(bytes))
}

/// The cached cover as JPEG bytes, or no bytes when there is none yet.
#[tauri::command]
pub async fn book_cover(id: BookId, state: State<'_, AppState>) -> CommandResult<Response> {
    let cover = state.vault()?.book_cover(&id).unwrap_or_default();
    Ok(Response::new(cover))
}

/// Saves the title, page count and cover that PDF.js read from the book (R-1).
#[tauri::command]
pub async fn book_save_details(
    id: BookId,
    title: String,
    pages: u32,
    cover: Vec<u8>,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let vault = state.vault()?;
    run_in_background(move || {
        vault.save_book_cover(&id, &cover)?;
        vault.save_book_details(&id, &title, pages)
    })
    .await
}

/// Saves where reading stopped (R-4).
#[tauri::command]
pub async fn book_save_position(
    id: BookId,
    position: ReadingPosition,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let vault = state.vault()?;
    let now = now_millis();
    run_in_background(move || vault.save_reading_position(&id, position, now)).await
}

/// One bundled PDF.js data file. Loading these over IPC keeps the CSP closed to `fetch`.
#[tauri::command]
pub async fn reader_data(
    kind: ReaderDataKind,
    name: String,
    app: AppHandle,
) -> CommandResult<Response> {
    let is_plain_name = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !name.contains("..");
    if !is_plain_name {
        return Err(CommandError::new(
            ErrorCode::InvalidPath,
            format!("\"{name}\" is not a reader file."),
        ));
    }
    let folder = match kind {
        ReaderDataKind::CMap => "pdfjs/cmaps",
        ReaderDataKind::StandardFont => "pdfjs/standard_fonts",
    };
    let resources = app
        .path()
        .resource_dir()
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;
    let path = resources.join(folder).join(&name);
    let bytes = run_in_background(move || {
        std::fs::read(&path)
            .map_err(|error| CommandError::new(ErrorCode::NotFound, error.to_string()))
    })
    .await?;
    Ok(Response::new(bytes))
}

fn now_millis() -> u64 {
    let since_1970 = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    u64::try_from(since_1970.as_millis()).unwrap_or(u64::MAX)
}
