//! One JSON settings file, kept as a whole document so unknown keys survive a save (S-3).

use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use crate::{VaultError, VaultWriter};

/// The settings format this app writes. A file with a higher number opens read-only.
pub const SCHEMA_VERSION: u64 = 1;
const SCHEMA_KEY: &str = "schemaVersion";

pub struct JsonFile {
    path: PathBuf,
    label: String,
    document: Map<String, Value>,
    /// Problems found while loading, in words the user can act on.
    pub warnings: Vec<String>,
    /// True when the file comes from a newer app version and must not be overwritten.
    pub read_only: bool,
}

impl JsonFile {
    /// Loads the file. A missing file means "all defaults". A broken file is kept as `.bak`.
    pub fn load(path: &Path, label: &str) -> Self {
        let mut file = Self {
            path: path.to_path_buf(),
            label: label.to_string(),
            document: Map::new(),
            warnings: Vec::new(),
            read_only: false,
        };
        let Ok(text) = fs::read_to_string(path) else {
            return file;
        };
        match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(document)) => file.document = document,
            _ => file.keep_broken_copy(&text),
        }
        file.check_version();
        file
    }

    /// Reads the value at `pointer` (for example `/editor/autosaveMs`), or `default`
    /// with a warning when it has the wrong type or fails `is_valid`.
    pub fn get<T: DeserializeOwned>(
        &mut self,
        pointer: &str,
        default: T,
        is_valid: impl Fn(&T) -> bool,
    ) -> T {
        let Some(raw) = self.document_value(pointer) else {
            return default;
        };
        match serde_json::from_value::<T>(raw.clone()) {
            Ok(value) if is_valid(&value) => value,
            _ => {
                self.warnings.push(format!(
                    "{}: \"{}\" has an invalid value, so the default is used.",
                    self.label,
                    pointer.trim_start_matches('/').replace('/', ".")
                ));
                default
            }
        }
    }

    /// Sets the value at `pointer`, creating parent objects as needed.
    pub fn set(&mut self, pointer: &str, value: Value) {
        let mut parts: Vec<&str> = pointer.trim_start_matches('/').split('/').collect();
        let Some(last) = parts.pop() else {
            return;
        };
        let mut object = &mut self.document;
        for part in parts {
            let child = object
                .entry(part.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if !child.is_object() {
                *child = Value::Object(Map::new());
            }
            let Value::Object(child) = child else {
                return;
            };
            object = child;
        }
        object.insert(last.to_string(), value);
    }

    /// Writes the file atomically, pretty-printed, with `schemaVersion` first.
    pub fn save(&mut self, writer: &VaultWriter) -> Result<(), VaultError> {
        if self.read_only {
            return Err(VaultError::NewerSettings(self.label.clone()));
        }
        let mut ordered = Map::new();
        ordered.insert(SCHEMA_KEY.to_string(), Value::from(SCHEMA_VERSION));
        for (key, value) in &self.document {
            if key != SCHEMA_KEY {
                ordered.insert(key.clone(), value.clone());
            }
        }
        let mut text = serde_json::to_string_pretty(&Value::Object(ordered))
            .map_err(|error| VaultError::InvalidProperty(error.to_string()))?;
        text.push('\n');

        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(VaultError::io("save", self.label.clone()))?;
        }
        writer.write(&self.path, text.as_bytes(), &self.label)?;
        Ok(())
    }

    fn document_value(&self, pointer: &str) -> Option<&Value> {
        let mut parts = pointer.trim_start_matches('/').split('/');
        let first = self.document.get(parts.next()?)?;
        parts.try_fold(first, |value, part| value.get(part))
    }

    fn keep_broken_copy(&mut self, text: &str) {
        let backup = self.path.with_extension("json.bak");
        let saved = fs::write(&backup, text).is_ok();
        let note = if saved {
            format!(" A copy was kept as {}.bak.", self.label)
        } else {
            String::new()
        };
        self.warnings.push(format!(
            "{} could not be read, so defaults are used.{note}",
            self.label
        ));
    }

    fn check_version(&mut self) {
        let version = self
            .document
            .get(SCHEMA_KEY)
            .and_then(Value::as_u64)
            .unwrap_or(SCHEMA_VERSION);
        if version > SCHEMA_VERSION {
            self.read_only = true;
            self.warnings.push(format!(
                "{} was saved by a newer version of the app, so it opens read-only.",
                self.label
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load(text: &str) -> (tempfile::TempDir, JsonFile) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, text).unwrap();
        let file = JsonFile::load(&path, "settings.json");
        (dir, file)
    }

    #[test]
    fn a_missing_file_gives_defaults_without_warnings() {
        let dir = tempfile::tempdir().unwrap();
        let mut file = JsonFile::load(&dir.path().join("none.json"), "none.json");
        assert_eq!(file.get("/editor/autosaveMs", 800, |_| true), 800);
        assert!(file.warnings.is_empty());
    }

    #[test]
    fn a_wrong_type_falls_back_to_the_default_with_a_warning() {
        let (_dir, mut file) = load(r#"{ "editor": { "autosaveMs": "fast" } }"#);
        assert_eq!(file.get("/editor/autosaveMs", 800, |_| true), 800);
        assert_eq!(file.warnings.len(), 1);
    }

    #[test]
    fn broken_json_is_kept_as_bak() {
        let (dir, file) = load("{ not json");
        assert_eq!(file.warnings.len(), 1);
        let backup = fs::read_to_string(dir.path().join("settings.json.bak")).unwrap();
        assert_eq!(backup, "{ not json");
    }

    #[test]
    fn unknown_keys_and_their_order_survive_a_save() {
        let text = r#"{ "zeta": 1, "schemaVersion": 1, "editor": { "autosaveMs": 500, "future": true }, "alpha": [1] }"#;
        let (dir, mut file) = load(text);
        file.set("/editor/autosaveMs", Value::from(900));
        file.save(&VaultWriter::default()).unwrap();

        let saved = fs::read_to_string(dir.path().join("settings.json")).unwrap();
        let keys: Vec<String> = serde_json::from_str::<Map<String, Value>>(&saved)
            .unwrap()
            .keys()
            .cloned()
            .collect();
        assert_eq!(keys, ["schemaVersion", "zeta", "editor", "alpha"]);
        assert!(saved.contains("\"future\": true"));
        assert!(saved.contains("\"autosaveMs\": 900"));
    }

    #[test]
    fn a_newer_file_is_read_only() {
        let (_dir, mut file) = load(r#"{ "schemaVersion": 99 }"#);
        assert!(file.read_only);
        assert!(matches!(
            file.save(&VaultWriter::default()),
            Err(VaultError::NewerSettings(_))
        ));
    }
}
