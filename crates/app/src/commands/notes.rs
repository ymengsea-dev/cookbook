use tauri::State;
use vault_core::{ContentHash, NoteFile, TrashEntry, VaultPath};

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
    Ok(state.vault()?.save_note(&path, &content, &expected_hash)?)
}

#[tauri::command]
pub async fn note_create(
    folder: Option<VaultPath>,
    state: State<'_, AppState>,
) -> CommandResult<NoteFile> {
    Ok(state.vault()?.create_note(folder.as_ref())?)
}

#[tauri::command]
pub async fn note_rename(
    path: VaultPath,
    new_name: String,
    state: State<'_, AppState>,
) -> CommandResult<VaultPath> {
    Ok(state.vault()?.rename(&path, &new_name)?)
}

#[tauri::command]
pub async fn note_move(
    path: VaultPath,
    folder: Option<VaultPath>,
    state: State<'_, AppState>,
) -> CommandResult<VaultPath> {
    Ok(state.vault()?.move_into(&path, folder.as_ref())?)
}

/// Moves a note to `.vault/trash`. It can be restored from the Trash page.
#[tauri::command]
pub async fn note_delete(path: VaultPath, state: State<'_, AppState>) -> CommandResult<TrashEntry> {
    Ok(state.vault()?.delete(&path)?)
}

#[tauri::command]
pub async fn trash_list(state: State<'_, AppState>) -> CommandResult<Vec<TrashEntry>> {
    Ok(state.vault()?.trash()?)
}

#[tauri::command]
pub async fn trash_restore(id: String, state: State<'_, AppState>) -> CommandResult<VaultPath> {
    Ok(state.vault()?.restore(&id)?)
}
