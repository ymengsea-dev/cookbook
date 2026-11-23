//! What a run sends to the UI while it runs, in order. The last event is always `Finished`.

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum OutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum RunEvent {
    /// Text the program wrote, as it arrived.
    Output { stream: OutputStream, text: String },
    /// The output reached `bytes`; anything after it is dropped.
    Truncated { bytes: usize },
    /// The program and everything it started have ended.
    Finished {
        outcome: RunOutcome,
        #[ts(type = "number")]
        millis: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum RunOutcome {
    /// The program ended by itself. `code` is empty when a signal ended it.
    Exited { code: Option<i32> },
    /// The user pressed Stop.
    Stopped,
    /// The time limit (E-13) ran out.
    TimedOut {
        #[ts(type = "number")]
        seconds: u64,
    },
}
