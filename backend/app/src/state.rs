use std::sync::{Arc, Mutex, PoisonError};

use tauri::{AppHandle, Emitter, Manager};
use vault_core::{Vault, VaultWatcher, VaultWriter};
use vault_index::NoteIndex;

use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::events::VAULT_CHANGED;
use crate::indexing::Indexer;
use crate::runs::RunRegistry;

/// State shared by all commands. Commands clone the `Arc` so no lock is held during file I/O.
#[derive(Default)]
pub struct AppState {
    vault: Mutex<Option<Arc<Vault>>>,
    /// Watches the open vault. Replacing it stops the old watcher.
    watcher: Mutex<Option<VaultWatcher>>,
    /// Keeps the open vault's search index current.
    indexer: Mutex<Option<Arc<Indexer>>>,
    /// Writes `app.json`, which lives outside any vault.
    pub app_writer: VaultWriter,
    /// Code blocks running now.
    pub runs: Arc<RunRegistry>,
}

impl AppState {
    /// Makes `vault` the open vault and starts sending its outside changes to the UI.
    pub fn open_vault(&self, vault: Vault, app: &AppHandle) -> CommandResult<Arc<Vault>> {
        // Code from the old vault must not keep running in the background.
        self.runs.stop_all();
        let vault = Arc::new(vault);
        // Lets the editor show images from this vault, and from nowhere else.
        app.asset_protocol_scope()
            .allow_directory(vault.root(), true)
            .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;

        let indexer = Arc::new(
            Indexer::start(Arc::clone(&vault), app.clone())
                .map_err(|error| CommandError::new(ErrorCode::Index, error.to_string()))?,
        );

        let emitter = app.clone();
        let watcher_indexer = Arc::clone(&indexer);
        let watcher = vault.watch(move |changes| {
            watcher_indexer.request_sync();
            // The UI may be reloading; a missed event is caught by the next one.
            let _ = emitter.emit(VAULT_CHANGED, changes);
        })?;

        *self.watcher.lock().unwrap_or_else(PoisonError::into_inner) = Some(watcher);
        *self.indexer.lock().unwrap_or_else(PoisonError::into_inner) = Some(indexer);
        *self.vault.lock().unwrap_or_else(PoisonError::into_inner) = Some(Arc::clone(&vault));
        Ok(vault)
    }

    pub fn index(&self) -> CommandResult<Arc<NoteIndex>> {
        let guard = self.indexer.lock().unwrap_or_else(PoisonError::into_inner);
        guard
            .as_ref()
            .map(|indexer| indexer.index())
            .ok_or_else(CommandError::no_vault)
    }

    /// Call after the app writes files. The watcher ignores the app's own writes,
    /// so without this the index would miss them.
    pub fn request_index_sync(&self) {
        if let Some(indexer) = self
            .indexer
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
        {
            indexer.request_sync();
        }
    }

    pub fn vault(&self) -> CommandResult<Arc<Vault>> {
        let guard = self.vault.lock().unwrap_or_else(PoisonError::into_inner);
        guard.clone().ok_or_else(CommandError::no_vault)
    }
}
