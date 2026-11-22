//! Keeping the index in step with the files (X-1 to X-3).

use std::collections::{HashMap, HashSet};
use std::fs;
use std::sync::{Mutex, PoisonError};
use std::time::UNIX_EPOCH;

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use ts_rs::TS;
use vault_core::{VAULT_DIR, Vault, VaultPath};

use crate::extract::{NoteRecord, extract};
use crate::{IndexError, schema};

/// Notes written per transaction. Searches can run between batches.
const BATCH_SIZE: usize = 100;

/// How far a sync has come, for the progress line in the sidebar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct IndexProgress {
    pub done: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SyncReport {
    /// Notes read and indexed again because their text changed.
    pub indexed: usize,
    /// Notes whose time or size changed but whose text did not.
    pub touched: usize,
    pub removed: usize,
    pub unchanged: usize,
}

/// What the index remembers about a file, to tell whether it changed.
struct Known {
    modified_ms: i64,
    size: i64,
    hash: String,
}

/// The search index of one vault, in `.vault/index/index.db`. It never syncs and can be
/// deleted at any time: the next sync rebuilds it from the notes.
pub struct NoteIndex {
    pub(crate) connection: Mutex<Connection>,
}

impl NoteIndex {
    pub fn open(vault: &Vault) -> Result<Self, IndexError> {
        let folder = vault.root().join(VAULT_DIR).join("index");
        fs::create_dir_all(&folder).map_err(|error| IndexError::Io(error.to_string()))?;
        let connection = schema::open(&folder.join("index.db"))?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    /// Brings the index up to date. Only notes whose time or size changed are read,
    /// and only notes whose text changed are indexed again (X-3).
    pub fn sync(
        &self,
        vault: &Vault,
        mut on_progress: impl FnMut(IndexProgress),
    ) -> Result<SyncReport, IndexError> {
        let known = self.known_files()?;
        let mut report = SyncReport::default();
        let mut changed = Vec::new();
        let mut present = HashSet::new();

        for path in vault.note_paths()? {
            let Some((modified_ms, size)) = file_stat(vault, &path) else {
                continue;
            };
            present.insert(path.to_string());
            match known.get(path.as_str()) {
                Some(entry) if entry.modified_ms == modified_ms && entry.size == size => {
                    report.unchanged += 1;
                }
                _ => changed.push((path, modified_ms, size)),
            }
        }

        let total = u32::try_from(changed.len()).unwrap_or(u32::MAX);
        for (batch_number, batch) in changed.chunks(BATCH_SIZE).enumerate() {
            self.write_batch(vault, batch, &known, &mut report)?;
            let done = (batch_number * BATCH_SIZE + batch.len())
                .try_into()
                .unwrap_or(total);
            on_progress(IndexProgress { done, total });
        }

        let gone: Vec<&String> = known
            .keys()
            .filter(|path| !present.contains(*path))
            .collect();
        report.removed = gone.len();
        self.remove(&gone)?;
        Ok(report)
    }

    /// Empties the index and fills it again from every note.
    pub fn rebuild(
        &self,
        vault: &Vault,
        on_progress: impl FnMut(IndexProgress),
    ) -> Result<SyncReport, IndexError> {
        schema::clear(&self.lock())?;
        self.sync(vault, on_progress)
    }

    pub(crate) fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.connection
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    fn known_files(&self) -> Result<HashMap<String, Known>, IndexError> {
        let connection = self.lock();
        let mut statement =
            connection.prepare("SELECT path, modified_ms, size, hash FROM notes")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Known {
                    modified_ms: row.get(1)?,
                    size: row.get(2)?,
                    hash: row.get(3)?,
                },
            ))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    fn write_batch(
        &self,
        vault: &Vault,
        batch: &[(VaultPath, i64, i64)],
        known: &HashMap<String, Known>,
        report: &mut SyncReport,
    ) -> Result<(), IndexError> {
        let mut connection = self.lock();
        let transaction = connection.transaction()?;
        for (path, modified_ms, size) in batch {
            // A note that vanished or isn't text since the scan is skipped; the next sync sees it.
            let Ok(note) = vault.read_note(path) else {
                continue;
            };
            let hash = note.hash.as_str().to_string();
            let same_text = known
                .get(path.as_str())
                .is_some_and(|entry| entry.hash == hash);
            if same_text {
                transaction.execute(
                    "UPDATE notes SET modified_ms = ?1, size = ?2 WHERE path = ?3",
                    params![modified_ms, size, path.as_str()],
                )?;
                report.touched += 1;
            } else {
                let record = extract(path, &note.content);
                upsert(&transaction, path, &record, *modified_ms, *size, &hash)?;
                report.indexed += 1;
            }
        }
        transaction.commit()?;
        Ok(())
    }

    fn remove(&self, paths: &[&String]) -> Result<(), IndexError> {
        if paths.is_empty() {
            return Ok(());
        }
        let mut connection = self.lock();
        let transaction = connection.transaction()?;
        for path in paths {
            let id: Option<i64> = transaction
                .query_row(
                    "SELECT id FROM notes WHERE path = ?1",
                    [path.as_str()],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(id) = id {
                transaction.execute("DELETE FROM notes_fts WHERE rowid = ?1", [id])?;
                transaction.execute("DELETE FROM notes WHERE id = ?1", [id])?;
            }
        }
        transaction.commit()?;
        Ok(())
    }
}

/// Writes one note's row, properties, tags and search text, replacing what was there.
fn upsert(
    transaction: &Transaction<'_>,
    path: &VaultPath,
    record: &NoteRecord,
    modified_ms: i64,
    size: i64,
    hash: &str,
) -> Result<(), IndexError> {
    let existing: Option<i64> = transaction
        .query_row(
            "SELECT id FROM notes WHERE path = ?1",
            [path.as_str()],
            |row| row.get(0),
        )
        .optional()?;
    let key = unique_key(transaction, record, path)?;

    let id = match existing {
        Some(id) => {
            transaction.execute(
                "UPDATE notes SET key = ?1, title = ?2, modified_ms = ?3, size = ?4, hash = ?5 WHERE id = ?6",
                params![key, record.title, modified_ms, size, hash, id],
            )?;
            transaction.execute("DELETE FROM props WHERE note_id = ?1", [id])?;
            transaction.execute("DELETE FROM tags WHERE note_id = ?1", [id])?;
            transaction.execute("DELETE FROM notes_fts WHERE rowid = ?1", [id])?;
            id
        }
        None => {
            transaction.execute(
                "INSERT INTO notes (key, path, title, modified_ms, size, hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![key, path.as_str(), record.title, modified_ms, size, hash],
            )?;
            transaction.last_insert_rowid()
        }
    };

    for property in &record.properties {
        let value = serde_json::to_value(&property.value).unwrap_or_default();
        let kind = value
            .get("type")
            .and_then(|kind| kind.as_str())
            .unwrap_or("null")
            .to_string();
        let value = value
            .get("value")
            .map_or_else(String::new, ToString::to_string);
        transaction.execute(
            "INSERT INTO props (note_id, name, type, value) VALUES (?1, ?2, ?3, ?4)",
            params![id, property.key, kind, value],
        )?;
    }
    for tag in &record.tags {
        transaction.execute(
            "INSERT INTO tags (note_id, tag) VALUES (?1, ?2)",
            params![id, tag],
        )?;
    }
    transaction.execute(
        "INSERT INTO notes_fts (rowid, title, headings, body) VALUES (?1, ?2, ?3, ?4)",
        params![id, record.title, record.headings.join("\n"), record.body],
    )?;
    Ok(())
}

/// The note's own key, or a path-based stand-in when it has none or the key is already
/// taken by another file (a copy made in Finder, for example).
fn unique_key(
    transaction: &Transaction<'_>,
    record: &NoteRecord,
    path: &VaultPath,
) -> Result<String, IndexError> {
    let fallback = format!("path:{path}");
    let Some(key) = &record.key else {
        return Ok(fallback);
    };
    let owner: Option<String> = transaction
        .query_row("SELECT path FROM notes WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?;
    Ok(match owner {
        Some(owner) if owner != path.as_str() => fallback,
        _ => key.clone(),
    })
}

/// Modified time in milliseconds and size in bytes, or `None` if the file is gone.
fn file_stat(vault: &Vault, path: &VaultPath) -> Option<(i64, i64)> {
    let metadata = fs::metadata(path.to_fs_path(vault.root())).ok()?;
    let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    let modified_ms = i64::try_from(modified.as_millis()).ok()?;
    let size = i64::try_from(metadata.len()).ok()?;
    Some((modified_ms, size))
}
