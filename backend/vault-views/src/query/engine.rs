//! Runs a view over the indexed notes: source, then filters, then sort, then groups (L-1 to L-4).

use std::borrow::Cow;
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::Serialize;
use ts_rs::TS;
use vault_core::{ContentHash, PropertyValue};
use vault_index::IndexedNote;

use crate::board::board_columns;
use crate::query::filter::{in_source, passes};
use crate::query::values::{compare, compare_text, infer_type, is_empty, value_texts};
use crate::{
    BoardColumn, NO_VALUE, PropertyType, SortDirection, SortRule, ViewDefinition, ViewKind,
};

/// Option lists longer than this are cut, so a text property can't flood the editor.
const MAX_OPTIONS: usize = 100;

/// One note in a view.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ViewRow {
    pub key: String,
    pub path: String,
    pub title: String,
    /// Hash at the last index sync. Edits pass it back so a newer file is never overwritten.
    pub hash: ContentHash,
    pub properties: BTreeMap<String, PropertyValue>,
}

/// A property found in the view's notes, with its type and known values (for select editors).
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct PropertyInfo {
    pub name: String,
    pub kind: PropertyType,
    /// True when the user chose the type rather than the app.
    pub chosen: bool,
    pub values: Vec<String>,
}

/// List rows under one group value. Without grouping there is one group with no value.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct RowGroup {
    /// The group's value, or `NO_VALUE` (empty) for notes without one.
    pub value: String,
    pub rows: Vec<ViewRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
pub enum ViewContent {
    List { groups: Vec<RowGroup> },
    Board { columns: Vec<BoardColumn> },
}

/// Everything the UI needs to draw a view.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ViewData {
    pub definition: ViewDefinition,
    pub properties: Vec<PropertyInfo>,
    /// Notes shown after filtering.
    pub total: u32,
    pub content: ViewContent,
}

pub fn run_view(definition: &ViewDefinition, notes: &[IndexedNote]) -> ViewData {
    let in_source: Vec<ViewRow> = notes
        .iter()
        .filter(|note| in_source(&definition.source, &note.path, &note.tags))
        .map(to_row)
        .collect();
    let properties = property_infos(&in_source, &definition.property_types);
    let types: HashMap<&str, PropertyType> = properties
        .iter()
        .map(|info| (info.name.as_str(), info.kind))
        .collect();
    let type_of = |name: &str| types.get(name).copied().unwrap_or(PropertyType::Text);

    let mut rows: Vec<ViewRow> = in_source
        .into_iter()
        .filter(|row| {
            definition.filter.iter().all(|filter| {
                let value = value_of(row, &filter.property);
                passes(filter, type_of(&filter.property), value.as_deref())
            })
        })
        .collect();
    sort_rows(&mut rows, &definition.sort, &type_of);

    let total = u32::try_from(rows.len()).unwrap_or(u32::MAX);
    let content = match definition.kind {
        ViewKind::List => ViewContent::List {
            groups: group_rows(rows, definition.group_by.as_deref(), &type_of),
        },
        ViewKind::Board => {
            let group_by = definition.board.group_by.as_deref();
            let kind = group_by.map_or(PropertyType::Text, type_of);
            ViewContent::Board {
                columns: board_columns(rows, &definition.board, kind),
            }
        }
    };
    ViewData {
        definition: definition.clone(),
        properties,
        total,
        content,
    }
}

/// The value of `name` on `row`. `title` falls back to the note's title.
pub fn value_of<'a>(row: &'a ViewRow, name: &str) -> Option<Cow<'a, PropertyValue>> {
    match row.properties.get(name) {
        Some(value) => Some(Cow::Borrowed(value)),
        None if name == "title" => Some(Cow::Owned(PropertyValue::Text(row.title.clone()))),
        None => None,
    }
}

fn to_row(note: &IndexedNote) -> ViewRow {
    ViewRow {
        key: note.key.clone(),
        path: note.path.clone(),
        title: note.title.clone(),
        hash: note.hash.clone(),
        properties: note
            .properties
            .iter()
            .map(|property| (property.key.clone(), property.value.clone()))
            .collect(),
    }
}

/// Every property in `rows`, sorted by name, typed by the user's choice or by inference.
fn property_infos(rows: &[ViewRow], chosen: &BTreeMap<String, PropertyType>) -> Vec<PropertyInfo> {
    let mut by_name: BTreeMap<&str, Vec<&PropertyValue>> = BTreeMap::new();
    for row in rows {
        for (name, value) in &row.properties {
            by_name.entry(name).or_default().push(value);
        }
    }
    by_name
        .into_iter()
        .map(|(name, values)| {
            let options: BTreeSet<String> = values.iter().flat_map(|v| value_texts(v)).collect();
            let chosen_type = chosen.get(name).copied();
            PropertyInfo {
                name: name.to_string(),
                kind: chosen_type.unwrap_or_else(|| infer_type(values.iter().copied())),
                chosen: chosen_type.is_some(),
                values: options.into_iter().take(MAX_OPTIONS).collect(),
            }
        })
        .collect()
}

fn sort_rows(rows: &mut [ViewRow], rules: &[SortRule], type_of: &dyn Fn(&str) -> PropertyType) {
    rows.sort_by(|left, right| {
        for rule in rules {
            let order = compare_by_rule(left, right, rule, type_of(&rule.property));
            if order != Ordering::Equal {
                return order;
            }
        }
        compare_text(&left.title, &right.title).then_with(|| left.path.cmp(&right.path))
    });
}

/// Notes without a value go last in both directions, so they never crowd the top.
fn compare_by_rule(
    left: &ViewRow,
    right: &ViewRow,
    rule: &SortRule,
    kind: PropertyType,
) -> Ordering {
    let left = value_of(left, &rule.property).filter(|value| !is_empty(value));
    let right = value_of(right, &rule.property).filter(|value| !is_empty(value));
    match (left, right) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(left), Some(right)) => {
            let order = compare(kind, &left, &right);
            match rule.dir {
                SortDirection::Asc => order,
                SortDirection::Desc => order.reverse(),
            }
        }
    }
}

/// Groups sorted rows by `group_by`. A note with several values appears in each group.
fn group_rows(
    rows: Vec<ViewRow>,
    group_by: Option<&str>,
    type_of: &dyn Fn(&str) -> PropertyType,
) -> Vec<RowGroup> {
    let Some(property) = group_by else {
        return vec![RowGroup {
            value: NO_VALUE.to_string(),
            rows,
        }];
    };
    let mut groups: BTreeMap<String, Vec<ViewRow>> = BTreeMap::new();
    for row in rows {
        let mut values = value_of(&row, property)
            .map(|value| value_texts(&value))
            .unwrap_or_default();
        if values.is_empty() {
            values.push(NO_VALUE.to_string());
        }
        for value in values {
            groups.entry(value).or_default().push(row.clone());
        }
    }

    let kind = type_of(property);
    let mut groups: Vec<RowGroup> = groups
        .into_iter()
        .map(|(value, rows)| RowGroup { value, rows })
        .collect();
    groups.sort_by(
        |left, right| match (left.value.is_empty(), right.value.is_empty()) {
            (true, false) => Ordering::Greater,
            (false, true) => Ordering::Less,
            _ => compare(
                kind,
                &PropertyValue::Text(left.value.clone()),
                &PropertyValue::Text(right.value.clone()),
            ),
        },
    );
    groups
}
