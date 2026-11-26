//! Code runs in progress, so `code_stop` can find them and quitting can stop them all.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use vault_run::Stopper;

#[derive(Default)]
pub struct RunRegistry {
    running: Mutex<HashMap<String, Stopper>>,
}

impl RunRegistry {
    pub fn add(&self, run_id: String, stopper: Stopper) {
        self.lock().insert(run_id, stopper);
    }

    pub fn remove(&self, run_id: &str) {
        self.lock().remove(run_id);
    }

    /// Stops one run. A run that already ended is ignored.
    pub fn stop(&self, run_id: &str) {
        if let Some(stopper) = self.lock().get(run_id) {
            stopper.stop();
        }
    }

    /// Stops every run, when the vault changes or the app quits.
    pub fn stop_all(&self) {
        for stopper in self.lock().values() {
            stopper.stop();
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Stopper>> {
        self.running.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
