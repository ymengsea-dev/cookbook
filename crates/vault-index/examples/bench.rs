//! Speed test for search (X-7): `pnpm bench`.
//!
//! Builds a vault of 10,000 generated notes, then measures a full index build and the
//! time for each keystroke's search. Targets: rebuild under 30 s, each search under 50 ms.

use std::error::Error;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

use vault_core::Vault;
use vault_index::NoteIndex;

const NOTE_COUNT: usize = 10_000;
const NOTES_PER_FOLDER: usize = 100;
const REBUILD_TARGET: Duration = Duration::from_secs(30);
const SEARCH_TARGET: Duration = Duration::from_millis(50);

/// Words the generated notes are made of, in several scripts.
const WORDS: &[&str] = &[
    "landing",
    "page",
    "pricing",
    "meeting",
    "notes",
    "project",
    "website",
    "draft",
    "budget",
    "review",
    "design",
    "calm",
    "warm",
    "paper",
    "search",
    "index",
    "garden",
    "travel",
    "recipe",
    "ភាសាខ្មែរ",
    "សួស្តី",
    "កំណត់ត្រា",
    "東京",
    "会議",
    "計画",
    "日本語",
    "ภาษาไทย",
    "中文",
];

/// Each query is typed one character at a time, like a person would.
const QUERIES: &[&str] = &[
    "landing page",
    "meeting",
    "東京",
    "ភាសា",
    "budget review",
    "zzz",
];

fn main() -> Result<(), Box<dyn Error>> {
    let dir = tempfile::tempdir()?;
    println!("Generating {NOTE_COUNT} notes…");
    generate_vault(dir.path())?;
    let vault = Vault::open(dir.path())?;
    let index = NoteIndex::open(&vault)?;

    let started = Instant::now();
    let report = index.rebuild(&vault, |_| {})?;
    let rebuild = started.elapsed();
    println!(
        "Full rebuild: {} notes in {:.2} s",
        report.indexed,
        rebuild.as_secs_f64()
    );

    let started = Instant::now();
    index.sync(&vault, |_| {})?;
    println!(
        "Sync with nothing changed: {} ms",
        started.elapsed().as_millis()
    );

    fs::write(
        dir.path().join("Folder 0/Note 0.md"),
        "# Changed\n\nOne note edited.\n",
    )?;
    let started = Instant::now();
    let report = index.sync(&vault, |_| {})?;
    println!(
        "Sync after editing one note: {} ms ({} re-indexed)",
        started.elapsed().as_millis(),
        report.indexed
    );

    let mut timings = Vec::new();
    for query in QUERIES {
        let mut typed = String::new();
        for character in query.chars() {
            typed.push(character);
            let started = Instant::now();
            index.search(&typed, 50)?;
            timings.push((started.elapsed(), typed.clone()));
        }
    }
    timings.sort_by_key(|(time, _)| *time);
    let (slowest, slowest_query) = timings.last().cloned().unwrap_or_default();
    let median = timings
        .get(timings.len() / 2)
        .map(|(time, _)| *time)
        .unwrap_or_default();
    let p95 = timings
        .get(timings.len() * 95 / 100)
        .map(|(time, _)| *time)
        .unwrap_or_default();
    println!(
        "Search per keystroke ({} searches): median {:.1} ms, 95% {:.1} ms, slowest {:.1} ms (\"{slowest_query}\")",
        timings.len(),
        millis(median),
        millis(p95),
        millis(slowest)
    );

    println!();
    report_target("Rebuild under 30 s", rebuild <= REBUILD_TARGET);
    report_target("Every search under 50 ms", slowest <= SEARCH_TARGET);
    if slowest > SEARCH_TARGET {
        println!(
            "  Slow step: searching \"{slowest_query}\". Words under 3 characters scan every note."
        );
    }
    Ok(())
}

fn generate_vault(root: &Path) -> Result<(), Box<dyn Error>> {
    let mut random = SimpleRandom(42);
    for number in 0..NOTE_COUNT {
        let folder = root.join(format!("Folder {}", number / NOTES_PER_FOLDER));
        fs::create_dir_all(&folder)?;
        let mut text = format!("---\ntags: [{}]\n---\n# Note {number}\n\n", random.word());
        for _ in 0..200 {
            text.push_str(random.word());
            text.push(if random.next().is_multiple_of(12) {
                '\n'
            } else {
                ' '
            });
        }
        fs::write(
            folder.join(format!("Note {}.md", number % NOTES_PER_FOLDER)),
            text,
        )?;
    }
    Ok(())
}

/// A tiny repeatable random generator, so every run builds the same vault.
struct SimpleRandom(u64);

impl SimpleRandom {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }

    fn word(&mut self) -> &'static str {
        let index = usize::try_from(self.next()).unwrap_or(0) % WORDS.len();
        WORDS[index]
    }
}

fn millis(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

fn report_target(name: &str, passed: bool) {
    println!("{} {name}", if passed { "PASS" } else { "FAIL" });
}
