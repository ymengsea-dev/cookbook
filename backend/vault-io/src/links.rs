//! Finding and rewriting the links in a note: Markdown links and images `[text](target)`,
//! and wikilinks `[[Target]]`. Links inside fenced code blocks are left alone.

/// Calls `rewrite` with every Markdown link target. `Some` replaces it. Returns the new
/// text and how many links changed.
pub fn map_link_targets(
    content: &str,
    rewrite: &mut dyn FnMut(&str) -> Option<String>,
) -> (String, usize) {
    map_outside_code(content, &mut |line| rewrite_markdown_links(line, rewrite))
}

/// Calls `rewrite` with every wikilink target, the part before any `|` or `#`.
pub fn map_wikilinks(
    content: &str,
    rewrite: &mut dyn FnMut(&str) -> Option<String>,
) -> (String, usize) {
    map_outside_code(content, &mut |line| rewrite_wikilinks(line, rewrite))
}

fn map_outside_code(
    content: &str,
    edit_line: &mut dyn FnMut(&str) -> (String, usize),
) -> (String, usize) {
    let mut output = String::with_capacity(content.len());
    let mut changed = 0;
    let mut in_code = false;
    for line in content.split_inclusive('\n') {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code = !in_code;
            output.push_str(line);
            continue;
        }
        if in_code {
            output.push_str(line);
            continue;
        }
        let (edited, count) = edit_line(line);
        output.push_str(&edited);
        changed += count;
    }
    (output, changed)
}

fn rewrite_markdown_links(
    line: &str,
    rewrite: &mut dyn FnMut(&str) -> Option<String>,
) -> (String, usize) {
    let mut output = String::with_capacity(line.len());
    let mut rest = line;
    let mut changed = 0;
    while let Some(index) = rest.find("](") {
        output.push_str(&rest[..index + 2]);
        rest = &rest[index + 2..];
        let (target, after, in_angles) = split_target(rest);
        match rewrite(target) {
            Some(new_target) if in_angles => {
                output.push('<');
                output.push_str(&new_target);
                output.push('>');
                changed += 1;
            }
            Some(new_target) => {
                output.push_str(&new_target);
                changed += 1;
            }
            None => output.push_str(&rest[..rest.len() - after.len()]),
        }
        rest = after;
    }
    output.push_str(rest);
    (output, changed)
}

/// Splits `target)` or `<target with spaces>)` from what follows it.
fn split_target(text: &str) -> (&str, &str, bool) {
    if let Some(inside) = text.strip_prefix('<')
        && let Some(close) = inside.find('>')
    {
        return (&inside[..close], &inside[close + 1..], true);
    }
    let end = text.find([')', ' ', '\n']).unwrap_or(text.len());
    (&text[..end], &text[end..], false)
}

fn rewrite_wikilinks(
    line: &str,
    rewrite: &mut dyn FnMut(&str) -> Option<String>,
) -> (String, usize) {
    let mut output = String::with_capacity(line.len());
    let mut rest = line;
    let mut changed = 0;
    while let Some(open) = rest.find("[[") {
        output.push_str(&rest[..open + 2]);
        rest = &rest[open + 2..];
        let Some(close) = rest.find("]]") else {
            break;
        };
        let inside = &rest[..close];
        let target_end = inside.find(['|', '#']).unwrap_or(inside.len());
        match rewrite(inside[..target_end].trim()) {
            Some(new_target) => {
                output.push_str(&new_target);
                output.push_str(&inside[target_end..]);
                changed += 1;
            }
            None => output.push_str(inside),
        }
        rest = &rest[close..];
    }
    output.push_str(rest);
    (output, changed)
}

/// True for a target that points at a local file, not a web page, an e-mail or an anchor.
pub fn is_local_target(target: &str) -> bool {
    let has_scheme = target
        .split_once(':')
        .is_some_and(|(scheme, _)| !scheme.is_empty() && !scheme.contains('/'));
    !target.is_empty() && !target.starts_with('#') && !has_scheme
}

/// Splits `file.md#heading` into the path and the `#heading` part.
pub fn split_anchor(target: &str) -> (&str, &str) {
    match target.find('#') {
        Some(index) => (&target[..index], &target[index..]),
        None => (target, ""),
    }
}

/// Decodes `%20` and other `%XX` escapes. Text that doesn't decode to UTF-8 is returned as is.
pub fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let hex = bytes
            .get(index + 1..index + 3)
            .and_then(|pair| std::str::from_utf8(pair).ok());
        match (
            bytes[index],
            hex.and_then(|pair| u8::from_str_radix(pair, 16).ok()),
        ) {
            (b'%', Some(byte)) => {
                decoded.push(byte);
                index += 3;
            }
            (byte, _) => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded).unwrap_or_else(|_| text.to_string())
}

/// Encodes the characters that would end a Markdown link target early.
pub fn encode_target(path: &str) -> String {
    path.replace('%', "%25")
        .replace(' ', "%20")
        .replace('(', "%28")
        .replace(')', "%29")
}

/// Resolves `link` against `folder` (both `/`-separated). None if it climbs out of the root.
pub fn resolve(folder: &str, link: &str) -> Option<String> {
    let mut parts: Vec<&str> = folder.split('/').filter(|part| !part.is_empty()).collect();
    if link.starts_with('/') {
        parts.clear();
    }
    for part in link.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            name => parts.push(name),
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

/// The relative link from a note in `from_folder` to the file at `to`.
pub fn relative_link(from_folder: &str, to: &str) -> String {
    let from: Vec<&str> = from_folder
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    let target: Vec<&str> = to.split('/').collect();
    let shared = from.iter().zip(&target).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<&str> = vec![".."; from.len() - shared];
    parts.extend(&target[shared..]);
    parts.join("/")
}

/// The folder part of a `/`-separated path: `a/b/c.md` gives `a/b`.
pub fn folder_of(path: &str) -> &str {
    path.rfind('/').map_or("", |slash| &path[..slash])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_links_are_found_outside_code_only() {
        let note = "See [plan](Plan.md) and ![](img/a%20b.png).\n```\n[not](Code.md)\n```\n";
        let mut seen = Vec::new();
        let (text, changed) = map_link_targets(note, &mut |target| {
            seen.push(target.to_string());
            Some(format!("new/{target}"))
        });
        assert_eq!(seen, ["Plan.md", "img/a%20b.png"]);
        assert_eq!(changed, 2);
        assert!(text.contains("[plan](new/Plan.md)"));
        assert!(text.contains("[not](Code.md)"));
    }

    #[test]
    fn titles_and_angle_brackets_survive() {
        let (text, _) =
            map_link_targets("[a](<My Note.md> \"Title\") [b](x.md \"t\")", &mut |_| {
                Some("Z.md".to_string())
            });
        assert_eq!(text, "[a](<Z.md> \"Title\") [b](Z.md \"t\")");
    }

    #[test]
    fn wikilinks_keep_their_alias_and_heading() {
        let (text, changed) = map_wikilinks(
            "[[Old|shown]] and [[Old#Part]] and [[Other]]",
            &mut |target| (target == "Old").then(|| "New".to_string()),
        );
        assert_eq!(text, "[[New|shown]] and [[New#Part]] and [[Other]]");
        assert_eq!(changed, 2);
    }

    #[test]
    fn paths_resolve_and_relink() {
        assert_eq!(resolve("a/b", "../c.md").as_deref(), Some("a/c.md"));
        assert_eq!(resolve("a", "/top.md").as_deref(), Some("top.md"));
        assert_eq!(resolve("", "../escape.md"), None);
        assert_eq!(relative_link("a/b", "a/c/d.png"), "../c/d.png");
        assert_eq!(relative_link("", "x/y.md"), "x/y.md");
        assert_eq!(percent_decode("a%20b%E6%97%A5"), "a b日");
        assert!(!is_local_target("https://example.com"));
        assert!(is_local_target("docs/a.md"));
    }
}
