use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use vault_core::VaultPath;
use vault_run::{CodeRequest, RunError, RunEvent, RunSettings};

use super::run_in_background;
use crate::consent::DialogConsent;
use crate::error::CommandResult;
use crate::state::AppState;

/// The fence labels that have a runner, so the editor knows where to show Run (E-11).
#[tauri::command]
pub async fn code_runners(state: State<'_, AppState>) -> CommandResult<Vec<String>> {
    let vault = state.vault()?;
    Ok(RunSettings::load(&vault).labels())
}

/// Runs one code block and streams `RunEvent`s until it ends (E-12, E-16).
/// This is the only way the UI can start a program, and only for configured runners.
#[tauri::command]
pub async fn code_run(
    run_id: String,
    path: VaultPath,
    language: String,
    code: String,
    on_event: Channel<RunEvent>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let vault = state.vault()?;
    let runs = Arc::clone(&state.runs);
    run_in_background(move || {
        let request = CodeRequest {
            note: &path,
            label: &language,
            code: &code,
        };
        let program = vault_run::start(&vault, &request, &DialogConsent::new(app))?;
        runs.add(run_id.clone(), program.stopper());
        // A closed note no longer listens; its output is dropped.
        program.wait(|event| {
            let _ = on_event.send(event);
        });
        runs.remove(&run_id);
        Ok::<(), RunError>(())
    })
    .await
}

#[tauri::command]
pub async fn code_stop(run_id: String, state: State<'_, AppState>) -> CommandResult<()> {
    state.runs.stop(&run_id);
    Ok(())
}
