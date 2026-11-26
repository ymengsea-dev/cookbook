//! Exporting a folder or the whole vault as a ZIP of plain files (IO-5).

use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use vault_core::{KEY_PROPERTY, Vault, VaultPath, is_portable_internal, remove_property};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::shared::names::has_extension;
use crate::shared::walk::files_under;
use crate::{IoError, Job};

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ZipOptions {
    /// A folder to export, or the whole vault.
    pub folder: Option<VaultPath>,
    /// Add the vault's synced settings, views and reading progress. Whole-vault exports only.
    pub include_vault_dir: bool,
    /// Leave out each note's `key` line, for sharing outside the app.
    pub strip_keys: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ZipExport {
    pub files: usize,
}

/// Writes the ZIP to `to`. Paths inside it are relative to the vault, so importing it into
/// an empty vault rebuilds the same tree.
pub fn export_zip(
    vault: &Vault,
    options: &ZipOptions,
    to: &Path,
    job: &dyn Job,
) -> Result<ZipExport, IoError> {
    let files = files_to_export(vault, options)?;
    let label = to.display().to_string();
    let partial = to.with_extension("zip.partial");
    let result = write_zip(vault, &files, options.strip_keys, &partial, job);
    if let Err(error) = result {
        let _ = fs::remove_file(&partial);
        return Err(error);
    }
    fs::rename(&partial, to).map_err(IoError::file("write", label))?;
    Ok(ZipExport { files: files.len() })
}

fn files_to_export(vault: &Vault, options: &ZipOptions) -> Result<Vec<String>, IoError> {
    let Some(folder) = &options.folder else {
        let mut files = files_under(vault.root(), options.include_vault_dir)?;
        // Device-only files, such as the trash, the index and code runners, never leave.
        files.retain(|path| !path.starts_with(".vault/") || is_portable_internal(path));
        return Ok(files);
    };
    let inside = files_under(&folder.to_fs_path(vault.root()), false)?;
    Ok(inside
        .into_iter()
        .map(|path| format!("{folder}/{path}"))
        .collect())
}

fn write_zip(
    vault: &Vault,
    files: &[String],
    strip_keys: bool,
    to: &Path,
    job: &dyn Job,
) -> Result<(), IoError> {
    let label = to.display().to_string();
    let file = File::create(to).map_err(IoError::file("write", label.clone()))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (index, path) in files.iter().enumerate() {
        if job.is_cancelled() {
            return Err(IoError::Cancelled("export"));
        }
        let bytes =
            fs::read(vault.root().join(path)).map_err(IoError::file("read", path.clone()))?;
        let bytes = if strip_keys && has_extension(path, "md") {
            without_key(bytes)
        } else {
            bytes
        };
        zip.start_file(path.as_str(), options)
            .map_err(zip_error(&label))?;
        zip.write_all(&bytes)
            .map_err(IoError::file("write", label.clone()))?;
        job.progress(index + 1, files.len());
    }
    zip.finish().map_err(zip_error(&label))?;
    Ok(())
}

// Notes that aren't valid UTF-8 go in unchanged.
fn without_key(bytes: Vec<u8>) -> Vec<u8> {
    match String::from_utf8(bytes) {
        Ok(text) => remove_property(&text, KEY_PROPERTY).into_bytes(),
        Err(error) => error.into_bytes(),
    }
}

fn zip_error(label: &str) -> impl FnOnce(zip::result::ZipError) -> IoError {
    let label = label.to_string();
    move |error| IoError::File {
        action: "write",
        path: label,
        source: std::io::Error::other(error.to_string()),
    }
}
