use tauri::State;
use vault_core::{ContentHash, NoteFile, VaultPath};
use vault_views::{ViewData, ViewDefinition, ViewKind, ViewSource};

use super::run_in_background;
use crate::error::CommandResult;
use crate::state::AppState;

/// Every saved view, for the sidebar and the views page (L-8).
#[tauri::command]
pub async fn view_list(state: State<'_, AppState>) -> CommandResult<Vec<ViewDefinition>> {
    let vault = state.vault()?;
    run_in_background(move || vault_views::list_views(&vault)).await
}

#[tauri::command]
pub async fn view_create(
    name: String,
    kind: ViewKind,
    source: ViewSource,
    state: State<'_, AppState>,
) -> CommandResult<ViewDefinition> {
    let vault = state.vault()?;
    run_in_background(move || vault_views::create_view(&vault, &name, kind, source)).await
}

/// Saves columns, filters, sort, grouping and pinning. Unknown keys in the file are kept.
#[tauri::command]
pub async fn view_save(
    definition: ViewDefinition,
    state: State<'_, AppState>,
) -> CommandResult<ViewDefinition> {
    let vault = state.vault()?;
    run_in_background(move || vault_views::save_view(&vault, &definition)).await
}

/// Runs the view against the index. The UI calls it again on `index-updated`.
#[tauri::command]
pub async fn view_open(id: String, state: State<'_, AppState>) -> CommandResult<ViewData> {
    let vault = state.vault()?;
    let index = state.index()?;
    run_in_background(move || vault_views::open_view(&vault, &index, &id)).await
}

/// "New note" in a list, or "Add card" in a board column (L-6, B-6).
#[tauri::command]
pub async fn view_new_note(
    id: String,
    column: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<NoteFile> {
    let vault = state.vault()?;
    let index = state.index()?;
    let note = run_in_background(move || {
        vault_views::new_note_in_view(&vault, &index, &id, column.as_deref())
    })
    .await?;
    state.request_index_sync();
    Ok(note)
}

/// A card dropped in `column` at the place given by `order` (B-4, B-5).
#[tauri::command]
pub async fn view_move_card(
    id: String,
    path: VaultPath,
    expected_hash: ContentHash,
    column: String,
    order: Vec<String>,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let vault = state.vault()?;
    let index = state.index()?;
    run_in_background(move || {
        vault_views::move_card(&vault, &index, &id, &path, &expected_hash, &column, order)
    })
    .await?;
    state.request_index_sync();
    Ok(())
}

/// Renames a board column by changing the value in each of its notes. Returns how many.
#[tauri::command]
pub async fn view_rename_column(
    id: String,
    from: String,
    to: String,
    state: State<'_, AppState>,
) -> CommandResult<u32> {
    let vault = state.vault()?;
    let index = state.index()?;
    let renamed = run_in_background(move || {
        vault_views::rename_board_column(&vault, &index, &id, &from, &to)
    })
    .await?;
    state.request_index_sync();
    Ok(renamed)
}
