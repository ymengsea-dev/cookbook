//! One running program. It starts in its own process group, so Stop and the time limit
//! end it and everything it started (E-13). Output streams while it runs (E-12).

use std::io::{ErrorKind, Read, Write};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use rustix::process::{Pid, Signal, kill_process_group};
use tempfile::NamedTempFile;

use crate::RunError;
use crate::process::events::{OutputStream, RunEvent, RunOutcome};
use crate::process::locate::program_path_variable;
use crate::process::output::{OutputBuffer, Utf8Decoder};

/// Output past this size is dropped, so a runaway loop can't flood the editor.
pub const OUTPUT_LIMIT_BYTES: usize = 256 * 1024;
const TICK: Duration = Duration::from_millis(25);
/// Output goes to the UI at most this often, so a chatty program doesn't flood it.
const FLUSH_EVERY: Duration = Duration::from_millis(50);
/// How long to wait for the last output once the program has ended.
const DRAIN_GRACE: Duration = Duration::from_millis(500);
const READ_CHUNK_BYTES: usize = 8 * 1024;

type Chunk = (OutputStream, String);

/// A runner whose program was found on this Mac.
#[derive(Debug, Clone)]
pub struct ResolvedRunner {
    pub name: String,
    pub program: PathBuf,
    pub args: Vec<String>,
    pub extension: String,
}

/// Stops a run from another thread, for the Stop button and for quitting.
#[derive(Debug, Clone)]
pub struct Stopper {
    group: Pid,
    requested: Arc<AtomicBool>,
}

impl Stopper {
    /// Kills the program and everything it started.
    pub fn stop(&self) {
        self.requested.store(true, Ordering::SeqCst);
        kill_group(self.group);
    }

    fn was_requested(&self) -> bool {
        self.requested.load(Ordering::SeqCst)
    }
}

pub struct Program {
    child: Child,
    stopper: Stopper,
    output: Receiver<Chunk>,
    time_limit: Duration,
    started: Instant,
    /// The code file. It is deleted when the run ends.
    _code_file: NamedTempFile,
}

impl Program {
    /// Writes `code` to a temp file and starts `runner` on it, in `working_folder` (E-16).
    pub(crate) fn start(
        runner: &ResolvedRunner,
        code: &str,
        working_folder: &Path,
        time_limit: Duration,
    ) -> Result<Self, RunError> {
        let code_file = write_code_file(code, &runner.extension)?;
        let mut child = Command::new(&runner.program)
            .args(&runner.args)
            .arg(code_file.path())
            .current_dir(working_folder)
            .env("PATH", program_path_variable())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Its own process group, so one signal reaches every process it starts.
            .process_group(0)
            .spawn()
            .map_err(RunError::io(format!("start {}", runner.name)))?;

        let stopper = Stopper {
            group: Pid::from_child(&child),
            requested: Arc::new(AtomicBool::new(false)),
        };
        let (sender, output) = mpsc::channel();
        if let Some(stdout) = child.stdout.take() {
            read_in_background(stdout, OutputStream::Stdout, sender.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            read_in_background(stderr, OutputStream::Stderr, sender);
        }
        Ok(Self {
            child,
            stopper,
            output,
            time_limit,
            started: Instant::now(),
            _code_file: code_file,
        })
    }

    pub fn stopper(&self) -> Stopper {
        self.stopper.clone()
    }

    /// Streams output to `on_event` until the program ends, is stopped or runs out of
    /// time. The last event is always `Finished`.
    pub fn wait(mut self, mut on_event: impl FnMut(RunEvent)) -> RunOutcome {
        let mut buffer = OutputBuffer::new(OUTPUT_LIMIT_BYTES);
        let mut last_flush = Instant::now();
        let outcome = loop {
            self.collect_output(&mut buffer);
            if last_flush.elapsed() >= FLUSH_EVERY {
                buffer.flush(&mut on_event);
                last_flush = Instant::now();
            }
            if let Some(outcome) = self.check_end() {
                break outcome;
            }
        };

        // Anything it left running in the background ends with it.
        kill_group(self.stopper.group);
        let _ = self.child.wait();
        self.drain_output(&mut buffer);
        buffer.flush(&mut on_event);

        let millis = u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX);
        on_event(RunEvent::Finished {
            outcome: outcome.clone(),
            millis,
        });
        outcome
    }

    fn collect_output(&self, buffer: &mut OutputBuffer) {
        match self.output.recv_timeout(TICK) {
            Ok((stream, text)) => buffer.push(stream, &text),
            Err(RecvTimeoutError::Timeout) => {}
            // Both streams closed but the program still runs: don't spin.
            Err(RecvTimeoutError::Disconnected) => thread::sleep(TICK),
        }
    }

    fn check_end(&mut self) -> Option<RunOutcome> {
        if self.stopper.was_requested() {
            return Some(RunOutcome::Stopped);
        }
        if self.started.elapsed() >= self.time_limit {
            return Some(RunOutcome::TimedOut {
                seconds: self.time_limit.as_secs(),
            });
        }
        match self.child.try_wait() {
            Ok(Some(status)) => Some(RunOutcome::Exited {
                code: status.code(),
            }),
            Ok(None) => None,
            // The program can no longer be watched; treat it as ended.
            Err(_) => Some(RunOutcome::Exited { code: None }),
        }
    }

    fn drain_output(&self, buffer: &mut OutputBuffer) {
        let deadline = Instant::now() + DRAIN_GRACE;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.output.recv_timeout(left) {
                Ok((stream, text)) => buffer.push(stream, &text),
                Err(_) => return,
            }
        }
    }
}

fn write_code_file(code: &str, extension: &str) -> Result<NamedTempFile, RunError> {
    let action = "write the code to a temporary file";
    let mut file = tempfile::Builder::new()
        .prefix("note-code-")
        .suffix(&format!(".{extension}"))
        .tempfile()
        .map_err(RunError::io(action))?;
    file.write_all(code.as_bytes())
        .and_then(|()| file.flush())
        .map_err(RunError::io(action))?;
    Ok(file)
}

fn read_in_background(
    source: impl Read + Send + 'static,
    stream: OutputStream,
    sender: Sender<Chunk>,
) {
    thread::spawn(move || read_stream(source, stream, &sender));
}

fn read_stream(mut source: impl Read, stream: OutputStream, sender: &Sender<Chunk>) {
    let mut decoder = Utf8Decoder::default();
    let mut chunk = [0_u8; READ_CHUNK_BYTES];
    loop {
        let count = match source.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => count,
            Err(error) if error.kind() == ErrorKind::Interrupted => continue,
            Err(_) => break,
        };
        let text = decoder.decode(&chunk[..count]);
        if !text.is_empty() && sender.send((stream, text)).is_err() {
            return;
        }
    }
    let rest = decoder.finish();
    if !rest.is_empty() {
        let _ = sender.send((stream, rest));
    }
}

// Fails only when nothing in the group is left to kill.
fn kill_group(group: Pid) {
    let _ = kill_process_group(group, Signal::KILL);
}
