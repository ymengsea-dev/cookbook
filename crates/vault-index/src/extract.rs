//! What the index stores about one note (X-1), read from its text.

use vault_core::{KEY_PROPERTY, Property, PropertyValue, VaultPath, note_body, read_properties};

#[derive(Debug, Clone, PartialEq)]
pub struct NoteRecord {
    /// The note's `key`, or `None` before the vault is adopted.
    pub key: Option<String>,
    pub title: String,
    pub headings: Vec<String>,
    pub tags: Vec<String>,
    pub properties: Vec<Property>,
    /// The text after the front matter.
    pub body: String,
}

pub fn extract(path: &VaultPath, content: &str) -> NoteRecord {
    // Broken YAML still gets indexed, just without properties.
    let properties = read_properties(content).unwrap_or_default();
    let body = note_body(content);
    let headings = headings(body);
    let title = first_level_one(body).unwrap_or_else(|| file_title(path));

    let mut tags = front_matter_tags(&properties);
    for tag in inline_tags(body) {
        if !tags.contains(&tag) {
            tags.push(tag);
        }
    }

    NoteRecord {
        key: text_property(&properties, KEY_PROPERTY),
        title,
        headings,
        tags,
        properties,
        body: body.to_string(),
    }
}

/// Lines that start with 1 to 6 `#` and a space, outside code blocks.
fn headings(body: &str) -> Vec<String> {
    prose_lines(body)
        .filter_map(|line| {
            let level = line.chars().take_while(|c| *c == '#').count();
            let is_heading = (1..=6).contains(&level) && line[level..].starts_with(' ');
            is_heading.then(|| line[level..].trim().to_string())
        })
        .collect()
}

fn first_level_one(body: &str) -> Option<String> {
    prose_lines(body)
        .find_map(|line| line.strip_prefix("# "))
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
}

/// `#tag` words in the text, outside code blocks. `#` must follow a space or start the line.
fn inline_tags(body: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for line in prose_lines(body) {
        let mut previous = ' ';
        for (index, character) in line.char_indices() {
            if character == '#' && previous.is_whitespace() {
                let tag: String = line[index + 1..]
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '/'))
                    .collect();
                // A heading's `# ` gives an empty tag, and `#123` is not a tag.
                let starts_with_letter = tag.chars().next().is_some_and(char::is_alphabetic);
                if starts_with_letter && !tags.contains(&tag) {
                    tags.push(tag);
                }
            }
            previous = character;
        }
    }
    tags
}

/// Lines outside fenced code blocks.
fn prose_lines(body: &str) -> impl Iterator<Item = &str> {
    let mut in_code = false;
    body.lines().filter(move |line| {
        let is_fence = line.trim_start().starts_with("```") || line.trim_start().starts_with("~~~");
        if is_fence {
            in_code = !in_code;
            return false;
        }
        !in_code
    })
}

/// `tags: [a, b]`, a block list, or `tags: a, b` all count.
fn front_matter_tags(properties: &[Property]) -> Vec<String> {
    let Some(tags) = properties.iter().find(|property| property.key == "tags") else {
        return Vec::new();
    };
    let texts = match &tags.value {
        PropertyValue::List(items) => items
            .iter()
            .filter_map(|item| match item {
                PropertyValue::Text(text) => Some(text.clone()),
                _ => None,
            })
            .collect(),
        PropertyValue::Text(text) => text.split([',', ' ']).map(str::to_string).collect(),
        _ => Vec::new(),
    };
    texts
        .into_iter()
        .map(|tag| tag.trim().trim_start_matches('#').to_string())
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn text_property(properties: &[Property], key: &str) -> Option<String> {
    properties
        .iter()
        .find_map(|property| match &property.value {
            PropertyValue::Text(text) if property.key == key && !text.trim().is_empty() => {
                Some(text.trim().to_string())
            }
            _ => None,
        })
}

fn file_title(path: &VaultPath) -> String {
    let name = path.file_name();
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(content: &str) -> NoteRecord {
        extract(&VaultPath::parse("Projects/Plan.md").unwrap(), content)
    }

    #[test]
    fn reads_key_title_headings_tags_and_body() {
        let note = "---\nkey: 01J\ntags: [web, project]\n---\n# Website plan\n\nText #draft here.\n\n## Tasks\n";
        let record = record(note);
        assert_eq!(record.key.as_deref(), Some("01J"));
        assert_eq!(record.title, "Website plan");
        assert_eq!(record.headings, ["Website plan", "Tasks"]);
        assert_eq!(record.tags, ["web", "project", "draft"]);
        assert!(record.body.starts_with("# Website plan"));
    }

    #[test]
    fn falls_back_to_the_file_name_and_ignores_code() {
        let record = record("Intro\n```\n# not a heading #not-a-tag\n```\n");
        assert_eq!(record.title, "Plan");
        assert!(record.headings.is_empty());
        assert!(record.tags.is_empty());
        assert_eq!(record.key, None);
    }

    #[test]
    fn numbers_and_heading_marks_are_not_tags() {
        assert!(record("Issue #42 and # heading\n").tags.is_empty());
    }
}
