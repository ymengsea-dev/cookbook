mod commands;

use std::process::ExitCode;

fn main() -> ExitCode {
    let result = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!());

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Notes could not start: {error}");
            ExitCode::FAILURE
        }
    }
}
