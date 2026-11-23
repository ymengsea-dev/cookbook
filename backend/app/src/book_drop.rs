//! PDFs dropped on the window are imported here, in Rust, so the UI never handles
//! raw file-system paths (R-1). The UI hears about it through `books-imported`.

use std::path::PathBuf;

use tauri::{DragDropEvent, Emitter, Manager, Window, WindowEvent};

use crate::commands::books::import_books;
use crate::events::BOOKS_IMPORTED;
use crate::state::AppState;

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event else {
        return;
    };
    let pdfs: Vec<PathBuf> = paths
        .iter()
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
        })
        .cloned()
        .collect();
    if pdfs.is_empty() {
        return;
    }
    let Ok(vault) = window.app_handle().state::<AppState>().vault() else {
        return;
    };
    let app = window.app_handle().clone();
    // Copying a large book takes a while; keep the window responsive.
    tauri::async_runtime::spawn_blocking(move || {
        let report = import_books(&vault, &pdfs);
        let _ = app.emit(BOOKS_IMPORTED, report);
    });
}
