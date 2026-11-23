use std::io;

use vault_core::VaultError;

/// Everything that can go wrong in an import or export. Messages are shown to the user.
#[derive(Debug, thiserror::Error)]
pub enum IoError {
    #[error(transparent)]
    Vault(#[from] VaultError),

    #[error("Could not {action} \"{path}\": {source}")]
    File {
        action: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("\"{0}\" is not a ZIP file that can be read.")]
    BadZip(String),

    #[error("The {0} was cancelled.")]
    Cancelled(&'static str),
}

impl IoError {
    /// Builds a `map_err` closure for a file call, keeping the action and path for the message.
    pub(crate) fn file(
        action: &'static str,
        path: impl Into<String>,
    ) -> impl FnOnce(io::Error) -> Self {
        let path = path.into();
        move |source| Self::File {
            action,
            path,
            source,
        }
    }
}
