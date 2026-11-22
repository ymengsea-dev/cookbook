//! Reading notes back out of the index, for list and board views (L-1, B-1).

use std::collections::HashMap;

use serde_json::{Map, Value};
use vault_core::{ContentHash, Property, PropertyValue};

use crate::{IndexError, NoteIndex};

/// One note as the index knows it.
#[derive(Debug, Clone, PartialEq)]
pub struct IndexedNote {
    /// The note's `key`, or `path:<path>` when it has none yet.
    pub key: String,
    pub path: String,
    pub title: String,
    /// Content hash at the last sync, so edits can check the file hasn't moved on.
    pub hash: ContentHash,
    pub tags: Vec<String>,
    /// Front matter properties in file order.
    pub properties: Vec<Property>,
}

impl NoteIndex {
    /// Every indexed note, ordered by path.
    pub fn notes(&self) -> Result<Vec<IndexedNote>, IndexError> {
        let connection = self.lock();
        let mut notes = Vec::new();
        let mut position_by_id = HashMap::new();

        let mut statement =
            connection.prepare("SELECT id, key, path, title, hash FROM notes ORDER BY path")?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            position_by_id.insert(row.get::<_, i64>(0)?, notes.len());
            notes.push(IndexedNote {
                key: row.get(1)?,
                path: row.get(2)?,
                title: row.get(3)?,
                hash: ContentHash::from_stored(&row.get::<_, String>(4)?),
                tags: Vec::new(),
                properties: Vec::new(),
            });
        }

        // rowid order is insertion order, which is the note's front matter order.
        let mut statement =
            connection.prepare("SELECT note_id, name, type, value FROM props ORDER BY rowid")?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let Some(&position) = position_by_id.get(&row.get::<_, i64>(0)?) else {
                continue;
            };
            let value = stored_value(&row.get::<_, String>(2)?, &row.get::<_, String>(3)?);
            if let (Some(note), Some(value)) = (notes.get_mut(position), value) {
                note.properties.push(Property {
                    key: row.get(1)?,
                    value,
                });
            }
        }

        let mut statement = connection.prepare("SELECT note_id, tag FROM tags ORDER BY rowid")?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let position = position_by_id.get(&row.get::<_, i64>(0)?).copied();
            if let Some(note) = position.and_then(|position| notes.get_mut(position)) {
                note.tags.push(row.get(1)?);
            }
        }
        Ok(notes)
    }
}

/// Rebuilds a `PropertyValue` from the type and JSON value that `upsert` stored.
fn stored_value(kind: &str, value: &str) -> Option<PropertyValue> {
    let mut tagged = Map::new();
    tagged.insert("type".to_string(), Value::from(kind));
    if !value.is_empty() {
        tagged.insert("value".to_string(), serde_json::from_str(value).ok()?);
    }
    serde_json::from_value(Value::Object(tagged)).ok()
}
