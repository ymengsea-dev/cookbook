//! Reading and editing the YAML block at the top of a note (V-3).
//!
//! Edits are line based on purpose: a YAML library would rewrite the whole block,
//! losing comments, key order and quoting. Here only the changed key's line moves.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use yaml_rust2::{Yaml, YamlLoader};

use crate::VaultError;

/// One front matter value, typed. Nested maps are not shown as properties.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "value", rename_all = "lowercase")]
#[ts(export)]
pub enum PropertyValue {
    Text(String),
    Number(f64),
    Bool(bool),
    List(Vec<PropertyValue>),
    Null,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Property {
    pub key: String,
    pub value: PropertyValue,
}

/// Where the front matter sits in the note, as byte offsets.
struct Block {
    /// Start of the first YAML line, just after the opening `---` line.
    yaml_start: usize,
    /// Start of the closing `---` line.
    yaml_end: usize,
}

/// Returns the note's properties in file order. A note without front matter has none.
pub fn read_properties(content: &str) -> Result<Vec<Property>, VaultError> {
    let Some(block) = find_block(content) else {
        return Ok(Vec::new());
    };
    let yaml = &content[block.yaml_start..block.yaml_end];
    let documents = YamlLoader::load_from_str(yaml)
        .map_err(|error| VaultError::BadFrontMatter(error.to_string()))?;

    let mut properties = Vec::new();
    if let Some(Yaml::Hash(map)) = documents.first() {
        for (key, value) in map {
            if let (Some(key), Some(value)) = (yaml_key(key), to_property_value(value)) {
                properties.push(Property { key, value });
            }
        }
    }
    Ok(properties)
}

/// The note's text after its front matter (all of it when there is none).
pub fn note_body(content: &str) -> &str {
    match find_block(content) {
        None => content,
        Some(block) => {
            let closing_line_end = content[block.yaml_end..]
                .find('\n')
                .map_or(content.len(), |offset| block.yaml_end + offset + 1);
            &content[closing_line_end..]
        }
    }
}

/// The value of one property, if the note has it.
pub fn read_property(content: &str, key: &str) -> Result<Option<PropertyValue>, VaultError> {
    let properties = read_properties(content)?;
    Ok(properties
        .into_iter()
        .find(|property| property.key == key)
        .map(|property| property.value))
}

/// Returns `content` with `key` set to `value`, changing only that key's line.
/// Adds the key at the end of the block, or adds a block when the note has none.
pub fn set_property(content: &str, key: &str, value: &PropertyValue) -> Result<String, VaultError> {
    check_key(key)?;
    let newline = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let line = format!("{key}: {}{newline}", format_value(value, false)?);

    let updated = match find_block(content) {
        None => format!("---{newline}{line}---{newline}{content}"),
        Some(block) => {
            let (start, end) =
                key_lines(content, &block, key).unwrap_or((block.yaml_end, block.yaml_end));
            format!("{}{line}{}", &content[..start], &content[end..])
        }
    };

    // Never hand back YAML that no longer parses, or that lost the value.
    if read_property(&updated, key)?.as_ref() != Some(value) {
        return Err(VaultError::InvalidProperty(key.to_string()));
    }
    Ok(updated)
}

/// Finds the opening `---` on the first line and the next `---` or `...` line.
fn find_block(content: &str) -> Option<Block> {
    let mut lines = line_spans(content);
    let (_, first_end, first) = lines.next()?;
    if first.trim_end() != "---" {
        return None;
    }
    lines
        .find(|(_, _, line)| matches!(line.trim_end(), "---" | "..."))
        .map(|(start, _, _)| Block {
            yaml_start: first_end,
            yaml_end: start,
        })
}

/// Byte range of `key:` and any lines that continue its value (indented or `- ` items).
fn key_lines(content: &str, block: &Block, key: &str) -> Option<(usize, usize)> {
    let yaml = &content[block.yaml_start..block.yaml_end];
    let mut lines = line_spans(yaml).peekable();

    while let Some((start, mut end, line)) = lines.next() {
        if !starts_with_key(line, key) {
            continue;
        }
        while let Some((_, next_end, next)) = lines.peek() {
            if !is_continuation(next) {
                break;
            }
            end = *next_end;
            lines.next();
        }
        return Some((block.yaml_start + start, block.yaml_start + end));
    }
    None
}

fn starts_with_key(line: &str, key: &str) -> bool {
    let Some(rest) = line.strip_prefix(key) else {
        return false;
    };
    let Some(after_colon) = rest.strip_prefix(':') else {
        return false;
    };
    after_colon.is_empty() || after_colon.starts_with([' ', '\t', '\r', '\n'])
}

fn is_continuation(line: &str) -> bool {
    line.starts_with([' ', '\t']) && !line.trim().is_empty() || line.starts_with("- ")
}

/// Each line as (start, end, text), where text keeps its line ending.
fn line_spans(text: &str) -> impl Iterator<Item = (usize, usize, &str)> {
    let mut start = 0;
    text.split_inclusive('\n').map(move |line| {
        let span = (start, start + line.len(), line);
        start += line.len();
        span
    })
}

fn check_key(key: &str) -> Result<(), VaultError> {
    let is_plain = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | ' '))
        && !key.starts_with(['-', ' '])
        && !key.ends_with(' ');
    if is_plain {
        Ok(())
    } else {
        Err(VaultError::InvalidProperty(key.to_string()))
    }
}

fn yaml_key(key: &Yaml) -> Option<String> {
    match key {
        Yaml::String(text) | Yaml::Real(text) => Some(text.clone()),
        Yaml::Integer(number) => Some(number.to_string()),
        Yaml::Boolean(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn to_property_value(value: &Yaml) -> Option<PropertyValue> {
    match value {
        Yaml::String(text) => Some(PropertyValue::Text(text.clone())),
        Yaml::Integer(number) => Some(PropertyValue::Number(*number as f64)),
        Yaml::Real(text) => text.parse().ok().map(PropertyValue::Number),
        Yaml::Boolean(flag) => Some(PropertyValue::Bool(*flag)),
        Yaml::Null => Some(PropertyValue::Null),
        Yaml::Array(items) => Some(PropertyValue::List(
            items.iter().filter_map(to_property_value).collect(),
        )),
        Yaml::Hash(_) | Yaml::Alias(_) | Yaml::BadValue => None,
    }
}

/// Writes a value as YAML. `in_list` adds the extra quoting a `[a, b]` list needs.
fn format_value(value: &PropertyValue, in_list: bool) -> Result<String, VaultError> {
    match value {
        PropertyValue::Text(text) => Ok(format_text(text, in_list)),
        PropertyValue::Bool(flag) => Ok(flag.to_string()),
        PropertyValue::Null => Ok("null".to_string()),
        PropertyValue::Number(number) => format_number(*number),
        PropertyValue::List(items) => {
            let parts: Result<Vec<String>, VaultError> =
                items.iter().map(|item| format_value(item, true)).collect();
            Ok(format!("[{}]", parts?.join(", ")))
        }
    }
}

fn format_number(number: f64) -> Result<String, VaultError> {
    if !number.is_finite() {
        return Err(VaultError::InvalidProperty(number.to_string()));
    }
    // Whole numbers are written without ".0" so `count: 3` stays `count: 3`.
    let is_whole = number.fract() == 0.0 && number.abs() < 1e15;
    Ok(if is_whole {
        format!("{number:.0}")
    } else {
        number.to_string()
    })
}

fn format_text(text: &str, in_list: bool) -> String {
    if needs_quotes(text, in_list) {
        let escaped = text
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n");
        format!("\"{escaped}\"")
    } else {
        text.to_string()
    }
}

/// Plain text that YAML would read as something else (a number, a list, a comment…) needs quotes.
fn needs_quotes(text: &str, in_list: bool) -> bool {
    const SPECIAL_START: &[char] = &[
        '-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%', '@',
        '`',
    ];
    const RESERVED: &[&str] = &["true", "false", "null", "~", "yes", "no", "on", "off"];

    text.is_empty()
        || text.trim() != text
        || text.starts_with(SPECIAL_START)
        || text.contains(": ")
        || text.contains(" #")
        || text.contains('\n')
        || text.ends_with(':')
        || RESERVED.contains(&text.to_lowercase().as_str())
        || text.parse::<f64>().is_ok()
        || (in_list && text.contains([',', '[', ']', '{', '}']))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> PropertyValue {
        PropertyValue::Text(value.to_string())
    }

    #[test]
    fn reads_typed_properties_in_file_order() {
        let note = "---\nstatus: doing\ncount: 3\ndone: false\ntags: [project, web]\n---\nBody\n";
        let keys: Vec<String> = read_properties(note)
            .unwrap()
            .into_iter()
            .map(|p| p.key)
            .collect();
        assert_eq!(keys, ["status", "count", "done", "tags"]);
        assert_eq!(
            read_property(note, "tags").unwrap(),
            Some(PropertyValue::List(vec![text("project"), text("web")]))
        );
        assert_eq!(
            read_property(note, "count").unwrap(),
            Some(PropertyValue::Number(3.0))
        );
    }

    #[test]
    fn note_body_skips_the_front_matter() {
        assert_eq!(note_body("---\na: 1\n---\n# Title\n"), "# Title\n");
        assert_eq!(note_body("# Just text\n"), "# Just text\n");
    }

    #[test]
    fn a_note_without_front_matter_has_no_properties() {
        assert!(read_properties("# Just a title\n---\n").unwrap().is_empty());
    }

    #[test]
    fn changing_a_value_changes_exactly_one_line() {
        let note = "---\n# my comment\nstatus: todo\ntags:   [a, b]\n---\nBody stays.\n";
        let updated = set_property(note, "status", &text("doing")).unwrap();
        assert_eq!(
            updated,
            "---\n# my comment\nstatus: doing\ntags:   [a, b]\n---\nBody stays.\n"
        );
    }

    #[test]
    fn a_block_list_is_replaced_as_a_whole() {
        let note = "---\ntags:\n  - a\n  - b\ntitle: x\n---\n";
        let updated = set_property(note, "tags", &PropertyValue::List(vec![text("c")])).unwrap();
        assert_eq!(updated, "---\ntags: [c]\ntitle: x\n---\n");
    }

    #[test]
    fn a_new_key_goes_at_the_end_of_the_block() {
        let updated =
            set_property("---\na: 1\n---\nBody\n", "b", &PropertyValue::Bool(true)).unwrap();
        assert_eq!(updated, "---\na: 1\nb: true\n---\nBody\n");
    }

    #[test]
    fn a_note_without_a_block_gets_one() {
        let updated = set_property("# Title\n", "status", &text("todo")).unwrap();
        assert_eq!(updated, "---\nstatus: todo\n---\n# Title\n");
    }

    #[test]
    fn keeps_windows_line_endings() {
        let updated = set_property(
            "---\r\na: 1\r\n---\r\nBody\r\n",
            "a",
            &PropertyValue::Number(2.0),
        )
        .unwrap();
        assert_eq!(updated, "---\r\na: 2\r\n---\r\nBody\r\n");
    }

    #[test]
    fn text_that_looks_like_something_else_is_quoted() {
        for (value, expected) in [
            ("42", "\"42\""),
            ("true", "\"true\""),
            ("a: b", "\"a: b\""),
            ("# not a comment", "\"# not a comment\""),
            ("say \"hi\"", "say \"hi\""),
            ("plain words", "plain words"),
            ("ខ្មែរ", "ខ្មែរ"),
        ] {
            assert_eq!(format_text(value, false), expected, "{value}");
            let updated = set_property("", "k", &text(value)).unwrap();
            assert_eq!(read_property(&updated, "k").unwrap(), Some(text(value)));
        }
    }

    #[test]
    fn a_similar_key_is_not_confused_with_the_target() {
        let note = "---\nstatus_old: x\nstatus: y\n---\n";
        let updated = set_property(note, "status", &text("z")).unwrap();
        assert_eq!(updated, "---\nstatus_old: x\nstatus: z\n---\n");
    }

    #[test]
    fn rejects_unsafe_keys() {
        for key in ["", "a:b", "a\nb", "-a", "a#"] {
            assert!(set_property("", key, &text("v")).is_err(), "{key:?}");
        }
    }
}
