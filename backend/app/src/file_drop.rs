//! Files dropped on the window are handled here, in Rust, so the UI never sees raw
//! file-system paths: PDFs become books (R-1); notes, folders and ZIPs are imported (IO-1, IO-2).

use std::path::PathBuf;

use tauri::{AppHandle, DragDropEvent, Emitter, Manager, Window, WindowEvent};
use vault_io::ImportSource;

use crate::commands::books::import_books;
use crate::commands::io::{IoOutcome, finished, import_in_background, is_zip};
use crate::events::BOOKS_IMPORTED;
use crate::state::AppState;

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event else {
        return;
    };
    let app = window.app_handle().clone();
    let paths = paths.clone();
    // Copying takes a while; keep the window responsive.
    tauri::async_runtime::spawn(async move {
        handle_drop(app, paths).await;
    });
}

async fn handle_drop(app: AppHandle, paths: Vec<PathBuf>) {
    let Ok(vault) = app.state::<AppState>().vault() else {
        return;
    };
    let (pdfs, others): (Vec<PathBuf>, Vec<PathBuf>) = paths
        .into_iter()
        .partition(|path| has_extension(path, "pdf"));
    if !pdfs.is_empty() {
        let copied =
            tauri::async_runtime::spawn_blocking(move || import_books(&vault, &pdfs)).await;
        if let Ok(report) = copied {
            let _ = app.emit(BOOKS_IMPORTED, report);
        }
    }

    let mut notes = Vec::new();
    let mut sources = Vec::new();
    for path in others {
        if path.is_dir() {
            sources.push(ImportSource::Folder(path));
        } else if is_zip(&path) {
            sources.push(ImportSource::Zip(path));
        } else if has_extension(&path, "md") || has_extension(&path, "txt") {
            notes.push(path);
        }
    }
    if !notes.is_empty() {
        sources.push(ImportSource::Files(notes));
    }
    for source in sources {
        if let Err(error) = import_in_background(app.clone(), source).await {
            finished(
                &app,
                IoOutcome::Failed {
                    message: error.message,
                },
            );
        }
    }
}

fn has_extension(path: &std::path::Path, wanted: &str) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(wanted))
}
