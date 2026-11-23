//! The questions asked before code runs (E-15). They are native dialogs shown from Rust,
//! so the UI can't answer them on the user's behalf.

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use vault_core::VaultPath;
use vault_run::Consent;

pub struct DialogConsent {
    app: AppHandle,
}

impl DialogConsent {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    /// Blocks until the user answers, so call it off the main thread.
    fn ask(&self, title: &str, message: &str, ok: &str) -> bool {
        let buttons = MessageDialogButtons::OkCancelCustom(ok.to_string(), "Cancel".to_string());
        let mut dialog = self
            .app
            .dialog()
            .message(message)
            .title(title)
            .kind(MessageDialogKind::Warning)
            .buttons(buttons);
        if let Some(window) = self.app.get_webview_window("main") {
            dialog = dialog.parent(&window);
        }
        dialog.blocking_show()
    }
}

impl Consent for DialogConsent {
    fn accept_risk(&self) -> bool {
        self.ask(
            "Run code from your notes?",
            "Code blocks run as programs on your Mac, with your permissions. They are not \
             sandboxed, so they can read, change or delete your files.\n\nOnly run code you \
             trust. You'll see this once for this vault.",
            "Run",
        )
    }

    fn trust_note(&self, note: &VaultPath) -> bool {
        self.ask(
            &format!("Trust \u{201c}{}\u{201d}?", note.file_name()),
            "This note came from sync or import. Its code blocks run with your permissions \
             and are not sandboxed.\n\nTrust it only if you know where it came from.",
            "Trust and Run",
        )
    }
}
