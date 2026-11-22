//! The index tables (see `docs/Architecture.md`). The file is a cache: when the schema
//! version changes or the file is damaged, it is simply recreated and refilled (X-2).

use std::fs;
use std::path::Path;

use rusqlite::Connection;

use crate::IndexError;

/// Bump this when the tables change. Old index files are then rebuilt from the notes.
pub const SCHEMA_VERSION: i64 = 1;

const CREATE_TABLES: &str = "
    CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        modified_ms INTEGER NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL
    );
    CREATE TABLE props (
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        value TEXT NOT NULL
    );
    CREATE INDEX props_by_name ON props(name, value);
    CREATE TABLE tags (
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag TEXT NOT NULL
    );
    CREATE INDEX tags_by_tag ON tags(tag);
    -- Trigram search works for languages written without spaces (X-6).
    -- Its rowid is the matching notes.id.
    CREATE VIRTUAL TABLE notes_fts USING fts5(
        title, headings, body,
        tokenize = 'trigram case_sensitive 0'
    );
";

const DROP_TABLES: &str = "
    DROP TABLE IF EXISTS notes_fts;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS props;
    DROP TABLE IF EXISTS notes;
";

/// Opens the index at `path`, recreating it when it is old or damaged.
pub fn open(path: &Path) -> Result<Connection, IndexError> {
    match open_current(path) {
        Ok(connection) => Ok(connection),
        Err(_) => {
            // The index holds nothing that isn't in the notes, so starting over is safe.
            let _ = fs::remove_file(path);
            open_current(path)
        }
    }
}

fn open_current(path: &Path) -> Result<Connection, IndexError> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;

    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version != SCHEMA_VERSION {
        connection.execute_batch(DROP_TABLES)?;
        connection.execute_batch(CREATE_TABLES)?;
        connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }
    Ok(connection)
}

/// Empties every table, for a full rebuild.
pub fn clear(connection: &Connection) -> Result<(), IndexError> {
    connection.execute_batch(
        "DELETE FROM notes_fts; DELETE FROM tags; DELETE FROM props; DELETE FROM notes;",
    )?;
    Ok(())
}
