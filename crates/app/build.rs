fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Every command must be listed here. Tauri then generates an `allow-<command>`
    // permission for it, and a command works only if a capability grants that permission.
    let manifest = tauri_build::AppManifest::new().commands(&["app_info"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))?;
    Ok(())
}
