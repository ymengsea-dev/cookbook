mod background;
mod commands;
mod consent;
mod error;
mod events;
mod state;

use std::process::ExitCode;

use state::AppState;

fn main() -> ExitCode {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .on_window_event(|window, event| {
            background::lifecycle::on_window_event(window, event);
            background::file_drop::on_window_event(window, event);
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            background::lifecycle::app_quit,
            commands::vault::vault_choose,
            commands::vault::vault_restore,
            commands::vault::vault_tree,
            commands::vault::vault_adopt_preview,
            commands::vault::vault_adopt,
            commands::notes::note_read,
            commands::notes::note_save,
            commands::notes::note_set_property,
            commands::notes::note_create,
            commands::notes::note_rename,
            commands::notes::note_move,
            commands::notes::note_delete,
            commands::notes::trash_list,
            commands::notes::trash_restore,
            commands::search::search_notes,
            commands::views::view_list,
            commands::views::view_create,
            commands::views::view_save,
            commands::views::view_open,
            commands::views::view_new_note,
            commands::views::view_move_card,
            commands::views::view_rename_column,
            commands::settings::settings_get,
            commands::settings::settings_save_vault,
            commands::settings::settings_save_local,
            commands::settings::theme_list,
            commands::settings::theme_import,
            commands::settings::theme_export,
            commands::code::code_runners,
            commands::code::code_run,
            commands::code::code_stop,
            commands::books::book_list,
            commands::books::book_import,
            commands::books::book_read,
            commands::books::book_cover,
            commands::books::book_save_details,
            commands::books::book_save_position,
            commands::books::reader_data,
            commands::io::io_import_folder,
            commands::io::io_import_files,
            commands::io::io_cancel,
            commands::io::io_export_zip,
            commands::io::note_export_markdown,
            commands::io::note_export_html,
        ])
        .build(tauri::generate_context!());

    match app {
        Ok(app) => {
            app.run(background::lifecycle::on_run_event);
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Notes could not start: {error}");
            ExitCode::FAILURE
        }
    }
}
