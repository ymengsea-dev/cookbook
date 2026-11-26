//! What a view file in `.vault/views/` holds (L-8). See the example in `docs/Architecture.md`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use vault_core::VaultPath;

/// One saved view. Optional settings are always written (as `null` or empty), so a
/// cleared setting really clears when the file is merged on save.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ViewDefinition {
    /// The file name without `.json`. The file name wins if the two differ.
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: ViewKind,
    pub source: ViewSource,
    /// Every filter must match (AND).
    #[serde(default)]
    pub filter: Vec<Filter>,
    /// Earlier rules win; ties fall back to the title.
    #[serde(default)]
    pub sort: Vec<SortRule>,
    /// The list view's grouping property.
    #[serde(default)]
    pub group_by: Option<String>,
    /// The list view's columns after the title, in order.
    #[serde(default)]
    pub columns: Vec<Column>,
    /// Types the user chose, which win over inferred ones (L-4).
    #[serde(default)]
    pub property_types: BTreeMap<String, PropertyType>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub board: BoardSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ViewKind {
    List,
    Board,
}

/// Which notes a view starts from (L-1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ViewSource {
    Vault,
    Folder {
        folder: VaultPath,
        /// Include notes in subfolders.
        #[serde(default = "include_subfolders")]
        recursive: bool,
    },
    Tag {
        tag: String,
    },
}

fn include_subfolders() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Filter {
    pub property: String,
    pub op: FilterOp,
    /// Typed as text, as the user entered it. Read by the property's type when compared.
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum FilterOp {
    Is,
    IsNot,
    Contains,
    IsEmpty,
    IsNotEmpty,
    Before,
    After,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SortRule {
    pub property: String,
    pub dir: SortDirection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SortDirection {
    Asc,
    Desc,
}

/// A list column. `width` is in pixels; `None` means the default width (L-2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Column {
    pub property: String,
    #[serde(default)]
    pub width: Option<u32>,
}

/// The seven property types (L-4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum PropertyType {
    Text,
    Number,
    Date,
    Checkbox,
    Select,
    MultiSelect,
    Url,
}

/// Board settings (B-1 to B-7). Column names are property values; the "No value"
/// column is the empty string.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BoardSettings {
    #[serde(default)]
    pub group_by: Option<String>,
    /// Saved column order. Values not listed here follow, then "No value".
    #[serde(default)]
    pub columns: Vec<String>,
    #[serde(default)]
    pub hidden: Vec<String>,
    /// Up to three properties shown on each card.
    #[serde(default)]
    pub card_properties: Vec<String>,
    /// Card order per column, as note keys. Reordering never edits a note (B-5).
    #[serde(default)]
    pub card_order: BTreeMap<String, Vec<String>>,
}

/// The column name used for notes without a value.
pub const NO_VALUE: &str = "";
