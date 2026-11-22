use tauri::State;
use vault_core::{ContentHash, NoteFile, PropertyValue, TrashEntry, VaultPath};

use crate::error::CommandResult;
use crate::state::AppState;

#[tauri::command]
pub async fn note_read(path: VaultPath, state: State<'_, AppState>) -> CommandResult<NoteFile> {
    Ok(state.vault()?.read_note(&path)?)
}

/// Saves only if the file still matches `expected_hash`; otherwise returns `changed-on-disk`.
#[tauri::command]
pub async fn note_save(
    path: VaultPath,
    content: String,
    expected_hash: ContentHash,
    state: State<'_, AppState>,
) -> CommandResult<NoteFile> {
    let result = state.vault()?.save_note(&path, &content, &expected_hash)?;
    state.request_index_sync();
    Ok(result)
}

/// Sets one front matter property, changing only its line (L-5). Never adds a key.
#[tauri::command]
pub async fn note_set_property(
    path: VaultPath,
    key: String,
    value: PropertyValue,
    expected_hash: ContentHash,
    state: State<'_, AppState>,
) -> CommandResult<NoteFile> {
    let result = state
        .vault()?
        .set_note_property(&path, &key, &value, &expected_hash)?;
    state.request_index_sync();
    Ok(result)
}

#[tauri::command]
pub async fn note_create(
    folder: Option<VaultPath>,
    state: State<'_, AppState>,
) -> CommandResult<NoteFile> {
    let result = state.vault()?.create_note(folder.as_ref())?;
    state.request_index_sync();
    Ok(result)
}

#[tauri::command]
pub async fn note_rename(
    path: VaultPath,
    new_name: String,
    state: State<'_, AppState>,
) -> CommandResult<VaultPath> {
    let result = state.vault()?.rename(&path, &new_name)?;
    state.request_index_sync();
    Ok(result)
}

#[tauri::command]
pub async fn note_move(
    path: VaultPath,
    folder: Option<VaultPath>,
    state: State<'_, AppState>,
) -> CommandResult<VaultPath> {
    let result = state.vault()?.move_into(&path, folder.as_ref())?;
    state.request_index_sync();
    Ok(result)
}

/// Moves a note to `.vault/trash`. It can be restored from the Trash page.
#[tauri::command]
pub async fn note_delete(path: VaultPath, state: State<'_, AppState>) -> CommandResult<TrashEntry> {
    let result = state.vault()?.delete(&path)?;
    state.request_index_sync();
    Ok(result)
}

#[tauri::command]
pub async fn trash_list(state: State<'_, AppState>) -> CommandResult<Vec<TrashEntry>> {
    Ok(state.vault()?.trash()?)
}

#[tauri::command]
pub async fn trash_restore(id: String, state: State<'_, AppState>) -> CommandResult<VaultPath> {
    let result = state.vault()?.restore(&id)?;
    state.request_index_sync();
    Ok(result)
}
