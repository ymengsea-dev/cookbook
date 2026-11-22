use std::sync::{Arc, Mutex, PoisonError};

use tauri::{AppHandle, Emitter, Manager};
use vault_core::{Vault, VaultWatcher, VaultWriter};

use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::events::VAULT_CHANGED;

/// State shared by all commands. Commands clone the `Arc` so no lock is held during file I/O.
#[derive(Default)]
pub struct AppState {
    vault: Mutex<Option<Arc<Vault>>>,
    /// Watches the open vault. Replacing it stops the old watcher.
    watcher: Mutex<Option<VaultWatcher>>,
    /// Writes `app.json`, which lives outside any vault.
    pub app_writer: VaultWriter,
}

impl AppState {
    /// Makes `vault` the open vault and starts sending its outside changes to the UI.
    pub fn open_vault(&self, vault: Vault, app: &AppHandle) -> CommandResult<Arc<Vault>> {
        let vault = Arc::new(vault);
        // Lets the editor show images from this vault, and from nowhere else.
        app.asset_protocol_scope()
            .allow_directory(vault.root(), true)
            .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;

        let emitter = app.clone();
        let watcher = vault.watch(move |changes| {
            // The UI may be reloading; a missed event is caught by the next one.
            let _ = emitter.emit(VAULT_CHANGED, changes);
        })?;

        *self.watcher.lock().unwrap_or_else(PoisonError::into_inner) = Some(watcher);
        *self.vault.lock().unwrap_or_else(PoisonError::into_inner) = Some(Arc::clone(&vault));
        Ok(vault)
    }

    pub fn vault(&self) -> CommandResult<Arc<Vault>> {
        let guard = self.vault.lock().unwrap_or_else(PoisonError::into_inner);
        guard.clone().ok_or_else(CommandError::no_vault)
    }
}
