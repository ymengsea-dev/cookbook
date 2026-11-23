//! What this device has agreed to run (E-15). Kept in `settings.local.json`, which never
//! syncs, so trust given on one Mac never travels to another.

use vault_core::{JsonFile, Vault, VaultError};

const WARNING_POINTER: &str = "/codeRun/warningAccepted";
const UNTRUSTED_POINTER: &str = "/codeRun/untrustedNotes";

#[derive(Debug, Clone, Default, PartialEq)]
pub struct RunTrust {
    /// The user has seen the "code is not sandboxed" warning in this vault.
    pub warning_accepted: bool,
    /// Keys of notes that came by sync or import and have not been trusted yet.
    pub untrusted_notes: Vec<String>,
}

impl RunTrust {
    pub fn load(vault: &Vault) -> Self {
        let mut file = vault.local_settings_file();
        Self {
            warning_accepted: file.get(WARNING_POINTER, false, |_| true),
            untrusted_notes: untrusted_notes(&mut file),
        }
    }

    /// Only notes marked by sync or import need trust. A note without a key was made here.
    pub fn is_trusted(&self, key: Option<&str>) -> bool {
        key.is_none_or(|key| !self.untrusted_notes.iter().any(|marked| marked == key))
    }
}

pub fn accept_warning(vault: &Vault) -> Result<(), VaultError> {
    vault.edit_local_settings(|file| file.set(WARNING_POINTER, true.into()))
}

/// Lets the note's code run from now on.
pub fn trust_note(vault: &Vault, key: &str) -> Result<(), VaultError> {
    vault.edit_local_settings(|file| {
        let mut keys = untrusted_notes(file);
        keys.retain(|marked| marked != key);
        file.set(UNTRUSTED_POINTER, keys.into());
    })
}

/// Sync and import call this for every note they bring in, so its code needs trust first.
/// They must give each note a key before marking it: a note without one counts as made here.
pub fn mark_untrusted(vault: &Vault, keys: &[String]) -> Result<(), VaultError> {
    vault.edit_local_settings(|file| {
        let mut marked = untrusted_notes(file);
        for key in keys {
            if !marked.contains(key) {
                marked.push(key.clone());
            }
        }
        file.set(UNTRUSTED_POINTER, marked.into());
    })
}

fn untrusted_notes(file: &mut JsonFile) -> Vec<String> {
    file.get(UNTRUSTED_POINTER, Vec::new(), |_| true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn a_new_vault_has_not_seen_the_warning_and_trusts_every_note() {
        let dir = tempfile::tempdir().unwrap();
        let trust = RunTrust::load(&Vault::open(dir.path()).unwrap());
        assert!(!trust.warning_accepted);
        assert!(trust.is_trusted(Some("01JD8Y3N6Q4F9K2V7R5T0W1XZB")));
        assert!(trust.is_trusted(None));
    }

    #[test]
    fn marking_and_trusting_round_trips_and_keeps_other_settings() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".vault")).unwrap();
        let local = dir.path().join(".vault/settings.local.json");
        fs::write(
            &local,
            r#"{ "lastNote": "a.md", "window": { "width": 900 } }"#,
        )
        .unwrap();
        let vault = Vault::open(dir.path()).unwrap();

        mark_untrusted(&vault, &["A".to_string(), "B".to_string()]).unwrap();
        accept_warning(&vault).unwrap();
        assert!(!RunTrust::load(&vault).is_trusted(Some("A")));

        trust_note(&vault, "A").unwrap();
        let trust = RunTrust::load(&vault);
        assert!(trust.warning_accepted);
        assert!(trust.is_trusted(Some("A")));
        assert!(!trust.is_trusted(Some("B")));

        let text = fs::read_to_string(&local).unwrap();
        assert!(text.contains("\"lastNote\": \"a.md\""));
        assert!(text.contains("\"width\": 900"));
    }
}
