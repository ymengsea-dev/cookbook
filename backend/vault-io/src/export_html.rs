//! Exporting one note as a single HTML file (IO-4). Images are embedded as `data:` URLs,
//! so the file opens offline in any browser.

use std::fs;
use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use pulldown_cmark::{Options, Parser, html};
use vault_core::{Vault, VaultPath, note_body};

use crate::IoError;
use crate::export_note::linked_file;
use crate::links::{folder_of, map_link_targets};
use crate::names::stem;

/// Images bigger than this stay as links, so one photo can't make the page huge.
const MAX_EMBED_BYTES: u64 = 20 * 1024 * 1024;

/// Writes the note, without its front matter, as a self-contained page at `to`.
pub fn export_note_html(vault: &Vault, note: &VaultPath, to: &Path) -> Result<(), IoError> {
    let content = vault.read_note(note)?.content;
    let note_folder = folder_of(note.as_str());
    let (body, _) = map_link_targets(note_body(&content), &mut |target| {
        let linked = linked_file(vault, note_folder, target)?;
        embedded_image(vault, &linked)
    });

    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut rendered = String::new();
    html::push_html(&mut rendered, Parser::new_ext(&body, options));
    let page = page(stem(note.file_name()), &rendered);

    // Written beside the target first, so a failed export never leaves half a file.
    let partial = to.with_extension("html.partial");
    fs::write(&partial, page).map_err(IoError::file("write", to.display().to_string()))?;
    fs::rename(&partial, to).map_err(IoError::file("write", to.display().to_string()))
}

fn embedded_image(vault: &Vault, linked: &str) -> Option<String> {
    let mime = image_type(linked)?;
    let file = VaultPath::parse(linked).ok()?.to_fs_path(vault.root());
    let size = fs::metadata(&file).ok()?.len();
    if size > MAX_EMBED_BYTES {
        return None;
    }
    let bytes = fs::read(&file).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

fn image_type(path: &str) -> Option<&'static str> {
    let extension = path.rsplit('.').next()?.to_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

// The exported page is read outside the app, so its colours are written out here.
fn page(title: &str, body: &str) -> String {
    format!(
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n\
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
<title>{title}</title>\n<style>\n{STYLE}</style>\n</head>\n<body>\n<article>\n{body}</article>\n</body>\n</html>\n",
        title = escape(title),
    )
}

const STYLE: &str = "\
:root { color-scheme: light dark; --paper: #f5f0e6; --ink: #2a2521; --muted: #786e64; --rule: #e3d9c8; }
@media (prefers-color-scheme: dark) { :root { --paper: #1d1a17; --ink: #eee7db; --muted: #a69c90; --rule: #3a342d; } }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.6 system-ui, -apple-system, sans-serif; }
article { max-width: 44rem; margin: 0 auto; padding: 3rem 1.5rem; }
img { max-width: 100%; }
pre, code { background: color-mix(in srgb, var(--ink) 6%, transparent); border-radius: 6px; }
pre { padding: 0.75rem 1rem; overflow-x: auto; }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--rule); padding: 0.25rem 0.75rem; }
blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid var(--rule); color: var(--muted); }
";

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
