use serde::Serialize;
use ts_rs::TS;
use vault_core::VaultError;
use vault_index::IndexError;
use vault_io::IoError;
use vault_run::RunError;
use vault_views::ViewError;

/// The error every command returns. The UI shows `message` and branches on `code`.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommandError {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export)]
pub enum ErrorCode {
    NoVault,
    InvalidPath,
    NotFound,
    AlreadyExists,
    NotText,
    NotAPdf,
    ChangedOnDisk,
    InvalidFrontMatter,
    ReadOnlySettings,
    InvalidView,
    Index,
    /// No runner is set up for the code block's label.
    NoRunner,
    /// The runner's program is not installed.
    RunnerMissing,
    /// The user said no to running the code.
    Declined,
    /// Another import or export is still running.
    Busy,
    Cancelled,
    BadZip,
    Io,
}

pub type CommandResult<T> = Result<T, CommandError>;

impl CommandError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn no_vault() -> Self {
        Self::new(ErrorCode::NoVault, "Open a folder first.")
    }
}

impl From<VaultError> for CommandError {
    fn from(error: VaultError) -> Self {
        let code = match &error {
            VaultError::InvalidPath(_) | VaultError::NotAFolder(_) => ErrorCode::InvalidPath,
            VaultError::NotFound(_) => ErrorCode::NotFound,
            VaultError::AlreadyExists(_) => ErrorCode::AlreadyExists,
            VaultError::NotText(_) => ErrorCode::NotText,
            VaultError::NotAPdf(_) => ErrorCode::NotAPdf,
            VaultError::ChangedOnDisk(_) => ErrorCode::ChangedOnDisk,
            VaultError::BadFrontMatter(_) | VaultError::InvalidProperty(_) => {
                ErrorCode::InvalidFrontMatter
            }
            VaultError::NewerSettings(_) => ErrorCode::ReadOnlySettings,
            VaultError::Io { .. } => ErrorCode::Io,
        };
        Self::new(code, error.to_string())
    }
}

impl From<IndexError> for CommandError {
    fn from(error: IndexError) -> Self {
        match error {
            IndexError::Vault(vault_error) => Self::from(vault_error),
            other => Self::new(ErrorCode::Index, other.to_string()),
        }
    }
}

impl From<ViewError> for CommandError {
    fn from(error: ViewError) -> Self {
        let message = error.to_string();
        let code = match error {
            ViewError::Vault(vault_error) => return Self::from(vault_error),
            ViewError::Index(index_error) => return Self::from(index_error),
            ViewError::NotFound(_) => ErrorCode::NotFound,
            ViewError::Broken(..) | ViewError::InvalidName(_) => ErrorCode::InvalidView,
            ViewError::NewerVersion(_) => ErrorCode::ReadOnlySettings,
            ViewError::Io(_) => ErrorCode::Io,
        };
        Self::new(code, message)
    }
}

impl From<RunError> for CommandError {
    fn from(error: RunError) -> Self {
        let message = error.to_string();
        let code = match error {
            RunError::Vault(vault_error) => return Self::from(vault_error),
            RunError::UnknownLanguage(_) => ErrorCode::NoRunner,
            RunError::RunnerMissing { .. } => ErrorCode::RunnerMissing,
            RunError::Declined => ErrorCode::Declined,
            RunError::Io { .. } => ErrorCode::Io,
        };
        Self::new(code, message)
    }
}

impl From<IoError> for CommandError {
    fn from(error: IoError) -> Self {
        let message = error.to_string();
        let code = match error {
            IoError::Vault(vault_error) => return Self::from(vault_error),
            IoError::File { .. } => ErrorCode::Io,
            IoError::BadZip(_) => ErrorCode::BadZip,
            IoError::Cancelled(_) => ErrorCode::Cancelled,
        };
        Self::new(code, message)
    }
}
