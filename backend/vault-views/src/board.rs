//! Board columns and card order (B-2, B-5, B-7), and the value a moved card gets (B-4).

use std::collections::HashMap;

use serde::Serialize;
use ts_rs::TS;
use vault_core::PropertyValue;

use crate::engine::{ViewRow, value_of};
use crate::values::{compare_text, typed_value, value_texts};
use crate::{BoardSettings, NO_VALUE, PropertyType};

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct BoardColumn {
    /// The property value this column stands for. `NO_VALUE` (empty) is "No value".
    pub value: String,
    pub hidden: bool,
    pub cards: Vec<ViewRow>,
}

/// Splits sorted rows into columns: saved columns first, then values not saved yet,
/// then "No value". Empty saved columns stay, so a new column can be filled by dragging.
pub fn board_columns(
    rows: Vec<ViewRow>,
    settings: &BoardSettings,
    kind: PropertyType,
) -> Vec<BoardColumn> {
    let Some(property) = settings.group_by.as_deref() else {
        return Vec::new();
    };
    let mut names: Vec<String> = settings
        .columns
        .iter()
        .filter(|name| name.as_str() != NO_VALUE)
        .cloned()
        .collect();

    let mut cards: HashMap<String, Vec<ViewRow>> = HashMap::new();
    let mut unsaved: Vec<String> = Vec::new();
    for row in rows {
        let column = card_column(&row, property);
        if column != NO_VALUE && !names.contains(&column) && !unsaved.contains(&column) {
            unsaved.push(column.clone());
        }
        cards.entry(column).or_default().push(row);
    }
    unsaved.sort_by(|left, right| sort_unsaved(kind, left, right));
    names.extend(unsaved);
    names.push(NO_VALUE.to_string());

    names
        .into_iter()
        .map(|value| {
            let column_cards = cards.remove(&value).unwrap_or_default();
            BoardColumn {
                hidden: settings.hidden.contains(&value),
                cards: apply_card_order(column_cards, settings.card_order.get(&value)),
                value,
            }
        })
        .collect()
}

/// The column a card sits in: its value, or the first item of a list.
pub fn card_column(row: &ViewRow, property: &str) -> String {
    value_of(row, property)
        .and_then(|value| value_texts(&value).into_iter().next())
        .unwrap_or_else(|| NO_VALUE.to_string())
}

/// The value written when a card moves to `column`. In a list only the first item
/// changes, so the card's other values are kept.
pub fn column_value(
    kind: PropertyType,
    column: &str,
    current: Option<&PropertyValue>,
) -> PropertyValue {
    if let Some(PropertyValue::List(items)) = current {
        let mut items: Vec<PropertyValue> = items.iter().skip(1).cloned().collect();
        if column != NO_VALUE {
            items.insert(0, PropertyValue::Text(column.to_string()));
        }
        return PropertyValue::List(items);
    }
    if column == NO_VALUE {
        return PropertyValue::Null;
    }
    match kind {
        // A one-item column of a multi-select property still writes a list.
        PropertyType::MultiSelect => {
            PropertyValue::List(vec![PropertyValue::Text(column.to_string())])
        }
        other => typed_value(other, column),
    }
}

/// Renames a column in the board settings, keeping its place, hidden state and card order.
pub fn rename_column(settings: &mut BoardSettings, from: &str, to: &str) {
    for name in settings
        .columns
        .iter_mut()
        .chain(settings.hidden.iter_mut())
    {
        if name == from {
            *name = to.to_string();
        }
    }
    if let Some(order) = settings.card_order.remove(from) {
        settings.card_order.insert(to.to_string(), order);
    }
}

/// Cards listed in `order` come first, in that order. Keys no longer present are
/// skipped, and cards not listed yet keep their sorted place at the bottom (B-7).
fn apply_card_order(cards: Vec<ViewRow>, order: Option<&Vec<String>>) -> Vec<ViewRow> {
    let Some(order) = order else {
        return cards;
    };
    let mut by_key: HashMap<String, ViewRow> = HashMap::new();
    let mut unlisted = Vec::new();
    for card in cards {
        if order.contains(&card.key) {
            by_key.insert(card.key.clone(), card);
        } else {
            unlisted.push(card);
        }
    }
    let mut ordered: Vec<ViewRow> = order.iter().filter_map(|key| by_key.remove(key)).collect();
    ordered.extend(unlisted);
    ordered
}

fn sort_unsaved(kind: PropertyType, left: &str, right: &str) -> std::cmp::Ordering {
    let as_value = |text: &str| PropertyValue::Text(text.to_string());
    match kind {
        PropertyType::Number | PropertyType::Checkbox => {
            crate::values::compare(kind, &as_value(left), &as_value(right))
        }
        _ => compare_text(left, right),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    fn text(value: &str) -> PropertyValue {
        PropertyValue::Text(value.to_string())
    }

    fn row(key: &str, status: Option<PropertyValue>) -> ViewRow {
        let mut properties = BTreeMap::new();
        if let Some(status) = status {
            properties.insert("status".to_string(), status);
        }
        ViewRow {
            key: key.to_string(),
            path: format!("{key}.md"),
            title: key.to_string(),
            hash: vault_core::ContentHash::of(b""),
            properties,
        }
    }

    fn settings(columns: &[&str]) -> BoardSettings {
        BoardSettings {
            group_by: Some("status".to_string()),
            columns: columns.iter().map(ToString::to_string).collect(),
            ..BoardSettings::default()
        }
    }

    fn layout(columns: &[BoardColumn]) -> Vec<(String, Vec<String>)> {
        columns
            .iter()
            .map(|column| {
                let keys = column.cards.iter().map(|card| card.key.clone()).collect();
                (column.value.clone(), keys)
            })
            .collect()
    }

    fn pair(value: &str, keys: &[&str]) -> (String, Vec<String>) {
        (
            value.to_string(),
            keys.iter().map(ToString::to_string).collect(),
        )
    }

    #[test]
    fn every_note_lands_in_its_column() {
        let rows = vec![
            row("a", Some(text("doing"))),
            row("b", Some(text("todo"))),
            row("c", None),
            row("d", Some(text("blocked"))),
            row(
                "e",
                Some(PropertyValue::List(vec![text("done"), text("old")])),
            ),
        ];
        let columns = board_columns(
            rows,
            &settings(&["todo", "doing", "done"]),
            PropertyType::Select,
        );
        assert_eq!(
            layout(&columns),
            [
                pair("todo", &["b"]),
                pair("doing", &["a"]),
                pair("done", &["e"]),
                pair("blocked", &["d"]),
                pair("", &["c"]),
            ]
        );
    }

    #[test]
    fn saved_card_order_wins_and_new_cards_go_last() {
        let rows = vec![
            row("a", Some(text("todo"))),
            row("b", Some(text("todo"))),
            row("c", Some(text("todo"))),
        ];
        let mut board = settings(&["todo"]);
        board.card_order.insert(
            "todo".to_string(),
            vec!["c".to_string(), "gone".to_string(), "a".to_string()],
        );
        let columns = board_columns(rows, &board, PropertyType::Select);
        assert_eq!(layout(&columns)[0], pair("todo", &["c", "a", "b"]));
    }

    #[test]
    fn hidden_columns_are_marked() {
        let mut board = settings(&["todo"]);
        board.hidden.push(NO_VALUE.to_string());
        let columns = board_columns(vec![], &board, PropertyType::Select);
        assert_eq!(
            columns.iter().map(|c| c.hidden).collect::<Vec<_>>(),
            [false, true]
        );
    }

    #[test]
    fn no_group_property_means_no_columns() {
        let board = BoardSettings::default();
        assert!(board_columns(vec![row("a", None)], &board, PropertyType::Text).is_empty());
    }

    #[test]
    fn a_moved_card_gets_a_value_of_the_right_type() {
        assert_eq!(
            column_value(PropertyType::Select, "done", Some(&text("todo"))),
            text("done")
        );
        assert_eq!(
            column_value(PropertyType::Select, NO_VALUE, Some(&text("todo"))),
            PropertyValue::Null
        );
        assert_eq!(
            column_value(PropertyType::Checkbox, "true", None),
            PropertyValue::Bool(true)
        );
        assert_eq!(
            column_value(PropertyType::Number, "2", None),
            PropertyValue::Number(2.0)
        );
        let list = PropertyValue::List(vec![text("todo"), text("web")]);
        assert_eq!(
            column_value(PropertyType::MultiSelect, "done", Some(&list)),
            PropertyValue::List(vec![text("done"), text("web")])
        );
    }

    #[test]
    fn renaming_keeps_place_and_order() {
        let mut board = settings(&["todo", "doing"]);
        board.hidden.push("doing".to_string());
        board
            .card_order
            .insert("doing".to_string(), vec!["a".to_string()]);
        rename_column(&mut board, "doing", "active");
        assert_eq!(board.columns, ["todo", "active"]);
        assert_eq!(board.hidden, ["active"]);
        assert_eq!(board.card_order.get("active"), Some(&vec!["a".to_string()]));
    }
}
