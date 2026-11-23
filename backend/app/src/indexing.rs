//! Keeps the search index current on a background thread (X-3).
//!
//! Every request to sync goes into a channel. The thread drains all waiting requests
//! before syncing, so a burst of saves causes one sync, not one per save.

use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use tauri::{AppHandle, Emitter};
use vault_core::Vault;
use vault_index::{IndexError, NoteIndex};

use crate::events::{INDEX_PROGRESS, INDEX_UPDATED};

pub struct Indexer {
    index: Arc<NoteIndex>,
    requests: Sender<()>,
}

impl Indexer {
    /// Opens the vault's index and starts the first sync. The thread stops when the
    /// `Indexer` is dropped (another vault was opened).
    pub fn start(vault: Arc<Vault>, app: AppHandle) -> Result<Self, IndexError> {
        let index = Arc::new(NoteIndex::open(&vault)?);
        let (requests, receiver) = mpsc::channel();
        let worker_index = Arc::clone(&index);
        thread::spawn(move || run(&vault, &worker_index, &receiver, &app));

        let indexer = Self { index, requests };
        indexer.request_sync();
        Ok(indexer)
    }

    pub fn request_sync(&self) {
        // Fails only if the thread has stopped, and then there is nothing to update.
        let _ = self.requests.send(());
    }

    pub fn index(&self) -> Arc<NoteIndex> {
        Arc::clone(&self.index)
    }
}

fn run(vault: &Vault, index: &NoteIndex, requests: &Receiver<()>, app: &AppHandle) {
    while requests.recv().is_ok() {
        while requests.try_recv().is_ok() {}
        let result = index.sync(vault, |progress| {
            let _ = app.emit(INDEX_PROGRESS, progress);
        });
        match result {
            Ok(report) if report.indexed > 0 || report.removed > 0 => {
                let _ = app.emit(INDEX_UPDATED, ());
            }
            Ok(_) => {}
            // The index is a cache; search is just less fresh until the next sync.
            Err(error) => eprintln!("Search index sync failed: {error}"),
        }
    }
}
