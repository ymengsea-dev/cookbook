use tauri::State;
use vault_index::SearchHit;

use crate::error::CommandResult;
use crate::state::AppState;

/// Full-text search over every note (X-5, X-6).
#[tauri::command]
pub async fn search_notes(
    query: String,
    limit: u32,
    state: State<'_, AppState>,
) -> CommandResult<Vec<SearchHit>> {
    let index = state.index()?;
    let limit = usize::try_from(limit).unwrap_or(usize::MAX);
    Ok(index.search(&query, limit)?)
}
