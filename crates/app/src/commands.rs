//! Tauri commands. Each one must also be listed in `build.rs`, granted in
//! `capabilities/default.json` and added to the UI's `CommandMap`.
//! Types the UI sees derive `TS`; `cargo test` writes them to `ui/src/shared/ipc/bindings/`.

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    let info = app.package_info();
    AppInfo {
        name: info.name.clone(),
        version: info.version.to_string(),
    }
}
