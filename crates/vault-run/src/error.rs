use std::io;

use vault_core::VaultError;

/// Everything that can stop a code block from running. Messages are shown to the user.
#[derive(Debug, thiserror::Error)]
pub enum RunError {
    #[error(
        "No runner is set up for \"{0}\" code blocks. Runners are listed in .vault/settings.local.json."
    )]
    UnknownLanguage(String),

    #[error(
        "{name} was not found. Install it, or set the full path to \"{command}\" in .vault/settings.local.json."
    )]
    RunnerMissing { name: String, command: String },

    /// The user said no to the safety warning or to trusting the note.
    #[error("The code was not run.")]
    Declined,

    #[error("Could not {action}: {source}")]
    Io {
        action: String,
        #[source]
        source: io::Error,
    },

    #[error(transparent)]
    Vault(#[from] VaultError),
}

impl RunError {
    /// Builds a `map_err` closure for an I/O call, keeping what was being done for the message.
    pub(crate) fn io(action: impl Into<String>) -> impl FnOnce(io::Error) -> Self {
        let action = action.into();
        move |source| Self::Io { action, source }
    }
}
