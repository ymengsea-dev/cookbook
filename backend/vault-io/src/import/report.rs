//! What an import did (IO-1, IO-3). It is shown to the user and saved in `.vault/imports/`.

use serde::Serialize;
use ts_rs::TS;
use vault_core::{Vault, VaultPath};

use crate::IoError;

#[derive(Debug, Clone, Default, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportReport {
    pub notes: usize,
    pub attachments: usize,
    pub links_fixed: usize,
    /// Copies whose key another note already had, so they got a new one (V-10).
    pub rekeyed: usize,
    /// Files that came in under another name, because the name was taken or not allowed.
    pub renamed: Vec<RenamedItem>,
    pub skipped: Vec<SkippedItem>,
    pub cancelled: bool,
    /// The folder a folder import went into.
    pub destination: Option<VaultPath>,
    /// Where this report was saved.
    pub saved_as: Option<VaultPath>,
    /// Keys of imported notes with code blocks; they must be trusted before they run (E-15).
    #[serde(skip)]
    #[ts(skip)]
    pub code_note_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct RenamedItem {
    pub from: String,
    pub to: VaultPath,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct SkippedItem {
    pub path: String,
    pub reason: String,
}

impl ImportReport {
    /// Saves the report as Markdown in `.vault/imports/`, which never syncs or exports.
    pub(crate) fn save(&mut self, vault: &Vault, now_seconds: u64) -> Result<(), IoError> {
        let path = VaultPath::parse(&format!(".vault/imports/import-{now_seconds}.md"))?;
        let full = path.to_fs_path(vault.root());
        if let Some(folder) = full.parent() {
            std::fs::create_dir_all(folder).map_err(IoError::file("create", ".vault/imports"))?;
        }
        vault
            .writer()
            .write(&full, self.to_markdown().as_bytes(), path.as_str())?;
        self.saved_as = Some(path);
        Ok(())
    }

    fn to_markdown(&self) -> String {
        let mut text = String::from("# Import report\n\n");
        if self.cancelled {
            text.push_str("The import was cancelled. Files copied before that were kept.\n\n");
        }
        text.push_str(&format!(
            "- Notes: {}\n- Attachments: {}\n- Links fixed: {}\n- New keys for copies: {}\n",
            self.notes, self.attachments, self.links_fixed, self.rekeyed
        ));
        if let Some(destination) = &self.destination {
            text.push_str(&format!("- Imported into: {destination}\n"));
        }
        if !self.renamed.is_empty() {
            text.push_str("\n## Renamed\n\n");
            for item in &self.renamed {
                text.push_str(&format!("- {} → {}\n", item.from, item.to));
            }
        }
        if !self.skipped.is_empty() {
            text.push_str("\n## Skipped\n\n");
            for item in &self.skipped {
                text.push_str(&format!("- {}: {}\n", item.path, item.reason));
            }
        }
        text
    }
}
