//! Tauri commands, one file per area. After adding one, register it in `main.rs`,
//! run `pnpm sync:commands`, add it to `CommandMap` in `frontend/src/shared/ipc`, and add a
//! wrapper to the UI domain's `api/` folder.

pub mod app;
pub mod books;
pub mod code;
pub mod io;
pub mod notes;
pub mod search;
pub mod settings;
pub mod vault;
pub mod views;

use crate::error::{CommandError, CommandResult, ErrorCode};

/// Runs slow file work on a blocking thread, so the async runtime stays free.
pub(crate) async fn run_in_background<T, E, F>(work: F) -> CommandResult<T>
where
    T: Send + 'static,
    E: Into<CommandError> + Send + 'static,
    F: FnOnce() -> Result<T, E> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?
        .map_err(Into::into)
}
