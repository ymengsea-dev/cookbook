//! Themes (U-4): small JSON files of colour values in `.vault/themes/`, which sync. Built-in
//! themes live in the UI; these are the ones the user imported or wrote by hand.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

use super::{is_hex_colour, is_theme_id};
use crate::{SCHEMA_VERSION, Vault, VaultError};

pub const THEMES_DIR: &str = ".vault/themes";
const MAX_NAME: usize = 60;
const MAX_NUMBER: u32 = 1000;

/// Colour tokens a theme may set, each `#rrggbb`. One left out keeps the default.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct ThemeColors {
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paper: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sidebar: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ink: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ink_secondary: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_accent: Option<String>,
}

impl ThemeColors {
    fn is_valid(&self) -> bool {
        let values = [
            &self.paper,
            &self.surface,
            &self.sidebar,
            &self.ink,
            &self.ink_secondary,
            &self.rule,
            &self.accent,
            &self.on_accent,
        ];
        values
            .iter()
            .all(|value| value.as_deref().is_none_or(is_hex_colour))
    }
}

/// A theme as written in its file, and as exported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ThemeFile {
    pub name: String,
    #[serde(default)]
    pub light: ThemeColors,
    #[serde(default)]
    pub dark: ThemeColors,
}

impl ThemeFile {
    fn check(&self, label: &str) -> Result<(), VaultError> {
        let name_ok = !self.name.trim().is_empty() && self.name.chars().count() <= MAX_NAME;
        if !name_ok || !self.light.is_valid() || !self.dark.is_valid() {
            return Err(VaultError::BadTheme(label.to_string()));
        }
        Ok(())
    }

    /// The file's text: pretty JSON with `schemaVersion` first, like the settings files.
    pub fn to_json(&self) -> Result<String, VaultError> {
        let mut document = Map::new();
        document.insert("schemaVersion".to_string(), Value::from(SCHEMA_VERSION));
        let body = serde_json::to_value(self)
            .map_err(|error| VaultError::InvalidProperty(error.to_string()))?;
        if let Value::Object(fields) = body {
            document.extend(fields);
        }
        let mut text = serde_json::to_string_pretty(&Value::Object(document))
            .map_err(|error| VaultError::InvalidProperty(error.to_string()))?;
        text.push('\n');
        Ok(text)
    }
}

/// A theme in `.vault/themes/`. Its id is the file name without `.json`.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Theme {
    pub id: String,
    #[serde(flatten)]
    #[ts(flatten)]
    pub file: ThemeFile,
}

/// The themes, plus a warning for each file that could not be used.
#[derive(Debug, Clone, Default, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ThemeList {
    pub themes: Vec<Theme>,
    pub warnings: Vec<String>,
}

impl Vault {
    pub fn themes(&self) -> ThemeList {
        let mut list = ThemeList::default();
        let Ok(items) = fs::read_dir(self.root().join(THEMES_DIR)) else {
            return list;
        };
        for item in items.flatten() {
            let path = item.path();
            let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            let is_json = path
                .extension()
                .is_some_and(|extension| extension == "json");
            if !is_json || !is_theme_id(id) {
                continue;
            }
            match read_theme_file(&path) {
                Ok(file) => list.themes.push(Theme {
                    id: id.to_string(),
                    file,
                }),
                Err(error) => list.warnings.push(error.to_string()),
            }
        }
        list.themes
            .sort_by_key(|theme| theme.file.name.to_lowercase());
        list
    }

    /// Copies a theme file into `.vault/themes/`, under a free name (U-4).
    pub fn import_theme(&self, source: &Path) -> Result<Theme, VaultError> {
        let file = read_theme_file(source)?;
        let folder = self.root().join(THEMES_DIR);
        fs::create_dir_all(&folder).map_err(VaultError::io("create", THEMES_DIR))?;
        let text = file.to_json()?;
        let base = theme_id_for(&file.name);
        for number in 1..=MAX_NUMBER {
            let id = if number == 1 {
                base.clone()
            } else {
                format!("{base}-{number}")
            };
            let target = folder.join(format!("{id}.json"));
            match self.writer().create_new(&target, text.as_bytes(), &id) {
                Ok(_) => return Ok(Theme { id, file }),
                Err(VaultError::AlreadyExists(_)) => continue,
                Err(error) => return Err(error),
            }
        }
        Err(VaultError::AlreadyExists(base))
    }
}

fn read_theme_file(path: &Path) -> Result<ThemeFile, VaultError> {
    let label = path.file_name().map_or_else(
        || path.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    let text = fs::read_to_string(path).map_err(VaultError::io("read", label.clone()))?;
    let value: Value =
        serde_json::from_str(&text).map_err(|_| VaultError::BadTheme(label.clone()))?;
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(SCHEMA_VERSION);
    if version > SCHEMA_VERSION {
        return Err(VaultError::NewerSettings(label));
    }
    let file: ThemeFile =
        serde_json::from_value(value).map_err(|_| VaultError::BadTheme(label.clone()))?;
    file.check(&label)?;
    Ok(file)
}

/// `Night Owl` gives `night-owl`.
fn theme_id_for(name: &str) -> String {
    let mut id = String::new();
    for c in name.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            id.push(c);
        } else if !id.ends_with('-') {
            id.push('-');
        }
    }
    let id = id.trim_matches('-').to_string();
    if id.is_empty() {
        "theme".to_string()
    } else {
        id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_imported_theme_is_listed_and_never_replaces_another() {
        let source = tempfile::tempdir().unwrap();
        let theme = source.path().join("night.json");
        fs::write(
            &theme,
            r##"{ "name": "Night Owl", "dark": { "paper": "#101418", "accent": "#7fb0ba" } }"##,
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();

        let first = vault.import_theme(&theme).unwrap();
        let second = vault.import_theme(&theme).unwrap();
        let list = vault.themes();

        assert_eq!(
            (first.id.as_str(), second.id.as_str()),
            ("night-owl", "night-owl-2")
        );
        assert_eq!(list.themes.len(), 2);
        assert_eq!(list.themes[0].file.dark.paper.as_deref(), Some("#101418"));
        let saved = fs::read_to_string(dir.path().join(".vault/themes/night-owl.json")).unwrap();
        assert!(saved.starts_with("{\n  \"schemaVersion\": 1"));
    }

    #[test]
    fn a_theme_with_anything_but_plain_colours_is_refused() {
        let source = tempfile::tempdir().unwrap();
        let bad = source.path().join("bad.json");
        fs::write(
            &bad,
            r#"{ "name": "Bad", "light": { "paper": "red; background: url(x)" } }"#,
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        fs::create_dir_all(dir.path().join(THEMES_DIR)).unwrap();
        fs::copy(&bad, dir.path().join(".vault/themes/bad.json")).unwrap();

        assert!(matches!(
            vault.import_theme(&bad),
            Err(VaultError::BadTheme(_))
        ));
        let list = vault.themes();
        assert!(list.themes.is_empty());
        assert_eq!(list.warnings.len(), 1);
    }
}
