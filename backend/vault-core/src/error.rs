use std::io;

/// Everything that can go wrong in `vault-core`. Messages are shown to the user.
#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("\"{0}\" is not a valid path inside the vault.")]
    InvalidPath(String),

    #[error("\"{0}\" is not a folder.")]
    NotAFolder(String),

    #[error("\"{0}\" was not found.")]
    NotFound(String),

    #[error("\"{0}\" already exists.")]
    AlreadyExists(String),

    #[error("\"{0}\" is not a text file.")]
    NotText(String),

    #[error("\"{0}\" changed on disk since it was opened.")]
    ChangedOnDisk(String),

    #[error("The note's front matter is not valid YAML: {0}")]
    BadFrontMatter(String),

    #[error("\"{0}\" cannot be saved as a property.")]
    InvalidProperty(String),

    #[error("{0} was saved by a newer version of the app, so it can't be changed here.")]
    NewerSettings(String),

    #[error("\"{0}\" is not a PDF file.")]
    NotAPdf(String),

    #[error("Could not {action} \"{path}\": {source}")]
    Io {
        action: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },
}

impl VaultError {
    /// Builds a `map_err` closure for an I/O call, keeping the action and path for the message.
    pub(crate) fn io(
        action: &'static str,
        path: impl Into<String>,
    ) -> impl FnOnce(io::Error) -> Self {
        let path = path.into();
        move |source| match source.kind() {
            io::ErrorKind::NotFound => Self::NotFound(path),
            io::ErrorKind::AlreadyExists => Self::AlreadyExists(path),
            _ => Self::Io {
                action,
                path,
                source,
            },
        }
    }
}
