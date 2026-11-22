use serde::Serialize;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use ts_rs::TS;
use vault_core::{
    AdoptReport, TreeEntry, Vault, VaultError, VaultPath, load_app_settings, remember_vault,
};

use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::state::AppState;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VaultInfo {
    pub name: String,
    pub root: String,
}

impl VaultInfo {
    fn of(vault: &Vault) -> Self {
        Self {
            name: vault.name(),
            root: vault.root().display().to_string(),
        }
    }
}

/// Shows the native folder picker and opens the chosen folder.
/// The picker runs here, not in the UI, so the UI never sends raw file-system paths.
#[tauri::command]
pub async fn vault_choose(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<VaultInfo>> {
    let dialog = app.dialog().file().set_title("Open a Folder as a Vault");
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;

    let Some(folder) = picked else {
        return Ok(None);
    };
    let path = folder.into_path().map_err(|_| {
        CommandError::new(
            ErrorCode::InvalidPath,
            "That location is not a folder on this Mac.",
        )
    })?;

    let vault = state.open_vault(Vault::open(path)?, &app)?;
    // Remembering is a convenience; failing to write app.json must not block opening.
    if let Ok(app_json) = app_json_path(&app) {
        let _ = remember_vault(&app_json, vault.root(), &state.app_writer);
    }
    Ok(Some(VaultInfo::of(&vault)))
}

/// Reopens the vault from last time, if it still exists (S-1).
#[tauri::command]
pub async fn vault_restore(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<VaultInfo>> {
    let Some(last) = load_app_settings(&app_json_path(&app)?).last_vault else {
        return Ok(None);
    };
    let Ok(vault) = Vault::open(&last) else {
        return Ok(None); // Moved or deleted since last time.
    };
    let vault = state.open_vault(vault, &app)?;
    Ok(Some(VaultInfo::of(&vault)))
}

/// `app.json` lives in the app-support folder, outside every vault.
fn app_json_path(app: &AppHandle) -> CommandResult<PathBuf> {
    let folder = app
        .path()
        .app_config_dir()
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;
    Ok(folder.join("app.json"))
}

#[tauri::command]
pub async fn vault_tree(state: State<'_, AppState>) -> CommandResult<Vec<TreeEntry>> {
    Ok(state.vault()?.tree()?)
}

/// Notes that "adopt vault" would give a key, for the preview (V-5).
#[tauri::command]
pub async fn vault_adopt_preview(state: State<'_, AppState>) -> CommandResult<Vec<VaultPath>> {
    let vault = state.vault()?;
    run_in_background(move || vault.notes_without_key()).await
}

/// Backs up every note without a key, then adds the keys (V-5).
#[tauri::command]
pub async fn vault_adopt(state: State<'_, AppState>) -> CommandResult<AdoptReport> {
    let vault = state.vault()?;
    let report = run_in_background(move || vault.adopt()).await?;
    state.request_index_sync();
    Ok(report)
}

/// Runs slow file work on a blocking thread, so the async runtime stays free.
async fn run_in_background<T, F>(work: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, VaultError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?
        .map_err(CommandError::from)
}
