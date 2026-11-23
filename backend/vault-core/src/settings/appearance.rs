//! The look of the app (U-1 to U-3): theme, accent, density, font and layout. They live in
//! `settings.json`, so they sync and survive a restart (U-5).

use std::ops::RangeInclusive;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use super::JsonFile;
use crate::VaultError;

const FONT_SIZE: RangeInclusive<u32> = 12..=24;
const LINE_HEIGHT: RangeInclusive<f64> = 1.2..=2.0;
const CONTENT_WIDTH: RangeInclusive<u32> = 560..=1400;
const SIDEBAR_WIDTH: RangeInclusive<u32> = 180..=400;
const MAX_FONT_NAME: usize = 64;
const MAX_THEME_ID: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Density {
    Comfortable,
    Compact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SidebarSide {
    Left,
    Right,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppearanceSettings {
    /// Light, dark, or follow macOS (U-1).
    pub theme: ThemeMode,
    /// A built-in theme such as `paper`, or a file name in `.vault/themes/` (U-4).
    pub colors: String,
    /// `#rrggbb`, or none to use the theme's own accent.
    pub accent: Option<String>,
    pub density: Density,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            colors: "paper".to_string(),
            accent: None,
            density: Density::Comfortable,
        }
    }
}

/// One font for the whole app; the system font unless the user picks another (U-2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FontSettings {
    pub family: Option<String>,
    /// Note text size, in pixels.
    pub size: u32,
    pub line_height: f64,
}

impl Default for FontSettings {
    fn default() -> Self {
        Self {
            family: None,
            size: 15,
            line_height: 1.5,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LayoutSettings {
    /// The widest a note gets, in pixels.
    pub content_width: u32,
    pub sidebar_side: SidebarSide,
    pub sidebar_width: u32,
    pub show_sidebar: bool,
    /// The index status and note count at the foot of the sidebar.
    pub show_status_bar: bool,
}

impl Default for LayoutSettings {
    fn default() -> Self {
        Self {
            content_width: 1040,
            sidebar_side: SidebarSide::Left,
            sidebar_width: 232,
            show_sidebar: true,
            show_status_bar: true,
        }
    }
}

pub(super) fn load_appearance(file: &mut JsonFile) -> AppearanceSettings {
    let defaults = AppearanceSettings::default();
    AppearanceSettings {
        theme: file.get("/appearance/theme", defaults.theme, |_| true),
        colors: file.get("/appearance/colors", defaults.colors, |id: &String| {
            is_theme_id(id)
        }),
        accent: file.get(
            "/appearance/accent",
            defaults.accent,
            |accent: &Option<String>| accent.as_deref().is_none_or(is_hex_colour),
        ),
        density: file.get("/appearance/density", defaults.density, |_| true),
    }
}

pub(super) fn load_fonts(file: &mut JsonFile) -> FontSettings {
    let defaults = FontSettings::default();
    FontSettings {
        family: file.get(
            "/fonts/family",
            defaults.family,
            |family: &Option<String>| family.as_deref().is_none_or(is_font_name),
        ),
        size: file.get("/fonts/size", defaults.size, |size| {
            FONT_SIZE.contains(size)
        }),
        line_height: file.get("/fonts/lineHeight", defaults.line_height, |height| {
            LINE_HEIGHT.contains(height)
        }),
    }
}

pub(super) fn load_layout(file: &mut JsonFile) -> LayoutSettings {
    let defaults = LayoutSettings::default();
    LayoutSettings {
        content_width: file.get("/layout/contentWidth", defaults.content_width, |width| {
            CONTENT_WIDTH.contains(width)
        }),
        sidebar_side: file.get("/layout/sidebarSide", defaults.sidebar_side, |_| true),
        sidebar_width: file.get("/layout/sidebarWidth", defaults.sidebar_width, |width| {
            SIDEBAR_WIDTH.contains(width)
        }),
        show_sidebar: file.get("/layout/showSidebar", defaults.show_sidebar, |_| true),
        show_status_bar: file.get("/layout/showStatusBar", defaults.show_status_bar, |_| true),
    }
}

/// Checks every value before anything is written, so a bad value never reaches the file.
pub(super) fn check(
    appearance: &AppearanceSettings,
    fonts: &FontSettings,
    layout: &LayoutSettings,
) -> Result<(), VaultError> {
    let checks = [
        (is_theme_id(&appearance.colors), "appearance.colors"),
        (
            appearance.accent.as_deref().is_none_or(is_hex_colour),
            "appearance.accent",
        ),
        (
            fonts.family.as_deref().is_none_or(is_font_name),
            "fonts.family",
        ),
        (FONT_SIZE.contains(&fonts.size), "fonts.size"),
        (LINE_HEIGHT.contains(&fonts.line_height), "fonts.lineHeight"),
        (
            CONTENT_WIDTH.contains(&layout.content_width),
            "layout.contentWidth",
        ),
        (
            SIDEBAR_WIDTH.contains(&layout.sidebar_width),
            "layout.sidebarWidth",
        ),
    ];
    match checks.iter().find(|(valid, _)| !valid) {
        Some((_, name)) => Err(VaultError::InvalidProperty((*name).to_string())),
        None => Ok(()),
    }
}

pub(super) fn save_look(
    file: &mut JsonFile,
    appearance: &AppearanceSettings,
    fonts: &FontSettings,
    layout: &LayoutSettings,
) {
    file.set("/appearance/theme", to_value(&appearance.theme));
    file.set("/appearance/colors", Value::from(appearance.colors.clone()));
    file.set(
        "/appearance/accent",
        appearance.accent.clone().map_or(Value::Null, Value::from),
    );
    file.set("/appearance/density", to_value(&appearance.density));
    file.set(
        "/fonts/family",
        fonts.family.clone().map_or(Value::Null, Value::from),
    );
    file.set("/fonts/size", Value::from(fonts.size));
    file.set("/fonts/lineHeight", Value::from(fonts.line_height));
    file.set("/layout/contentWidth", Value::from(layout.content_width));
    file.set("/layout/sidebarSide", to_value(&layout.sidebar_side));
    file.set("/layout/sidebarWidth", Value::from(layout.sidebar_width));
    file.set("/layout/showSidebar", Value::from(layout.show_sidebar));
    file.set("/layout/showStatusBar", Value::from(layout.show_status_bar));
}

// The enums above always serialize, so a failure can't happen; Null keeps the file valid.
fn to_value(value: &impl Serialize) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

/// `#rrggbb`. Only plain colours, so a setting can never inject other CSS.
pub fn is_hex_colour(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Letters, digits, spaces and hyphens, such as `Iowan Old Style`. No quotes or semicolons.
fn is_font_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed.len() <= MAX_FONT_NAME
        && trimmed
            .chars()
            .all(|c| c.is_alphanumeric() || c == ' ' || c == '-')
}

/// A theme's id is a file name in `.vault/themes/` without `.json`, or a built-in id.
pub fn is_theme_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_THEME_ID
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}
