mod commands;
mod error;
mod events;
mod lifecycle;
mod state;

use std::process::ExitCode;

use state::AppState;

fn main() -> ExitCode {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .on_window_event(lifecycle::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            lifecycle::app_quit,
            commands::vault::vault_choose,
            commands::vault::vault_restore,
            commands::vault::vault_tree,
            commands::vault::vault_adopt_preview,
            commands::vault::vault_adopt,
            commands::notes::note_read,
            commands::notes::note_save,
            commands::notes::note_create,
            commands::notes::note_rename,
            commands::notes::note_move,
            commands::notes::note_delete,
            commands::notes::trash_list,
            commands::notes::trash_restore,
            commands::settings::settings_get,
            commands::settings::settings_save_vault,
            commands::settings::settings_save_local,
        ])
        .build(tauri::generate_context!());

    match app {
        Ok(app) => {
            app.run(lifecycle::on_run_event);
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Notes could not start: {error}");
            ExitCode::FAILURE
        }
    }
}
