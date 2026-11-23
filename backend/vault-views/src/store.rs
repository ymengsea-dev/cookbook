//! View files in `.vault/views/<id>.json` (L-8). Saving keeps keys this app doesn't
//! know, so a newer app version or a hand edit loses nothing.

use std::fs;
use std::path::PathBuf;

use serde_json::{Map, Value};
use vault_core::{VAULT_DIR, Vault};

use crate::{ViewDefinition, ViewError, ViewKind, ViewSource};

/// The view format this app writes. A file with a higher number can't be saved.
pub const VIEW_SCHEMA_VERSION: u64 = 1;
const SCHEMA_KEY: &str = "schemaVersion";

/// Objects whose keys are data (column names, property names), not settings.
/// They are replaced whole on save, so a removed entry really goes away.
const REPLACE_WHOLE: &[&str] = &["source", "propertyTypes", "cardOrder"];

/// Every readable view, sorted by name. A broken file is skipped rather than
/// hiding all the others.
pub fn list_views(vault: &Vault) -> Result<Vec<ViewDefinition>, ViewError> {
    let Ok(entries) = fs::read_dir(views_dir(vault)) else {
        return Ok(Vec::new());
    };
    let mut views: Vec<ViewDefinition> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            let id = name.strip_suffix(".json")?;
            load_view(vault, id).ok()
        })
        .collect();
    views.sort_by_key(|view| (view.name.to_lowercase(), view.id.clone()));
    Ok(views)
}

pub fn load_view(vault: &Vault, id: &str) -> Result<ViewDefinition, ViewError> {
    let document = read_document(vault, id)?.ok_or_else(|| ViewError::NotFound(id.to_string()))?;
    let mut definition: ViewDefinition = serde_json::from_value(Value::Object(document))
        .map_err(|error| ViewError::Broken(id.to_string(), error.to_string()))?;
    definition.id = id.to_string();
    Ok(definition)
}

/// Creates a view named `name`. Its id comes from the name, made unique.
pub fn create_view(
    vault: &Vault,
    name: &str,
    kind: ViewKind,
    source: ViewSource,
) -> Result<ViewDefinition, ViewError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(ViewError::InvalidName(name.to_string()));
    }
    let base = slug(name);
    let mut id = base.clone();
    let mut number = 2;
    while view_path(vault, &id)?.exists() {
        id = format!("{base}-{number}");
        number += 1;
    }
    let definition = ViewDefinition {
        id,
        name: name.to_string(),
        kind,
        source,
        filter: Vec::new(),
        sort: Vec::new(),
        group_by: None,
        columns: Vec::new(),
        property_types: Default::default(),
        pinned: false,
        board: Default::default(),
    };
    save_view(vault, &definition)
}

/// Writes `definition` over its file, keeping any keys the app doesn't know.
pub fn save_view(vault: &Vault, definition: &ViewDefinition) -> Result<ViewDefinition, ViewError> {
    let id = definition.id.as_str();
    let mut document = read_document(vault, id)?.unwrap_or_default();
    let version = document
        .get(SCHEMA_KEY)
        .and_then(Value::as_u64)
        .unwrap_or(VIEW_SCHEMA_VERSION);
    if version > VIEW_SCHEMA_VERSION {
        return Err(ViewError::NewerVersion(id.to_string()));
    }

    let Value::Object(update) = serde_json::to_value(definition)
        .map_err(|error| ViewError::Broken(id.to_string(), error.to_string()))?
    else {
        return Err(ViewError::Broken(
            id.to_string(),
            "not an object".to_string(),
        ));
    };
    merge(&mut document, update);

    let mut ordered = Map::new();
    ordered.insert(SCHEMA_KEY.to_string(), Value::from(VIEW_SCHEMA_VERSION));
    ordered.extend(document.into_iter().filter(|(key, _)| key != SCHEMA_KEY));
    let mut text = serde_json::to_string_pretty(&Value::Object(ordered))
        .map_err(|error| ViewError::Broken(id.to_string(), error.to_string()))?;
    text.push('\n');

    let path = view_path(vault, id)?;
    fs::create_dir_all(views_dir(vault)).map_err(|error| ViewError::Io(error.to_string()))?;
    vault
        .writer()
        .write(&path, text.as_bytes(), &format!("{id}.json"))?;
    Ok(definition.clone())
}

/// The file's JSON object, or `None` when there is no file.
fn read_document(vault: &Vault, id: &str) -> Result<Option<Map<String, Value>>, ViewError> {
    let path = view_path(vault, id)?;
    let Ok(text) = fs::read_to_string(&path) else {
        return Ok(None);
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(document)) => Ok(Some(document)),
        Ok(_) => Err(ViewError::Broken(
            id.to_string(),
            "not a JSON object".to_string(),
        )),
        Err(error) => Err(ViewError::Broken(id.to_string(), error.to_string())),
    }
}

/// Copies `update` into `document`. Nested settings objects merge key by key,
/// so unknown keys inside them survive too.
fn merge(document: &mut Map<String, Value>, update: Map<String, Value>) {
    for (key, value) in update {
        let replace_whole = REPLACE_WHOLE.contains(&key.as_str());
        match (document.get_mut(&key), value) {
            (Some(Value::Object(old)), Value::Object(new)) if !replace_whole => merge(old, new),
            (_, value) => {
                document.insert(key, value);
            }
        }
    }
}

fn views_dir(vault: &Vault) -> PathBuf {
    vault.root().join(VAULT_DIR).join("views")
}

/// The file for `id`. Ids are letters, digits, `-` and `_` only, so they can't leave the folder.
fn view_path(vault: &Vault, id: &str) -> Result<PathBuf, ViewError> {
    let valid = !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(ViewError::NotFound(id.to_string()));
    }
    Ok(views_dir(vault).join(format!("{id}.json")))
}

/// "Website board!" becomes "website-board". Names in any script keep their letters.
fn slug(name: &str) -> String {
    let mut slug = String::new();
    for character in name.to_lowercase().chars() {
        if character.is_alphanumeric() {
            slug.push(character);
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    let slug = slug.trim_end_matches('-').to_string();
    if slug.is_empty() {
        "view".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        (dir, vault)
    }

    #[test]
    fn a_created_view_reads_back() {
        let (_dir, vault) = empty_vault();
        let created =
            create_view(&vault, "Website board", ViewKind::Board, ViewSource::Vault).unwrap();
        assert_eq!(created.id, "website-board");
        assert_eq!(load_view(&vault, "website-board").unwrap(), created);
        let second =
            create_view(&vault, "Website board", ViewKind::List, ViewSource::Vault).unwrap();
        assert_eq!(second.id, "website-board-2");
        let names: Vec<String> = list_views(&vault)
            .unwrap()
            .into_iter()
            .map(|v| v.id)
            .collect();
        assert_eq!(names, ["website-board", "website-board-2"]);
    }

    #[test]
    fn unknown_keys_survive_a_save() {
        let (dir, vault) = empty_vault();
        let folder = dir.path().join(".vault/views");
        fs::create_dir_all(&folder).unwrap();
        let text = r#"{
            "schemaVersion": 1, "id": "plan", "name": "Plan", "type": "board",
            "source": { "kind": "vault" },
            "future": { "keep": true },
            "board": { "groupBy": "status", "swimlanes": "owner", "cardOrder": { "old": ["k"] } }
        }"#;
        fs::write(folder.join("plan.json"), text).unwrap();

        let mut view = load_view(&vault, "plan").unwrap();
        view.pinned = true;
        view.board.card_order.clear();
        save_view(&vault, &view).unwrap();

        let saved: Value =
            serde_json::from_str(&fs::read_to_string(folder.join("plan.json")).unwrap()).unwrap();
        assert_eq!(saved["future"]["keep"], true);
        assert_eq!(saved["board"]["swimlanes"], "owner");
        assert_eq!(saved["pinned"], true);
        assert_eq!(saved["board"]["cardOrder"], serde_json::json!({}));
        let first_key = saved.as_object().unwrap().keys().next().unwrap().clone();
        assert_eq!(first_key, "schemaVersion");
    }

    #[test]
    fn a_newer_view_is_not_overwritten() {
        let (dir, vault) = empty_vault();
        let folder = dir.path().join(".vault/views");
        fs::create_dir_all(&folder).unwrap();
        let text = r#"{ "schemaVersion": 9, "id": "x", "name": "X", "type": "list", "source": { "kind": "vault" } }"#;
        fs::write(folder.join("x.json"), text).unwrap();
        let view = load_view(&vault, "x").unwrap();
        assert!(matches!(
            save_view(&vault, &view),
            Err(ViewError::NewerVersion(_))
        ));
    }

    #[test]
    fn ids_cannot_leave_the_views_folder() {
        let (_dir, vault) = empty_vault();
        assert!(matches!(
            load_view(&vault, "../settings"),
            Err(ViewError::NotFound(_))
        ));
        assert_eq!(slug("Website board!"), "website-board");
        assert_eq!(slug("ផែនការ"), "ផែនការ");
        assert_eq!(slug("!!"), "view");
    }
}
