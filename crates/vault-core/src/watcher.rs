//! Watches the vault folder for changes made outside the app (V-7).

use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use ts_rs::TS;

use crate::{ContentHash, Vault, VaultError, VaultPath};

/// Events closer together than this are sent as one batch.
const QUIET_PERIOD: Duration = Duration::from_millis(150);

const SETTINGS_FILES: &[&str] = &[".vault/settings.json", ".vault/settings.local.json"];

/// What changed on disk, from the app's point of view.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum VaultChange {
    /// Folders or notes were added, removed or renamed.
    Tree,
    /// A note's text was changed by another app.
    Note { path: VaultPath },
    /// A settings file was changed by another app.
    Settings,
}

/// Keeps watching while it is alive. Drop it to stop.
pub struct VaultWatcher {
    _watcher: RecommendedWatcher,
}

impl Vault {
    /// Calls `on_change` from a background thread with each batch of outside changes.
    /// The app's own writes are recognised by their hash and left out.
    pub fn watch<F>(self: &Arc<Self>, on_change: F) -> Result<VaultWatcher, VaultError>
    where
        F: Fn(Vec<VaultChange>) + Send + 'static,
    {
        let (sender, receiver) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher =
            notify::recommended_watcher(sender).map_err(|error| watch_error(self.root(), error))?;
        watcher
            .watch(self.root(), RecursiveMode::Recursive)
            .map_err(|error| watch_error(self.root(), error))?;

        let vault = Arc::clone(self);
        thread::spawn(move || forward_batches(&vault, &receiver, &on_change));
        Ok(VaultWatcher { _watcher: watcher })
    }

    /// Turns one changed file-system path into the change the UI cares about.
    fn classify(&self, full_path: &Path) -> Option<VaultChange> {
        let path = VaultPath::from_fs_path(self.root(), full_path)?;
        if path.is_internal() {
            let is_settings = SETTINGS_FILES.contains(&path.as_str());
            return (is_settings && !self.is_own_write(full_path)).then_some(VaultChange::Settings);
        }
        // Hidden files include the writer's own temp files.
        if path.as_str().split('/').any(|part| part.starts_with('.')) {
            return None;
        }

        let Ok(metadata) = fs::metadata(full_path) else {
            return Some(VaultChange::Tree); // Removed or renamed away.
        };
        if metadata.is_dir() {
            return Some(VaultChange::Tree);
        }
        if !path.is_markdown() || self.is_own_write(full_path) {
            return None;
        }
        Some(VaultChange::Note { path })
    }

    /// True when the file on disk is exactly what the app itself last wrote there.
    fn is_own_write(&self, full_path: &Path) -> bool {
        fs::read(full_path).is_ok_and(|bytes| {
            self.writer()
                .is_own_write(full_path, &ContentHash::of(&bytes))
        })
    }
}

/// Waits for an event, collects everything that follows within the quiet period,
/// then sends the batch. Ends when the watcher is dropped.
fn forward_batches<F>(vault: &Vault, receiver: &Receiver<notify::Result<Event>>, on_change: &F)
where
    F: Fn(Vec<VaultChange>),
{
    while let Ok(first) = receiver.recv() {
        let mut events = vec![first];
        loop {
            match receiver.recv_timeout(QUIET_PERIOD) {
                Ok(event) => events.push(event),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }

        let mut changes = Vec::new();
        for event in events.into_iter().flatten() {
            for path in &event.paths {
                let Some(change) = vault.classify(path) else {
                    continue;
                };
                // A note changed by another app may also be new or renamed, so refresh the tree too.
                if matches!(change, VaultChange::Note { .. }) {
                    push_unique(&mut changes, VaultChange::Tree);
                }
                push_unique(&mut changes, change);
            }
        }
        if !changes.is_empty() {
            on_change(changes);
        }
    }
}

fn push_unique(changes: &mut Vec<VaultChange>, change: VaultChange) {
    if !changes.contains(&change) {
        changes.push(change);
    }
}

fn watch_error(root: &Path, error: notify::Error) -> VaultError {
    VaultError::Io {
        action: "watch",
        path: root.display().to_string(),
        source: std::io::Error::other(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // File-system events arrive with some delay, so the test waits generously.
    const WAIT: Duration = Duration::from_secs(5);

    fn watched_vault() -> (
        tempfile::TempDir,
        Arc<Vault>,
        Receiver<Vec<VaultChange>>,
        VaultWatcher,
    ) {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Note.md"), "start").unwrap();
        let vault = Arc::new(Vault::open(dir.path()).unwrap());
        let (sender, receiver) = mpsc::channel();
        let watcher = vault
            .watch(move |changes| {
                let _ = sender.send(changes);
            })
            .unwrap();
        // macOS can replay the setup write above; drain it so tests see only their own changes.
        while receiver.recv_timeout(Duration::from_millis(800)).is_ok() {}
        (dir, vault, receiver, watcher)
    }

    fn wait_for_note_change(receiver: &Receiver<Vec<VaultChange>>, path: &str) -> bool {
        let wanted = VaultChange::Note {
            path: VaultPath::parse(path).unwrap(),
        };
        while let Ok(changes) = receiver.recv_timeout(WAIT) {
            if changes.contains(&wanted) {
                return true;
            }
        }
        false
    }

    #[test]
    fn an_outside_edit_is_reported() {
        let (_dir, vault, receiver, _watcher) = watched_vault();
        fs::write(vault.root().join("Note.md"), "edited in another app").unwrap();
        assert!(wait_for_note_change(&receiver, "Note.md"));
    }

    #[test]
    fn the_apps_own_save_is_not_reported_as_a_note_change() {
        let (_dir, vault, receiver, _watcher) = watched_vault();
        let path = VaultPath::parse("Note.md").unwrap();
        let note = vault.read_note(&path).unwrap();
        vault
            .save_note(&path, "---\nkey: k\n---\nsaved by the app", &note.hash)
            .unwrap();
        assert!(!wait_for_note_change(&receiver, "Note.md"));
    }
}
