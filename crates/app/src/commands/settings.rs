use tauri::State;
use vault_core::{LocalSettings, SettingsSnapshot, VaultSettings};

use crate::error::CommandResult;
use crate::state::AppState;

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> CommandResult<SettingsSnapshot> {
    Ok(state.vault()?.load_settings())
}

#[tauri::command]
pub async fn settings_save_vault(
    settings: VaultSettings,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    Ok(state.vault()?.save_vault_settings(&settings)?)
}

#[tauri::command]
pub async fn settings_save_local(
    settings: LocalSettings,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    Ok(state.vault()?.save_local_settings(&settings)?)
}
