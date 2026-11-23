//! Changes made from a view: a new note (L-6, B-6), a moved card (B-4, B-5) and a
//! renamed column (B-6). Note writes go through `vault-core` and check the file's hash.

use vault_core::{ContentHash, NoteFile, Property, PropertyValue, Vault, VaultPath};
use vault_index::NoteIndex;

use crate::board::{card_column, column_value, rename_column};
use crate::engine::{ViewData, ViewRow, run_view};
use crate::store::{load_view, save_view};
use crate::values::typed_value;
use crate::{FilterOp, NO_VALUE, PropertyType, ViewContent, ViewError, ViewSource};

/// Loads and runs the view `id` against the index.
pub fn open_view(vault: &Vault, index: &NoteIndex, id: &str) -> Result<ViewData, ViewError> {
    let definition = load_view(vault, id)?;
    Ok(run_view(&definition, &index.notes()?))
}

/// Creates a note in the view's folder with the view's filter values filled in, so it
/// shows up in the view. On a board, `column` is the column it was added to.
pub fn new_note_in_view(
    vault: &Vault,
    index: &NoteIndex,
    id: &str,
    column: Option<&str>,
) -> Result<NoteFile, ViewError> {
    let data = open_view(vault, index, id)?;
    let definition = &data.definition;
    let mut properties: Vec<Property> = Vec::new();

    if let ViewSource::Tag { tag } = &definition.source {
        let tags = PropertyValue::List(vec![PropertyValue::Text(tag.clone())]);
        set_or_replace(&mut properties, "tags", tags);
    }
    for filter in &definition.filter {
        let usable = filter.op == FilterOp::Is
            && filter.property != "title"
            && !filter.value.trim().is_empty();
        if usable {
            let kind = property_type(&data, &filter.property);
            set_or_replace(
                &mut properties,
                &filter.property,
                typed_value(kind, &filter.value),
            );
        }
    }
    if let (Some(column), Some(group_by)) = (column, definition.board.group_by.as_deref())
        && column != NO_VALUE
    {
        let value = column_value(property_type(&data, group_by), column, None);
        set_or_replace(&mut properties, group_by, value);
    }

    let folder = match &definition.source {
        ViewSource::Folder { folder, .. } => Some(folder),
        ViewSource::Vault | ViewSource::Tag { .. } => None,
    };
    Ok(vault.create_note_with(folder, &properties)?)
}

/// Moves the card at `path` to `to_column` and saves `order` as that column's card order.
/// Writes the note only when its column changes, and then only the grouping line.
pub fn move_card(
    vault: &Vault,
    index: &NoteIndex,
    id: &str,
    path: &VaultPath,
    expected: &ContentHash,
    to_column: &str,
    order: Vec<String>,
) -> Result<Option<NoteFile>, ViewError> {
    let data = open_view(vault, index, id)?;
    let mut definition = data.definition.clone();
    let group_by = group_property(&definition.board.group_by, id)?;
    let card = board_cards(&data)
        .find(|card| card.path == path.as_str())
        .ok_or_else(|| ViewError::NotFound(path.to_string()))?;

    let mut written = None;
    if card_column(card, &group_by) != to_column {
        let value = column_value(
            property_type(&data, &group_by),
            to_column,
            card.properties.get(&group_by),
        );
        written = Some(vault.set_note_property(path, &group_by, &value, expected)?);
    }
    if definition.board.card_order.get(to_column) != Some(&order) {
        definition
            .board
            .card_order
            .insert(to_column.to_string(), order);
        save_view(vault, &definition)?;
    }
    Ok(written)
}

/// Renames a board column by writing the new value into every card in it.
/// Returns how many notes changed. Stops at the first note that changed on disk.
pub fn rename_board_column(
    vault: &Vault,
    index: &NoteIndex,
    id: &str,
    from: &str,
    to: &str,
) -> Result<u32, ViewError> {
    let to = to.trim();
    if to.is_empty() || from == NO_VALUE {
        return Err(ViewError::InvalidName(to.to_string()));
    }
    let data = open_view(vault, index, id)?;
    let mut definition = data.definition.clone();
    let group_by = group_property(&definition.board.group_by, id)?;
    let kind = property_type(&data, &group_by);

    let mut renamed = 0;
    for card in board_cards(&data).filter(|card| card_column(card, &group_by) == from) {
        let path = VaultPath::parse(&card.path)?;
        let value = column_value(kind, to, card.properties.get(&group_by));
        vault.set_note_property(&path, &group_by, &value, &card.hash)?;
        renamed += 1;
    }
    rename_column(&mut definition.board, from, to);
    save_view(vault, &definition)?;
    Ok(renamed)
}

fn board_cards(data: &ViewData) -> impl Iterator<Item = &ViewRow> {
    let columns = match &data.content {
        ViewContent::Board { columns } => columns.as_slice(),
        ViewContent::List { .. } => &[],
    };
    columns.iter().flat_map(|column| column.cards.iter())
}

fn group_property(group_by: &Option<String>, id: &str) -> Result<String, ViewError> {
    group_by.clone().ok_or_else(|| {
        ViewError::Broken(
            id.to_string(),
            "the board has no column property".to_string(),
        )
    })
}

fn property_type(data: &ViewData, name: &str) -> PropertyType {
    data.properties
        .iter()
        .find(|info| info.name == name)
        .map_or(PropertyType::Text, |info| info.kind)
}

fn set_or_replace(properties: &mut Vec<Property>, key: &str, value: PropertyValue) {
    properties.retain(|property| property.key != key);
    properties.push(Property {
        key: key.to_string(),
        value,
    });
}
