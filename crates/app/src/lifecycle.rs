//! Quitting safely: the UI gets a chance to save the open note first (E-5).
//!
//! Closing the window or pressing ⌘Q is held back, the UI is told with `before-quit`,
//! and it calls `app_quit` once saved. If it doesn't answer in time, the app quits anyway.

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, RunEvent, Window, WindowEvent};

use crate::events::BEFORE_QUIT;
use crate::state::AppState;

const SAVE_TIMEOUT: Duration = Duration::from_secs(3);

/// Set once quitting is allowed, so the second close or exit request goes through.
static QUITTING: AtomicBool = AtomicBool::new(false);

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event
        && !QUITTING.load(Ordering::SeqCst)
    {
        api.prevent_close();
        ask_ui_to_save(window.app_handle());
    }
}

pub fn on_run_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::ExitRequested { api, .. } = &event
        && !QUITTING.load(Ordering::SeqCst)
    {
        api.prevent_exit();
        ask_ui_to_save(app);
    }
}

/// Called by the UI when it has saved everything.
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    quit(&app);
}

fn ask_ui_to_save(app: &AppHandle) {
    if app.emit(BEFORE_QUIT, ()).is_err() {
        quit(app);
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(SAVE_TIMEOUT);
        quit(&app);
    });
}

fn quit(app: &AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    // Running code blocks are in their own process groups, so they would outlive the app.
    app.state::<AppState>().runs.stop_all();
    app.exit(0);
}
