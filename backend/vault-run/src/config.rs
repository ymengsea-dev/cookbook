//! The runners and time limit from `settings.local.json` (E-13, E-14). Node, Python 3 and
//! shell are set up by default. The file never syncs, so each device picks its own programs.

use std::ops::RangeInclusive;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use vault_core::Vault;

const RUNNERS_POINTER: &str = "/codeRun/runners";
const TIME_LIMIT_POINTER: &str = "/codeRun/timeLimitSeconds";
const DEFAULT_TIME_LIMIT_SECONDS: u64 = 30;
const TIME_LIMIT_SECONDS: RangeInclusive<u64> = 1..=3600;
const MAX_EXTENSION_LENGTH: usize = 10;

/// One program that runs code blocks, such as Node for `js` blocks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Runner {
    /// Shown in messages, such as "Node was not found".
    pub name: String,
    /// The fence labels it runs, such as `js` in a block that starts with ```` ```js ````.
    pub labels: Vec<String>,
    /// A program name looked up on the PATH, or a full path.
    pub command: String,
    /// Arguments placed before the code file's path.
    #[serde(default)]
    pub args: Vec<String>,
    /// The code file's extension, without the dot. Some interpreters need it.
    pub extension: String,
}

impl Runner {
    fn new(name: &str, labels: &[&str], command: &str, args: &[&str], extension: &str) -> Self {
        Self {
            name: name.to_string(),
            labels: labels.iter().map(|label| label.to_string()).collect(),
            command: command.to_string(),
            args: args.iter().map(|arg| arg.to_string()).collect(),
            extension: extension.to_string(),
        }
    }

    // The extension becomes part of a file name, so it may only hold letters and digits.
    fn is_valid(&self) -> bool {
        let has_labels = !self.labels.is_empty()
            && self
                .labels
                .iter()
                .all(|label| !label.is_empty() && !label.contains(char::is_whitespace));
        let extension_ok = !self.extension.is_empty()
            && self.extension.len() <= MAX_EXTENSION_LENGTH
            && self.extension.chars().all(|c| c.is_ascii_alphanumeric());
        !self.name.trim().is_empty()
            && !self.command.trim().is_empty()
            && has_labels
            && extension_ok
    }
}

/// The runners used when `settings.local.json` lists none (E-14).
pub fn default_runners() -> Vec<Runner> {
    vec![
        Runner::new("Node", &["js", "javascript", "node"], "node", &[], "js"),
        // `-u` sends output as it is printed, not all at once when Python exits.
        Runner::new(
            "Python 3",
            &["python", "py", "python3"],
            "python3",
            &["-u"],
            "py",
        ),
        Runner::new("Shell", &["sh", "shell", "bash"], "/bin/bash", &[], "sh"),
    ]
}

#[derive(Debug, Clone, PartialEq)]
pub struct RunSettings {
    pub runners: Vec<Runner>,
    pub time_limit: Duration,
    /// Problems found while loading, in words the user can act on.
    pub warnings: Vec<String>,
}

impl RunSettings {
    /// Reads the runners and time limit. Bad values fall back to the defaults (S-4).
    pub fn load(vault: &Vault) -> Self {
        let mut file = vault.local_settings_file();
        let runners = file.get(
            RUNNERS_POINTER,
            default_runners(),
            |runners: &Vec<Runner>| runners.iter().all(Runner::is_valid),
        );
        let seconds = file.get(TIME_LIMIT_POINTER, DEFAULT_TIME_LIMIT_SECONDS, |seconds| {
            TIME_LIMIT_SECONDS.contains(seconds)
        });
        Self {
            runners,
            time_limit: Duration::from_secs(seconds),
            warnings: file.warnings,
        }
    }

    /// The runner for a fence label. Case doesn't matter, so `JS` finds the `js` runner.
    pub fn runner_for(&self, label: &str) -> Option<&Runner> {
        let wanted = label.to_lowercase();
        self.runners.iter().find(|runner| {
            runner
                .labels
                .iter()
                .any(|known| known.to_lowercase() == wanted)
        })
    }

    /// Every label that has a runner, in lowercase, so the editor knows where to show Run.
    pub fn labels(&self) -> Vec<String> {
        let mut labels = Vec::new();
        for label in self.runners.iter().flat_map(|runner| &runner.labels) {
            let label = label.to_lowercase();
            if !labels.contains(&label) {
                labels.push(label);
            }
        }
        labels
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn vault_with_local_settings(json: &str) -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".vault")).unwrap();
        fs::write(dir.path().join(".vault/settings.local.json"), json).unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        (dir, vault)
    }

    #[test]
    fn node_python_and_shell_are_set_up_by_default() {
        let dir = tempfile::tempdir().unwrap();
        let settings = RunSettings::load(&Vault::open(dir.path()).unwrap());

        assert_eq!(settings.runner_for("js").unwrap().command, "node");
        assert_eq!(settings.runner_for("Python").unwrap().command, "python3");
        assert_eq!(settings.runner_for("bash").unwrap().command, "/bin/bash");
        assert_eq!(settings.time_limit, Duration::from_secs(30));
        assert!(settings.warnings.is_empty());
    }

    #[test]
    fn an_unknown_label_has_no_runner() {
        let dir = tempfile::tempdir().unwrap();
        let settings = RunSettings::load(&Vault::open(dir.path()).unwrap());
        assert!(settings.runner_for("rust").is_none());
        assert!(settings.runner_for("").is_none());
    }

    #[test]
    fn runners_in_the_file_replace_the_defaults() {
        let (_dir, vault) = vault_with_local_settings(
            r#"{ "codeRun": { "timeLimitSeconds": 5, "runners": [
                { "name": "Ruby", "labels": ["rb", "Ruby"], "command": "ruby", "extension": "rb" }
            ] } }"#,
        );
        let settings = RunSettings::load(&vault);

        assert_eq!(settings.labels(), ["rb", "ruby"]);
        assert!(settings.runner_for("js").is_none());
        assert_eq!(settings.time_limit, Duration::from_secs(5));
    }

    #[test]
    fn a_bad_runner_falls_back_to_the_defaults_with_a_warning() {
        let (_dir, vault) = vault_with_local_settings(
            r#"{ "codeRun": { "runners": [
                { "name": "Bad", "labels": ["x"], "command": "x", "extension": "../../evil" }
            ] } }"#,
        );
        let settings = RunSettings::load(&vault);

        assert_eq!(settings.runners, default_runners());
        assert_eq!(settings.warnings.len(), 1);
    }
}
