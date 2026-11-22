fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Every command must be listed here. Tauri then generates an `allow-<command>`
    // permission for it, and a command works only if a capability grants that permission.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "app_info",
        "app_quit",
        "vault_choose",
        "vault_restore",
        "vault_tree",
        "vault_adopt_preview",
        "vault_adopt",
        "note_read",
        "note_save",
        "note_set_property",
        "note_create",
        "note_rename",
        "note_move",
        "note_delete",
        "trash_list",
        "trash_restore",
        "search_notes",
        "view_list",
        "view_create",
        "view_save",
        "view_open",
        "view_new_note",
        "view_move_card",
        "view_rename_column",
        "settings_get",
        "settings_save_vault",
        "settings_save_local",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))?;
    Ok(())
}
