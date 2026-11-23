//! File names: making outside names safe for the vault, and numbering clashes (IO-3).

/// A name the vault accepts: no slashes, colons or control characters, not `.` or `..`.
pub fn clean_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':') || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return "Untitled".to_string();
    }
    trimmed.to_string()
}

/// `Plan.md`, then `Plan 2.md`, `Plan 3.md` and so on.
pub fn numbered(name: &str, number: u32) -> String {
    if number <= 1 {
        return name.to_string();
    }
    match name.rfind('.') {
        Some(dot) if dot > 0 => format!("{} {number}{}", &name[..dot], &name[dot..]),
        _ => format!("{name} {number}"),
    }
}

/// The name without its extension: `Plan.md` gives `Plan`.
pub fn stem(name: &str) -> &str {
    match name.rfind('.') {
        Some(dot) if dot > 0 => &name[..dot],
        _ => name,
    }
}

pub fn has_extension(name: &str, extension: &str) -> bool {
    let lower = name.to_lowercase();
    lower.len() > extension.len() + 1 && lower.ends_with(&format!(".{extension}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clashes_get_a_number_before_the_extension() {
        assert_eq!(numbered("Plan.md", 1), "Plan.md");
        assert_eq!(numbered("Plan.md", 2), "Plan 2.md");
        assert_eq!(numbered("Projects", 3), "Projects 3");
        assert_eq!(numbered(".hidden", 2), ".hidden 2");
    }

    #[test]
    fn unsafe_names_are_made_safe() {
        assert_eq!(clean_name("a/b:c"), "a-b-c");
        assert_eq!(clean_name(".."), "Untitled");
        assert_eq!(clean_name(" ខ្មែរ "), "ខ្មែរ");
    }
}
