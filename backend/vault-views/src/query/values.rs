//! Property values as views see them: their type, their text, and how they compare (L-4).

use std::cmp::Ordering;
use std::collections::HashSet;

use vault_core::PropertyValue;

use crate::PropertyType;

/// A text property with at most this many different values, some repeated, is a select.
const MAX_SELECT_OPTIONS: usize = 10;

/// Works out a property's type from every value it has across the notes.
/// Mixed values fall back to text, which can show anything.
pub fn infer_type<'a>(values: impl IntoIterator<Item = &'a PropertyValue>) -> PropertyType {
    let filled: Vec<&PropertyValue> = values.into_iter().filter(|v| !is_empty(v)).collect();
    if filled.is_empty() {
        return PropertyType::Text;
    }
    if filled.iter().all(|v| matches!(v, PropertyValue::Bool(_))) {
        return PropertyType::Checkbox;
    }
    if filled.iter().all(|v| matches!(v, PropertyValue::Number(_))) {
        return PropertyType::Number;
    }
    if filled.iter().any(|v| matches!(v, PropertyValue::List(_))) {
        let lists_or_text = filled
            .iter()
            .all(|v| matches!(v, PropertyValue::List(_) | PropertyValue::Text(_)));
        return if lists_or_text {
            PropertyType::MultiSelect
        } else {
            PropertyType::Text
        };
    }

    let texts: Vec<String> = filled.iter().map(|v| display_text(v)).collect();
    if texts.iter().all(|text| is_date(text)) {
        return PropertyType::Date;
    }
    if texts.iter().all(|text| is_url(text)) {
        return PropertyType::Url;
    }
    let distinct: HashSet<&String> = texts.iter().collect();
    if distinct.len() <= MAX_SELECT_OPTIONS && distinct.len() < texts.len() {
        return PropertyType::Select;
    }
    PropertyType::Text
}

/// Missing, `null`, blank text and empty lists all count as "no value".
pub fn is_empty(value: &PropertyValue) -> bool {
    match value {
        PropertyValue::Null => true,
        PropertyValue::Text(text) => text.trim().is_empty(),
        PropertyValue::List(items) => items.iter().all(is_empty),
        PropertyValue::Number(_) | PropertyValue::Bool(_) => false,
    }
}

/// The value as the user would read it. Lists are joined with ", ".
pub fn display_text(value: &PropertyValue) -> String {
    match value {
        PropertyValue::Text(text) => text.clone(),
        PropertyValue::Number(number) => format_number(*number),
        PropertyValue::Bool(flag) => flag.to_string(),
        PropertyValue::Null => String::new(),
        PropertyValue::List(items) => items
            .iter()
            .map(display_text)
            .collect::<Vec<_>>()
            .join(", "),
    }
}

/// Each separate value: the items of a list, or the one value. Empty ones are left out.
pub fn value_texts(value: &PropertyValue) -> Vec<String> {
    match value {
        PropertyValue::List(items) => items
            .iter()
            .filter(|item| !is_empty(item))
            .map(display_text)
            .collect(),
        other if is_empty(other) => Vec::new(),
        other => vec![display_text(other)],
    }
}

/// Turns text the user typed into a value of `kind`, for filters and new notes.
pub fn typed_value(kind: PropertyType, text: &str) -> PropertyValue {
    let trimmed = text.trim();
    match kind {
        PropertyType::Checkbox => PropertyValue::Bool(trimmed.eq_ignore_ascii_case("true")),
        PropertyType::Number => trimmed.parse::<f64>().map_or_else(
            |_| PropertyValue::Text(trimmed.to_string()),
            PropertyValue::Number,
        ),
        PropertyType::MultiSelect => PropertyValue::List(
            trimmed
                .split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(|item| PropertyValue::Text(item.to_string()))
                .collect(),
        ),
        PropertyType::Text | PropertyType::Date | PropertyType::Select | PropertyType::Url => {
            PropertyValue::Text(trimmed.to_string())
        }
    }
}

/// Orders two values of `kind`. Numbers compare as numbers, checkboxes false before true,
/// and everything else as text without case (ISO dates sort correctly as text).
pub fn compare(kind: PropertyType, left: &PropertyValue, right: &PropertyValue) -> Ordering {
    if kind == PropertyType::Number
        && let (Some(a), Some(b)) = (as_number(left), as_number(right))
    {
        return a.total_cmp(&b);
    }
    if kind == PropertyType::Checkbox {
        return as_bool(left).cmp(&as_bool(right));
    }
    compare_text(&display_text(left), &display_text(right))
}

pub fn compare_text(left: &str, right: &str) -> Ordering {
    left.to_lowercase().cmp(&right.to_lowercase())
}

pub fn as_number(value: &PropertyValue) -> Option<f64> {
    match value {
        PropertyValue::Number(number) => Some(*number),
        PropertyValue::Text(text) => text.trim().parse().ok(),
        _ => None,
    }
}

/// A missing or non-boolean value counts as unchecked.
pub fn as_bool(value: &PropertyValue) -> bool {
    match value {
        PropertyValue::Bool(flag) => *flag,
        PropertyValue::Text(text) => text.trim().eq_ignore_ascii_case("true"),
        _ => false,
    }
}

/// `YYYY-MM-DD`, optionally followed by a time.
pub fn is_date(text: &str) -> bool {
    let bytes = text.as_bytes();
    let shape_ok = bytes.len() >= 10
        && bytes[..10].iter().enumerate().all(|(index, byte)| {
            if index == 4 || index == 7 {
                *byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        });
    shape_ok && (bytes.len() == 10 || matches!(bytes[10], b'T' | b' '))
}

fn is_url(text: &str) -> bool {
    text.starts_with("https://") || text.starts_with("http://")
}

/// Whole numbers without ".0", like the note's own YAML.
fn format_number(number: f64) -> String {
    let is_whole = number.fract() == 0.0 && number.abs() < 1e15;
    if is_whole {
        format!("{number:.0}")
    } else {
        number.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> PropertyValue {
        PropertyValue::Text(value.to_string())
    }

    #[test]
    fn every_type_is_inferred() {
        let cases = [
            (vec![PropertyValue::Bool(true)], PropertyType::Checkbox),
            (vec![PropertyValue::Number(2.0)], PropertyType::Number),
            (
                vec![text("2026-12-01"), text("2026-01-05")],
                PropertyType::Date,
            ),
            (vec![text("https://example.com")], PropertyType::Url),
            (
                vec![text("todo"), text("doing"), text("todo")],
                PropertyType::Select,
            ),
            (
                vec![PropertyValue::List(vec![text("a")]), text("b")],
                PropertyType::MultiSelect,
            ),
            (
                vec![text("first idea"), text("second idea")],
                PropertyType::Text,
            ),
        ];
        for (values, expected) in cases {
            assert_eq!(infer_type(&values), expected, "{values:?}");
        }
    }

    #[test]
    fn mixed_or_empty_values_are_text() {
        assert_eq!(
            infer_type(&[text("x"), PropertyValue::Number(1.0)]),
            PropertyType::Text
        );
        assert_eq!(
            infer_type(&[PropertyValue::Null, text(" ")]),
            PropertyType::Text
        );
        assert_eq!(
            infer_type(&[PropertyValue::List(vec![]), PropertyValue::Bool(true)]),
            PropertyType::Checkbox
        );
    }

    #[test]
    fn typed_text_becomes_the_right_value() {
        assert_eq!(
            typed_value(PropertyType::Checkbox, "true"),
            PropertyValue::Bool(true)
        );
        assert_eq!(
            typed_value(PropertyType::Number, " 4.5"),
            PropertyValue::Number(4.5)
        );
        assert_eq!(
            typed_value(PropertyType::MultiSelect, "web, plan,"),
            PropertyValue::List(vec![text("web"), text("plan")])
        );
        assert_eq!(
            typed_value(PropertyType::Date, "2026-12-01"),
            text("2026-12-01")
        );
    }

    #[test]
    fn numbers_compare_as_numbers() {
        let ten = PropertyValue::Number(10.0);
        let nine = PropertyValue::Number(9.0);
        assert_eq!(compare(PropertyType::Number, &nine, &ten), Ordering::Less);
        assert_eq!(compare(PropertyType::Text, &nine, &ten), Ordering::Greater);
    }

    #[test]
    fn dates_need_the_full_day() {
        assert!(is_date("2026-12-01"));
        assert!(is_date("2026-12-01T09:30"));
        assert!(!is_date("2026-12"));
        assert!(!is_date("2026-12-01x"));
    }
}
