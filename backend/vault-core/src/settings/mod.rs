//! The settings files (S-1). Each has one job, and there is no hidden settings store:
//! - `app.json` in the app-support folder: known vaults and the last one opened.
//! - `.vault/settings.json`: vault settings, synced to other devices.
//! - `.vault/settings.local.json`: this device only, never synced.
//! - `.vault/themes/`: theme files, synced (`themes.rs`).

mod appearance;
mod json_file;
mod themes;

use std::ops::RangeInclusive;
use std::path::Path;
use std::sync::PoisonError;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::{Vault, VaultError, VaultPath, VaultWriter};

pub use appearance::{
    AppearanceSettings, Density, FontSettings, LayoutSettings, SidebarSide, ThemeMode,
    is_hex_colour, is_theme_id,
};
pub use json_file::{JsonFile, SCHEMA_VERSION};
pub use themes::{THEMES_DIR, Theme, ThemeColors, ThemeFile, ThemeList};

const VAULT_FILE: &str = ".vault/settings.json";
const LOCAL_FILE: &str = ".vault/settings.local.json";
const AUTOSAVE_MS: RangeInclusive<u32> = 200..=10_000;
const MAX_KNOWN_VAULTS: usize = 10;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VaultSettings {
    pub editor: EditorSettings,
    pub appearance: AppearanceSettings,
    pub fonts: FontSettings,
    pub layout: LayoutSettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EditorSettings {
    /// Pause after typing before the note saves itself.
    pub autosave_ms: u32,
    pub line_numbers: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            autosave_ms: 800,
            line_numbers: false,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LocalSettings {
    /// The note to reopen on launch.
    pub last_note: Option<VaultPath>,
}

/// Everything the settings screen needs, plus any problems found while loading.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SettingsSnapshot {
    pub vault: VaultSettings,
    /// What "Reset to default" restores (U-5).
    pub defaults: VaultSettings,
    pub local: LocalSettings,
    pub warnings: Vec<String>,
    pub read_only: bool,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct AppSettings {
    pub known_vaults: Vec<String>,
    pub last_vault: Option<String>,
}

impl Vault {
    /// Reads both vault settings files. Missing or bad values fall back to defaults (S-4).
    pub fn load_settings(&self) -> SettingsSnapshot {
        let mut vault_file = JsonFile::load(&self.root().join(VAULT_FILE), "settings.json");
        let defaults = EditorSettings::default();
        let editor = EditorSettings {
            autosave_ms: vault_file.get("/editor/autosaveMs", defaults.autosave_ms, |ms| {
                AUTOSAVE_MS.contains(ms)
            }),
            line_numbers: vault_file.get("/editor/lineNumbers", defaults.line_numbers, |_| true),
        };
        let appearance = appearance::load_appearance(&mut vault_file);
        let fonts = appearance::load_fonts(&mut vault_file);
        let layout = appearance::load_layout(&mut vault_file);

        let mut local_file = self.local_settings_file();
        let last_note = local_file.get("/lastNote", None, |_| true);

        let mut warnings = vault_file.warnings;
        warnings.append(&mut local_file.warnings);
        SettingsSnapshot {
            vault: VaultSettings {
                editor,
                appearance,
                fonts,
                layout,
            },
            defaults: VaultSettings::default(),
            local: LocalSettings { last_note },
            warnings,
            read_only: vault_file.read_only || local_file.read_only,
        }
    }

    /// Saves the vault settings, keeping every key this version doesn't know.
    pub fn save_vault_settings(&self, settings: &VaultSettings) -> Result<(), VaultError> {
        if !AUTOSAVE_MS.contains(&settings.editor.autosave_ms) {
            return Err(VaultError::InvalidProperty("editor.autosaveMs".to_string()));
        }
        appearance::check(&settings.appearance, &settings.fonts, &settings.layout)?;
        let mut file = JsonFile::load(&self.root().join(VAULT_FILE), "settings.json");
        file.set(
            "/editor/autosaveMs",
            Value::from(settings.editor.autosave_ms),
        );
        file.set(
            "/editor/lineNumbers",
            Value::from(settings.editor.line_numbers),
        );
        appearance::save_look(
            &mut file,
            &settings.appearance,
            &settings.fonts,
            &settings.layout,
        );
        file.save(self.writer())
    }

    pub fn save_local_settings(&self, settings: &LocalSettings) -> Result<(), VaultError> {
        let last_note = settings
            .last_note
            .as_ref()
            .map_or(Value::Null, |path| Value::from(path.as_str()));
        self.edit_local_settings(|file| file.set("/lastNote", last_note))
    }

    /// `settings.local.json` as loaded now, for crates that keep device-only state there.
    pub fn local_settings_file(&self) -> JsonFile {
        JsonFile::load(&self.root().join(LOCAL_FILE), "settings.local.json")
    }

    /// Loads `settings.local.json`, applies `edit` and saves it. Edits run one at a time,
    /// so the last-note save and `vault-run` never undo each other's change.
    pub fn edit_local_settings(&self, edit: impl FnOnce(&mut JsonFile)) -> Result<(), VaultError> {
        let _guard = self
            .local_settings_lock()
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let mut file = self.local_settings_file();
        edit(&mut file);
        file.save(self.writer())
    }
}

/// Reads `app.json`. Problems are ignored: the worst case is not reopening the last vault.
pub fn load_app_settings(path: &Path) -> AppSettings {
    let mut file = JsonFile::load(path, "app.json");
    AppSettings {
        known_vaults: file.get("/knownVaults", Vec::new(), |_| true),
        last_vault: file.get("/lastVault", None, |_| true),
    }
}

/// Records `vault_root` as the last vault opened, at the top of the known vaults.
pub fn remember_vault(
    path: &Path,
    vault_root: &Path,
    writer: &VaultWriter,
) -> Result<(), VaultError> {
    let root = vault_root.display().to_string();
    let mut known = load_app_settings(path).known_vaults;
    known.retain(|existing| existing != &root);
    known.insert(0, root.clone());
    known.truncate(MAX_KNOWN_VAULTS);

    let mut file = JsonFile::load(path, "app.json");
    file.set("/knownVaults", Value::from(known));
    file.set("/lastVault", Value::from(root));
    file.save(writer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn deleting_settings_json_gives_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let snapshot = vault.load_settings();
        assert_eq!(snapshot.vault.editor, EditorSettings::default());
        assert!(snapshot.warnings.is_empty());
    }

    #[test]
    fn saved_settings_load_back_and_keep_unknown_keys() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".vault")).unwrap();
        fs::write(
            dir.path().join(VAULT_FILE),
            r#"{ "appearance": { "theme": "dark" } }"#,
        )
        .unwrap();
        let vault = Vault::open(dir.path()).unwrap();

        let settings = VaultSettings {
            editor: EditorSettings {
                autosave_ms: 1500,
                line_numbers: true,
            },
            appearance: AppearanceSettings {
                theme: ThemeMode::Dark,
                accent: Some("#3f6f7a".to_string()),
                ..AppearanceSettings::default()
            },
            fonts: FontSettings {
                family: Some("Iowan Old Style".to_string()),
                ..FontSettings::default()
            },
            layout: LayoutSettings {
                sidebar_side: SidebarSide::Right,
                ..LayoutSettings::default()
            },
        };
        vault.save_vault_settings(&settings).unwrap();

        assert_eq!(vault.load_settings().vault, settings);
        let text = fs::read_to_string(dir.path().join(VAULT_FILE)).unwrap();
        assert!(text.contains("\"theme\": \"dark\""));
    }

    #[test]
    fn a_look_that_could_inject_css_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let mut settings = VaultSettings::default();
        settings.appearance.accent = Some("red; background: url(x)".to_string());
        assert!(vault.save_vault_settings(&settings).is_err());

        settings = VaultSettings::default();
        settings.fonts.family = Some("x\"; color: red".to_string());
        assert!(vault.save_vault_settings(&settings).is_err());
    }

    #[test]
    fn an_out_of_range_value_is_replaced_by_the_default() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".vault")).unwrap();
        fs::write(
            dir.path().join(VAULT_FILE),
            r#"{ "editor": { "autosaveMs": 5 } }"#,
        )
        .unwrap();
        let vault = Vault::open(dir.path()).unwrap();

        let snapshot = vault.load_settings();

        assert_eq!(snapshot.vault.editor.autosave_ms, 800);
        assert_eq!(snapshot.warnings.len(), 1);
    }

    #[test]
    fn remember_vault_keeps_the_newest_first_without_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let app_json = dir.path().join("app.json");
        let writer = VaultWriter::default();
        remember_vault(&app_json, Path::new("/a"), &writer).unwrap();
        remember_vault(&app_json, Path::new("/b"), &writer).unwrap();
        remember_vault(&app_json, Path::new("/a"), &writer).unwrap();

        let settings = load_app_settings(&app_json);
        assert_eq!(settings.known_vaults, ["/a", "/b"]);
        assert_eq!(settings.last_vault.as_deref(), Some("/a"));
    }
}
