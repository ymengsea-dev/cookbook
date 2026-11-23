//! Runs real programs (`/bin/bash`, `node`) the way the app does.
#![allow(clippy::unwrap_used)]

use std::cell::Cell;
use std::fs;
use std::thread;
use std::time::{Duration, Instant};

use rustix::process::{Pid, test_kill_process};
use tempfile::TempDir;
use vault_core::{Vault, VaultPath};
use vault_run::{
    CodeRequest, Consent, OutputStream, RunError, RunEvent, RunOutcome, RunTrust, mark_untrusted,
    start,
};

const KEY: &str = "01JD8Y3N6Q4F9K2V7R5T0W1XZB";

/// Answers every question the same way and counts how often it was asked.
struct FakeConsent {
    answer: bool,
    asked_risk: Cell<u32>,
    asked_trust: Cell<u32>,
}

impl FakeConsent {
    fn answering(answer: bool) -> Self {
        Self {
            answer,
            asked_risk: Cell::new(0),
            asked_trust: Cell::new(0),
        }
    }
}

impl Consent for FakeConsent {
    fn accept_risk(&self) -> bool {
        self.asked_risk.set(self.asked_risk.get() + 1);
        self.answer
    }

    fn trust_note(&self, _note: &VaultPath) -> bool {
        self.asked_trust.set(self.asked_trust.get() + 1);
        self.answer
    }
}

/// A vault with one keyed note in `Code/`, and the given `codeRun` settings.
fn vault_with(code_run: &str) -> (TempDir, Vault, VaultPath) {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join(".vault")).unwrap();
    fs::create_dir_all(dir.path().join("Code")).unwrap();
    fs::write(
        dir.path().join(".vault/settings.local.json"),
        format!(r#"{{ "codeRun": {code_run} }}"#),
    )
    .unwrap();
    fs::write(
        dir.path().join("Code/Note.md"),
        format!("---\nkey: {KEY}\n---\n# Note\n"),
    )
    .unwrap();
    let vault = Vault::open(dir.path()).unwrap();
    (dir, vault, VaultPath::parse("Code/Note.md").unwrap())
}

fn run(vault: &Vault, note: &VaultPath, label: &str, code: &str) -> (Vec<RunEvent>, RunOutcome) {
    let request = CodeRequest { note, label, code };
    let program = start(vault, &request, &FakeConsent::answering(true)).unwrap();
    let mut events = Vec::new();
    let outcome = program.wait(|event| events.push(event));
    (events, outcome)
}

fn text_of(events: &[RunEvent], wanted: OutputStream) -> String {
    let mut text = String::new();
    for event in events {
        if let RunEvent::Output { stream, text: part } = event
            && *stream == wanted
        {
            text.push_str(part);
        }
    }
    text
}

fn is_running(pid: i32) -> bool {
    test_kill_process(Pid::from_raw(pid).unwrap()).is_ok()
}

#[test]
fn an_endless_loop_is_stopped_at_the_time_limit_with_its_children() {
    let (dir, vault, note) = vault_with(r#"{ "timeLimitSeconds": 1, "warningAccepted": true }"#);
    // The background `sleep` is a child process; its pid lands in the note's folder.
    let code = "sleep 300 &\necho $! > child.pid\nwhile true; do :; done\n";

    let started = Instant::now();
    let (events, outcome) = run(&vault, &note, "sh", code);

    assert_eq!(outcome, RunOutcome::TimedOut { seconds: 1 });
    assert!(started.elapsed() < Duration::from_secs(5));
    assert!(matches!(events.last(), Some(RunEvent::Finished { .. })));

    let child: i32 = fs::read_to_string(dir.path().join("Code/child.pid"))
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    // A killed process may linger for a moment until it is reaped.
    let deadline = Instant::now() + Duration::from_secs(3);
    while is_running(child) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(
        !is_running(child),
        "the child process outlived the time limit"
    );
}

#[test]
fn an_unknown_language_label_is_refused_before_asking_anything() {
    let (_dir, vault, note) = vault_with("{}");
    let consent = FakeConsent::answering(true);
    let request = CodeRequest {
        note: &note,
        label: "cobol",
        code: "DISPLAY 'HI'.",
    };

    let result = start(&vault, &request, &consent);

    assert!(matches!(result, Err(RunError::UnknownLanguage(label)) if label == "cobol"));
    assert_eq!(consent.asked_risk.get(), 0);
}

#[test]
fn a_missing_interpreter_gives_a_clear_message() {
    let (_dir, vault, note) = vault_with(
        r#"{ "warningAccepted": true, "runners": [
            { "name": "Ruby", "labels": ["rb"], "command": "no-such-interpreter-here", "extension": "rb" }
        ] }"#,
    );
    let request = CodeRequest {
        note: &note,
        label: "rb",
        code: "puts 1",
    };

    let error = start(&vault, &request, &FakeConsent::answering(true))
        .err()
        .unwrap();

    assert!(matches!(error, RunError::RunnerMissing { .. }));
    assert!(error.to_string().starts_with("Ruby was not found."));
}

#[test]
fn the_first_run_in_a_vault_shows_the_warning_once() {
    let (dir, vault, note) = vault_with("{}");
    let request = CodeRequest {
        note: &note,
        label: "sh",
        code: "touch ran",
    };

    let declined = FakeConsent::answering(false);
    assert!(matches!(
        start(&vault, &request, &declined),
        Err(RunError::Declined)
    ));
    assert!(!dir.path().join("Code/ran").exists());

    let accepted = FakeConsent::answering(true);
    start(&vault, &request, &accepted).unwrap().wait(|_| {});
    start(&vault, &request, &accepted).unwrap().wait(|_| {});
    assert_eq!(accepted.asked_risk.get(), 1);
    assert!(dir.path().join("Code/ran").exists());
}

#[test]
fn an_untrusted_note_asks_for_trust_before_it_runs() {
    let (dir, vault, note) = vault_with(r#"{ "warningAccepted": true }"#);
    mark_untrusted(&vault, &[KEY.to_string()]).unwrap();
    let request = CodeRequest {
        note: &note,
        label: "sh",
        code: "touch ran",
    };

    let declined = FakeConsent::answering(false);
    assert!(matches!(
        start(&vault, &request, &declined),
        Err(RunError::Declined)
    ));
    assert_eq!(declined.asked_trust.get(), 1);
    assert!(!dir.path().join("Code/ran").exists());

    let accepted = FakeConsent::answering(true);
    start(&vault, &request, &accepted).unwrap().wait(|_| {});
    start(&vault, &request, &accepted).unwrap().wait(|_| {});
    assert_eq!(accepted.asked_trust.get(), 1);
    assert!(dir.path().join("Code/ran").exists());
    assert!(RunTrust::load(&vault).is_trusted(Some(KEY)));
}

#[test]
fn a_shell_block_streams_stdout_stderr_and_its_exit_code() {
    let (_dir, vault, note) = vault_with(r#"{ "warningAccepted": true }"#);
    let code = "echo out\necho err >&2\npwd\nexit 3\n";

    let (events, outcome) = run(&vault, &note, "bash", code);

    assert_eq!(outcome, RunOutcome::Exited { code: Some(3) });
    let stdout = text_of(&events, OutputStream::Stdout);
    assert!(stdout.starts_with("out\n"));
    // Runs in the note's folder (E-16).
    assert!(stdout.trim_end().ends_with("/Code"));
    assert_eq!(text_of(&events, OutputStream::Stderr), "err\n");
}

#[test]
fn a_javascript_block_runs_with_node() {
    let (_dir, vault, note) = vault_with(r#"{ "warningAccepted": true }"#);

    let (events, outcome) = run(&vault, &note, "js", "console.log('ខ្មែរ', 1 + 1);");

    assert_eq!(outcome, RunOutcome::Exited { code: Some(0) });
    assert_eq!(text_of(&events, OutputStream::Stdout), "ខ្មែរ 2\n");
}

#[test]
fn a_python_block_runs_with_python3() {
    // Python 3 ships with the Xcode command line tools, which Rust needs on macOS anyway.
    let (_dir, vault, note) = vault_with(r#"{ "warningAccepted": true }"#);

    let (events, outcome) = run(&vault, &note, "python", "print('日本語', 6 * 7)");

    assert_eq!(outcome, RunOutcome::Exited { code: Some(0) });
    assert_eq!(text_of(&events, OutputStream::Stdout), "日本語 42\n");
}

#[test]
fn stop_ends_a_running_program() {
    let (_dir, vault, note) = vault_with(r#"{ "warningAccepted": true }"#);
    let request = CodeRequest {
        note: &note,
        label: "sh",
        code: "sleep 100",
    };
    let program = start(&vault, &request, &FakeConsent::answering(true)).unwrap();
    let stopper = program.stopper();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(200));
        stopper.stop();
    });

    let started = Instant::now();
    assert_eq!(program.wait(|_| {}), RunOutcome::Stopped);
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn output_past_the_limit_is_cut_off() {
    let (_dir, vault, note) = vault_with(r#"{ "warningAccepted": true }"#);
    let code = "head -c 600000 /dev/zero | tr '\\0' 'x'";

    let (events, _) = run(&vault, &note, "sh", code);

    assert_eq!(
        text_of(&events, OutputStream::Stdout).len(),
        vault_run::OUTPUT_LIMIT_BYTES
    );
    assert!(events.contains(&RunEvent::Truncated {
        bytes: vault_run::OUTPUT_LIMIT_BYTES
    }));
}
