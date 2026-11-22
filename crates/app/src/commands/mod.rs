//! Tauri commands, one file per area. After adding one, register it in `main.rs`,
//! run `pnpm sync:commands`, and add it to `CommandMap` in `ui/src/shared/ipc`.

pub mod app;
pub mod notes;
pub mod search;
pub mod settings;
pub mod vault;
