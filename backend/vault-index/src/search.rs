//! Full-text search (X-5, X-6).
//!
//! Words of 3 or more characters use the trigram index. Shorter words, common in
//! Chinese and Japanese (日本), fall back to a LIKE scan, which the trigram index can't serve.

use rusqlite::params_from_iter;
use serde::Serialize;
use ts_rs::TS;

use crate::{IndexError, NoteIndex};

/// Around a match in a snippet. Private-use characters, so they never clash with note text.
pub const MATCH_START: char = '\u{E000}';
pub const MATCH_END: char = '\u{E001}';

const SNIPPET_CHARS: usize = 90;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    /// A short piece of the note with each match between `MATCH_START` and `MATCH_END`.
    pub snippet: String,
}

impl NoteIndex {
    /// Notes containing every word of `query`, best matches first.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, IndexError> {
        let terms: Vec<&str> = query.split_whitespace().collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        if terms.iter().all(|term| term.chars().count() >= 3) {
            self.search_trigrams(&terms, limit)
        } else {
            self.search_by_scanning(&terms, limit)
        }
    }

    fn search_trigrams(&self, terms: &[&str], limit: i64) -> Result<Vec<SearchHit>, IndexError> {
        // Each word is quoted, so characters like `-` or `*` are searched as text.
        let expression: Vec<String> = terms
            .iter()
            .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
            .collect();
        let connection = self.lock();
        let mut statement = connection.prepare(
            "SELECT n.path, n.title, snippet(notes_fts, -1, ?1, ?2, '…', 12)
             FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
             WHERE notes_fts MATCH ?3
             ORDER BY rank LIMIT ?4",
        )?;
        let rows = statement.query_map(
            rusqlite::params![
                MATCH_START.to_string(),
                MATCH_END.to_string(),
                expression.join(" "),
                limit
            ],
            |row| {
                Ok(SearchHit {
                    path: row.get(0)?,
                    title: row.get(1)?,
                    snippet: row.get(2)?,
                })
            },
        )?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    fn search_by_scanning(&self, terms: &[&str], limit: i64) -> Result<Vec<SearchHit>, IndexError> {
        let conditions =
            vec!["(f.title LIKE ? ESCAPE '\\' OR f.body LIKE ? ESCAPE '\\')"; terms.len()];
        let sql = format!(
            "SELECT n.path, n.title, f.body FROM notes_fts f JOIN notes n ON n.id = f.rowid
             WHERE {} ORDER BY n.title LIMIT {limit}",
            conditions.join(" AND ")
        );
        let patterns: Vec<String> = terms
            .iter()
            .flat_map(|term| {
                let pattern = format!("%{}%", escape_like(term));
                [pattern.clone(), pattern]
            })
            .collect();

        let connection = self.lock();
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(patterns), |row| {
            let body: String = row.get(2)?;
            Ok(SearchHit {
                path: row.get(0)?,
                title: row.get(1)?,
                snippet: make_snippet(&body, terms),
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

fn escape_like(term: &str) -> String {
    term.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// A piece of `body` around the first match, with every match marked.
pub fn make_snippet(body: &str, terms: &[&str]) -> String {
    let first = terms
        .iter()
        .filter_map(|term| body.find(term))
        .min()
        .unwrap_or(0);
    let start = char_boundary_before(body, first.saturating_sub(SNIPPET_CHARS / 3));
    let end = char_boundary_after(body, start + SNIPPET_CHARS * 4);
    let mut snippet = body[start..end].replace('\n', " ");
    for term in terms {
        snippet = snippet.replace(term, &format!("{MATCH_START}{term}{MATCH_END}"));
    }
    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < body.len() { "…" } else { "" };
    format!("{prefix}{}{suffix}", snippet.trim())
}

fn char_boundary_before(text: &str, mut index: usize) -> usize {
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn char_boundary_after(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippets_mark_every_match_and_stay_on_char_boundaries() {
        let snippet = make_snippet("日本語のテキスト。日本は島国です。", &["日本"]);
        assert!(snippet.starts_with(&format!("{MATCH_START}日本{MATCH_END}語")));
        assert_eq!(snippet.matches(MATCH_START).count(), 2);
    }

    #[test]
    fn like_wildcards_in_queries_are_literal() {
        assert_eq!(escape_like("50%_off"), "50\\%\\_off");
    }
}
