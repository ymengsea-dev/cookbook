use tauri::State;
use vault_core::{LocalSettings, SettingsSnapshot, VaultSettings};
use vault_run::RunSettings;

use crate::error::CommandResult;
use crate::state::AppState;

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> CommandResult<SettingsSnapshot> {
    let vault = state.vault()?;
    let mut snapshot = vault.load_settings();
    // Bad runners in settings.local.json show with the other settings warnings (S-4).
    for warning in RunSettings::load(&vault).warnings {
        if !snapshot.warnings.contains(&warning) {
            snapshot.warnings.push(warning);
        }
    }
    Ok(snapshot)
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
