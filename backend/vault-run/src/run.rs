//! Starting one code block (E-11, E-15, E-16): find its runner, get the user's consent,
//! then start the program in the note's folder.

use vault_core::{KEY_PROPERTY, PropertyValue, Vault, VaultPath, read_property};

use crate::RunError;
use crate::config::{RunSettings, Runner};
use crate::process::locate::{find_program, search_folders};
use crate::process::program::{Program, ResolvedRunner};
use crate::trust::{RunTrust, accept_warning, trust_note};

/// One code block the user asked to run.
#[derive(Debug, Clone, Copy)]
pub struct CodeRequest<'a> {
    pub note: &'a VaultPath,
    /// The fence label, such as `js`.
    pub label: &'a str,
    pub code: &'a str,
}

/// Asks the user before code runs. The app shows native dialogs; tests answer directly.
pub trait Consent {
    /// Before the first run in a vault: code runs with the user's rights, unsandboxed.
    fn accept_risk(&self) -> bool;
    /// Before a note that came by sync or import runs for the first time.
    fn trust_note(&self, note: &VaultPath) -> bool;
}

/// Starts the block's program. Unknown labels are refused before the user is asked anything.
pub fn start(
    vault: &Vault,
    request: &CodeRequest<'_>,
    consent: &dyn Consent,
) -> Result<Program, RunError> {
    let settings = RunSettings::load(vault);
    let runner = settings
        .runner_for(request.label)
        .ok_or_else(|| RunError::UnknownLanguage(request.label.to_string()))?;
    let resolved = resolve(runner)?;
    ask_consent(vault, request.note, consent)?;

    let note_file = request.note.to_fs_path(vault.root());
    let working_folder = note_file.parent().unwrap_or(vault.root());
    Program::start(&resolved, request.code, working_folder, settings.time_limit)
}

fn resolve(runner: &Runner) -> Result<ResolvedRunner, RunError> {
    let program = find_program(&runner.command, &search_folders()).ok_or_else(|| {
        RunError::RunnerMissing {
            name: runner.name.clone(),
            command: runner.command.clone(),
        }
    })?;
    Ok(ResolvedRunner {
        name: runner.name.clone(),
        program,
        args: runner.args.clone(),
        extension: runner.extension.clone(),
    })
}

fn ask_consent(vault: &Vault, note: &VaultPath, consent: &dyn Consent) -> Result<(), RunError> {
    let trust = RunTrust::load(vault);
    if !trust.warning_accepted {
        if !consent.accept_risk() {
            return Err(RunError::Declined);
        }
        accept_warning(vault)?;
    }

    // The key is read from disk, so the UI can't claim a different note.
    let key = note_key(&vault.read_note(note)?.content);
    if !trust.is_trusted(key.as_deref()) {
        if !consent.trust_note(note) {
            return Err(RunError::Declined);
        }
        if let Some(key) = key {
            trust_note(vault, &key)?;
        }
    }
    Ok(())
}

fn note_key(content: &str) -> Option<String> {
    match read_property(content, KEY_PROPERTY) {
        Ok(Some(PropertyValue::Text(key))) if !key.trim().is_empty() => Some(key),
        _ => None,
    }
}
