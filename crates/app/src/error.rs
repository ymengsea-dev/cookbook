use serde::Serialize;
use ts_rs::TS;
use vault_core::VaultError;

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
    ChangedOnDisk,
    InvalidFrontMatter,
    ReadOnlySettings,
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
