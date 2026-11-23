//! Keys on imported notes. A copy whose key is already used gets a new one (V-10), and a
//! note with code blocks gets a key so it can be marked untrusted (E-15).

use std::collections::HashSet;

use vault_core::{KEY_PROPERTY, PropertyValue, Vault, ensure_key, read_property, replace_key};

use crate::IoError;

pub struct KeyBook {
    known: HashSet<String>,
    pub rekeyed: usize,
    /// Keys of imported notes with code blocks.
    pub code_notes: Vec<String>,
}

impl KeyBook {
    /// Starts with every key already in the vault.
    pub fn load(vault: &Vault) -> Result<Self, IoError> {
        let mut known = HashSet::new();
        for path in vault.note_paths()? {
            // A note that can't be read has no key to clash with.
            if let Ok(note) = vault.read_note(&path)
                && let Some(key) = note_key(&note.content)
            {
                known.insert(key);
            }
        }
        Ok(Self {
            known,
            rekeyed: 0,
            code_notes: Vec::new(),
        })
    }

    /// The note's text with its key settled. Only the `key` line ever changes.
    pub fn adjust(&mut self, content: &str) -> Result<String, IoError> {
        let has_code = has_code_block(content);
        let mut text = content.to_string();
        match note_key(&text) {
            Some(key) if self.known.contains(&key) => {
                text = replace_key(&text)?;
                self.rekeyed += 1;
            }
            Some(_) => {}
            None if has_code => text = ensure_key(&text)?,
            None => {}
        }
        if let Some(key) = note_key(&text) {
            self.known.insert(key.clone());
            if has_code {
                self.code_notes.push(key);
            }
        }
        Ok(text)
    }
}

fn note_key(content: &str) -> Option<String> {
    match read_property(content, KEY_PROPERTY) {
        Ok(Some(PropertyValue::Text(key))) if !key.trim().is_empty() => Some(key),
        _ => None,
    }
}

fn has_code_block(content: &str) -> bool {
    content.lines().any(|line| {
        let trimmed = line.trim_start();
        trimmed.starts_with("```") || trimmed.starts_with("~~~")
    })
}
