use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use vault_core::{LocalSettings, SettingsSnapshot, Theme, ThemeFile, ThemeList, VaultSettings};
use vault_run::RunSettings;

use crate::error::{CommandError, CommandResult, ErrorCode};
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

/// The themes in `.vault/themes/` (U-4). Built-in themes live in the UI.
#[tauri::command]
pub async fn theme_list(state: State<'_, AppState>) -> CommandResult<ThemeList> {
    Ok(state.vault()?.themes())
}

/// Picks a theme file and copies it into `.vault/themes/`. None if the user cancelled.
#[tauri::command]
pub async fn theme_import(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<Theme>> {
    let vault = state.vault()?;
    let dialog = app
        .dialog()
        .file()
        .set_title("Import a Theme")
        .add_filter("Theme", &["json"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_file())
        .await
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;
    let Some(file) = picked else {
        return Ok(None);
    };
    let source = file
        .into_path()
        .map_err(|_| CommandError::new(ErrorCode::InvalidPath, "That file is not on this Mac."))?;
    Ok(Some(vault.import_theme(&source)?))
}

/// Saves a theme, built-in or not, as a JSON file to share (U-4).
#[tauri::command]
pub async fn theme_export(theme: ThemeFile, app: AppHandle) -> CommandResult<()> {
    let text = theme.to_json()?;
    let dialog = app
        .dialog()
        .file()
        .set_title("Export Theme")
        .set_file_name(format!("{}.json", theme.name))
        .add_filter("Theme", &["json"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_save_file())
        .await
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))?;
    let Some(file) = picked else {
        return Ok(());
    };
    let target = file.into_path().map_err(|_| {
        CommandError::new(ErrorCode::InvalidPath, "That location is not on this Mac.")
    })?;
    std::fs::write(&target, text)
        .map_err(|error| CommandError::new(ErrorCode::Io, error.to_string()))
}
