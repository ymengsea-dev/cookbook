//! The one import or export allowed at a time, with its progress and Cancel button.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::events::IO_PROGRESS;

/// Progress goes to the UI at most this often.
const PROGRESS_EVERY: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Copy, Serialize, TS)]
#[ts(export)]
pub struct IoProgress {
    pub done: usize,
    pub total: usize,
}

#[derive(Default)]
pub struct IoJobs {
    running: Mutex<Option<Arc<AtomicBool>>>,
}

impl IoJobs {
    /// Claims the slot, or fails with `busy` while another job runs.
    pub fn start(self: &Arc<Self>, app: AppHandle) -> CommandResult<RunningJob> {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        if running.is_some() {
            return Err(CommandError::new(
                ErrorCode::Busy,
                "An import or export is already running.",
            ));
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        *running = Some(Arc::clone(&cancelled));
        Ok(RunningJob {
            app,
            jobs: Arc::clone(self),
            cancelled,
            last_report: Mutex::new(None),
        })
    }

    pub fn cancel(&self) {
        if let Some(cancelled) = self
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
        {
            cancelled.store(true, Ordering::SeqCst);
        }
    }
}

/// Frees the slot when dropped, however the job ends.
pub struct RunningJob {
    app: AppHandle,
    jobs: Arc<IoJobs>,
    cancelled: Arc<AtomicBool>,
    last_report: Mutex<Option<Instant>>,
}

impl vault_io::Job for RunningJob {
    fn progress(&self, done: usize, total: usize) {
        let mut last = self
            .last_report
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let due = last.is_none_or(|at| at.elapsed() >= PROGRESS_EVERY);
        if due || done == total {
            *last = Some(Instant::now());
            // A UI that is reloading misses one update; the next one catches up.
            let _ = self.app.emit(IO_PROGRESS, IoProgress { done, total });
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Drop for RunningJob {
    fn drop(&mut self) {
        *self
            .jobs
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = None;
    }
}
