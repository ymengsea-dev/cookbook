//! Events sent from Rust to the UI. Names must match `EventMap` in `ui/src/shared/ipc`.

/// Payload: `Vec<VaultChange>`, one batch of changes made outside the app.
pub const VAULT_CHANGED: &str = "vault-changed";

/// No payload. The app wants to quit: save everything, then call `app_quit`.
pub const BEFORE_QUIT: &str = "before-quit";

/// Payload: `IndexProgress`. Sent while the search index catches up with the files.
pub const INDEX_PROGRESS: &str = "index-progress";
