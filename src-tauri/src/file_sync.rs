#![deny(unsafe_code)]

//! Local file-based sync: export/import encrypted .envbutler files.
//! No Supabase needed — user syncs via Google Drive, iCloud, USB, etc.

use std::collections::HashMap;

use crate::crypto;
use crate::error::AppError;
use crate::scanner;
use crate::vault;

/// Magic bytes identifying an .envbutler file
const MAGIC: &[u8; 8] = b"ENVBTLR\0";
/// Current file format version
const VERSION: u8 = 1;
/// Header size: 8 (magic) + 1 (version) = 9 bytes
const HEADER_LEN: usize = 9;

/// Export: scan project → zip → encrypt → prepend header.
/// Returns raw bytes for frontend to save via dialog.
pub fn export_vault(project_path: &str, password: &str) -> Result<Vec<u8>, AppError> {
    let scanned = scanner::scan_project(project_path, &[])?;
    let allowed: Vec<_> = scanned.iter().filter(|f| !f.blocked).collect();
    if allowed.is_empty() {
        return Err(AppError::NotFound("No .env files found to export".into()));
    }

    let zip_bytes = vault::create_vault_zip(&scanned)?;
    let encrypted = crypto::encrypt(&zip_bytes, password)?;

    // Pack: [magic 8B][version 1B][encrypted blob...]
    let mut output = Vec::with_capacity(HEADER_LEN + encrypted.len());
    output.extend_from_slice(MAGIC);
    output.push(VERSION);
    output.extend_from_slice(&encrypted);

    Ok(output)
}

/// Import: validate header → decrypt → unzip → return file map.
pub fn import_vault(
    file_bytes: &[u8],
    password: &str,
) -> Result<HashMap<String, String>, AppError> {
    // Validate minimum size
    if file_bytes.len() < HEADER_LEN + 29 {
        return Err(AppError::Validation(
            "Not a valid .envbutler file — too small".into(),
        ));
    }

    // Validate magic bytes
    if &file_bytes[..8] != MAGIC {
        return Err(AppError::Validation(
            "Not a valid .envbutler file — wrong format".into(),
        ));
    }

    // Check version
    let version = file_bytes[8];
    if version != VERSION {
        return Err(AppError::Validation(format!(
            "Unsupported .envbutler version: {version}. Please update the app."
        )));
    }

    // Decrypt the blob (after header)
    let encrypted = &file_bytes[HEADER_LEN..];
    let zip_bytes = crypto::decrypt(encrypted, password)?;
    vault::extract_vault_zip(&zip_bytes)
}

/// Push encrypted vault to sync folder as {slug}.envbutler
pub fn push_to_folder(
    sync_folder: &str,
    slug: &str,
    project_path: &str,
    password: &str,
) -> Result<String, AppError> {
    let bytes = export_vault(project_path, password)?;
    let dest = std::path::Path::new(sync_folder).join(format!("{slug}.envbutler"));
    std::fs::write(&dest, &bytes)?;
    Ok(dest.to_string_lossy().to_string())
}

/// Pull encrypted vault from sync folder and return decrypted files
pub fn pull_from_folder(
    sync_folder: &str,
    slug: &str,
    password: &str,
) -> Result<HashMap<String, String>, AppError> {
    let src = std::path::Path::new(sync_folder).join(format!("{slug}.envbutler"));
    if !src.exists() {
        return Err(AppError::NotFound(format!(
            "No vault file found: {slug}.envbutler in sync folder"
        )));
    }
    let bytes = std::fs::read(&src)?;
    import_vault(&bytes, password)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn export_import_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let env_path = dir.path().join(".env");
        fs::write(&env_path, "DB_URL=postgres://localhost\nAPI_KEY=test123\n").unwrap();

        let password = "test-master-key";
        let exported = export_vault(dir.path().to_str().unwrap(), password).unwrap();

        // Verify header
        assert_eq!(&exported[..8], MAGIC);
        assert_eq!(exported[8], VERSION);

        // Import back
        let files = import_vault(&exported, password).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[".env"], "DB_URL=postgres://localhost\nAPI_KEY=test123\n");
    }

    #[test]
    fn wrong_password_fails() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".env"), "KEY=val\n").unwrap();

        let exported = export_vault(dir.path().to_str().unwrap(), "correct").unwrap();
        let result = import_vault(&exported, "wrong");
        assert!(result.is_err());
    }

    #[test]
    fn invalid_magic_fails() {
        let result = import_vault(b"NOT_ENVB\x01fake-encrypted-data-padding!!", "any");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("wrong format"));
    }

    #[test]
    fn too_small_fails() {
        let result = import_vault(b"tiny", "any");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too small"));
    }
}
