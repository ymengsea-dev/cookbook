//! Which notes a view shows: its source (L-1) and its filters (L-3).

use std::cmp::Ordering;

use vault_core::PropertyValue;

use crate::values::{as_bool, as_number, compare_text, is_date, is_empty, value_texts};
use crate::{Filter, FilterOp, PropertyType, ViewSource};

/// True when the note at `path` with `tags` belongs to `source`.
pub fn in_source(source: &ViewSource, path: &str, tags: &[String]) -> bool {
    match source {
        ViewSource::Vault => true,
        ViewSource::Tag { tag } => tags.iter().any(|own| own.eq_ignore_ascii_case(tag)),
        ViewSource::Folder { folder, recursive } => {
            let Some(rest) = path.strip_prefix(&format!("{folder}/")) else {
                return false;
            };
            *recursive || !rest.contains('/')
        }
    }
}

/// True when `value` (missing is `None`) passes `filter` for a property of `kind`.
pub fn passes(filter: &Filter, kind: PropertyType, value: Option<&PropertyValue>) -> bool {
    let has_value = value.is_some_and(|value| !is_empty(value));
    match filter.op {
        FilterOp::IsEmpty => !has_value,
        FilterOp::IsNotEmpty => has_value,
        FilterOp::Is => equals(kind, value, &filter.value),
        FilterOp::IsNot => !equals(kind, value, &filter.value),
        FilterOp::Contains => contains(value, &filter.value),
        FilterOp::Before => order(kind, value, &filter.value) == Some(Ordering::Less),
        FilterOp::After => order(kind, value, &filter.value) == Some(Ordering::Greater),
    }
}

fn equals(kind: PropertyType, value: Option<&PropertyValue>, wanted: &str) -> bool {
    let wanted = wanted.trim();
    if kind == PropertyType::Checkbox {
        // An unchecked box is usually left out of the YAML, so missing means false.
        return value.is_some_and(as_bool) == wanted.eq_ignore_ascii_case("true");
    }
    let Some(value) = value else {
        return wanted.is_empty();
    };
    if kind == PropertyType::Number
        && let (Some(own), Ok(number)) = (as_number(value), wanted.parse::<f64>())
    {
        return own == number;
    }
    // For a list, matching any one item is enough.
    value_texts(value)
        .iter()
        .any(|text| text.trim().eq_ignore_ascii_case(wanted))
}

fn contains(value: Option<&PropertyValue>, wanted: &str) -> bool {
    let wanted = wanted.trim().to_lowercase();
    let Some(value) = value else {
        return false;
    };
    value_texts(value)
        .iter()
        .any(|text| text.to_lowercase().contains(&wanted))
}

/// How `value` orders against `wanted`. Only numbers and dates have an order here.
fn order(kind: PropertyType, value: Option<&PropertyValue>, wanted: &str) -> Option<Ordering> {
    let value = value?;
    match kind {
        PropertyType::Number => {
            let own = as_number(value)?;
            let wanted = wanted.trim().parse::<f64>().ok()?;
            Some(own.total_cmp(&wanted))
        }
        PropertyType::Date => {
            let own = value_texts(value).into_iter().next()?;
            let wanted = wanted.trim();
            if !is_date(&own) || !is_date(wanted) {
                return None;
            }
            // Compares days only, so "2026-12-01T09:00" is not after "2026-12-01".
            Some(compare_text(&own[..10], &wanted[..10]))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vault_core::VaultPath;

    fn filter(op: FilterOp, value: &str) -> Filter {
        Filter {
            property: "p".to_string(),
            op,
            value: value.to_string(),
        }
    }

    fn text(value: &str) -> PropertyValue {
        PropertyValue::Text(value.to_string())
    }

    fn check(
        op: FilterOp,
        wanted: &str,
        kind: PropertyType,
        value: Option<&PropertyValue>,
    ) -> bool {
        passes(&filter(op, wanted), kind, value)
    }

    #[test]
    fn is_and_is_not() {
        let doing = text("Doing");
        assert!(check(
            FilterOp::Is,
            "doing",
            PropertyType::Select,
            Some(&doing)
        ));
        assert!(!check(
            FilterOp::Is,
            "done",
            PropertyType::Select,
            Some(&doing)
        ));
        assert!(check(
            FilterOp::IsNot,
            "done",
            PropertyType::Select,
            Some(&doing)
        ));
        assert!(check(FilterOp::IsNot, "done", PropertyType::Select, None));
    }

    #[test]
    fn is_reads_the_filter_value_by_type() {
        let three = PropertyValue::Number(3.0);
        assert!(check(
            FilterOp::Is,
            "3.0",
            PropertyType::Number,
            Some(&three)
        ));
        assert!(check(FilterOp::Is, "false", PropertyType::Checkbox, None));
        assert!(check(
            FilterOp::Is,
            "true",
            PropertyType::Checkbox,
            Some(&PropertyValue::Bool(true))
        ));
        let tags = PropertyValue::List(vec![text("web"), text("plan")]);
        assert!(check(
            FilterOp::Is,
            "plan",
            PropertyType::MultiSelect,
            Some(&tags)
        ));
        assert!(check(
            FilterOp::Is,
            "2026-12-01",
            PropertyType::Date,
            Some(&text("2026-12-01"))
        ));
        let url = text("https://example.com");
        assert!(check(
            FilterOp::Is,
            "https://example.com",
            PropertyType::Url,
            Some(&url)
        ));
        assert!(check(
            FilterOp::Is,
            "Plan",
            PropertyType::Text,
            Some(&text("plan"))
        ));
    }

    #[test]
    fn contains_ignores_case_and_looks_in_lists() {
        assert!(check(
            FilterOp::Contains,
            "LAND",
            PropertyType::Text,
            Some(&text("landing page"))
        ));
        let tags = PropertyValue::List(vec![text("website")]);
        assert!(check(
            FilterOp::Contains,
            "site",
            PropertyType::MultiSelect,
            Some(&tags)
        ));
        assert!(!check(FilterOp::Contains, "x", PropertyType::Text, None));
    }

    #[test]
    fn empty_and_not_empty() {
        for empty in [
            None,
            Some(&PropertyValue::Null),
            Some(&text(" ")),
            Some(&PropertyValue::List(vec![])),
        ] {
            assert!(check(FilterOp::IsEmpty, "", PropertyType::Text, empty));
            assert!(!check(FilterOp::IsNotEmpty, "", PropertyType::Text, empty));
        }
        assert!(check(
            FilterOp::IsNotEmpty,
            "",
            PropertyType::Checkbox,
            Some(&PropertyValue::Bool(false))
        ));
    }

    #[test]
    fn before_and_after_for_dates_and_numbers() {
        let due = text("2026-12-01");
        assert!(check(
            FilterOp::Before,
            "2026-12-02",
            PropertyType::Date,
            Some(&due)
        ));
        assert!(check(
            FilterOp::After,
            "2026-11-30",
            PropertyType::Date,
            Some(&due)
        ));
        assert!(!check(
            FilterOp::After,
            "2026-12-01",
            PropertyType::Date,
            Some(&due)
        ));
        assert!(!check(
            FilterOp::Before,
            "soon",
            PropertyType::Date,
            Some(&due)
        ));
        assert!(!check(
            FilterOp::Before,
            "2026-12-02",
            PropertyType::Date,
            None
        ));
        let five = PropertyValue::Number(5.0);
        assert!(check(
            FilterOp::Before,
            "10",
            PropertyType::Number,
            Some(&five)
        ));
        assert!(!check(
            FilterOp::After,
            "10",
            PropertyType::Number,
            Some(&five)
        ));
        assert!(!check(
            FilterOp::Before,
            "b",
            PropertyType::Text,
            Some(&text("a"))
        ));
    }

    #[test]
    fn sources() {
        let folder = |recursive| ViewSource::Folder {
            folder: VaultPath::parse("Projects").unwrap(),
            recursive,
        };
        assert!(in_source(&folder(true), "Projects/Web/Plan.md", &[]));
        assert!(!in_source(&folder(false), "Projects/Web/Plan.md", &[]));
        assert!(in_source(&folder(false), "Projects/Plan.md", &[]));
        assert!(!in_source(&folder(true), "ProjectsOld/Plan.md", &[]));
        let tag = ViewSource::Tag {
            tag: "web".to_string(),
        };
        assert!(in_source(&tag, "Plan.md", &["Web".to_string()]));
        assert!(!in_source(&tag, "Plan.md", &[]));
        assert!(in_source(&ViewSource::Vault, "Plan.md", &[]));
    }
}
