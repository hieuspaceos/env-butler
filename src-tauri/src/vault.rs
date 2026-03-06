#![deny(unsafe_code)]

//! Zip/unzip .env files into a single blob for encryption and sync.
//! Computes plaintext hash for conflict detection.

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::error::AppError;
use crate::scanner::ScannedFile;

/// Create an in-memory zip archive from scanned (non-blocked) files.
/// Reads file content from disk. Skips blocked files.
pub fn create_vault_zip(files: &[ScannedFile]) -> Result<Vec<u8>, AppError> {
    let buf = Vec::new();
    let mut zip = ZipWriter::new(Cursor::new(buf));
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for file in files {
        if file.blocked {
            continue;
        }

        let content = std::fs::read(&file.path)?;
        zip.start_file(&file.filename, options)
            .map_err(|e| AppError::Io(format!("Zip write: {e}")))?;
        zip.write_all(&content)
            .map_err(|e| AppError::Io(format!("Zip write: {e}")))?;
    }

    let cursor = zip
        .finish()
        .map_err(|e| AppError::Io(format!("Zip finish: {e}")))?;
    Ok(cursor.into_inner())
}

/// Extract a zip archive into a map of filename -> content string.
pub fn extract_vault_zip(zip_bytes: &[u8]) -> Result<HashMap<String, String>, AppError> {
    let cursor = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(cursor)?;
    let mut files = HashMap::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        let mut content = String::new();
        entry
            .read_to_string(&mut content)
            .map_err(|e| AppError::Io(format!("Zip read: {e}")))?;
        files.insert(name, content);
    }

    Ok(files)
}

/// Compute SHA-256 hex hash of plaintext zip bytes for conflict detection.
pub fn compute_plaintext_hash(zip_bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(zip_bytes);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_scanned_file(dir: &std::path::Path, name: &str, content: &str) -> ScannedFile {
        let path = dir.join(name);
        fs::write(&path, content).unwrap();
        ScannedFile {
            path: path.to_string_lossy().to_string(),
            filename: name.to_string(),
            size_bytes: content.len() as u64,
            var_count: 1,
            has_sensitive_keys: false,
            warnings: vec![],
            blocked: false,
            block_reason: None,
        }
    }

    #[test]
    fn zip_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let files = vec![
            make_scanned_file(dir.path(), ".env", "DB_URL=postgres://localhost\n"),
            make_scanned_file(dir.path(), ".env.local", "SECRET=abc123\n"),
        ];

        let zip_bytes = create_vault_zip(&files).unwrap();
        let extracted = extract_vault_zip(&zip_bytes).unwrap();

        assert_eq!(extracted.len(), 2);
        assert_eq!(extracted[".env"], "DB_URL=postgres://localhost\n");
        assert_eq!(extracted[".env.local"], "SECRET=abc123\n");
    }

    #[test]
    fn skips_blocked_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut blocked = make_scanned_file(dir.path(), ".env", "content");
        blocked.blocked = true;
        let ok = make_scanned_file(dir.path(), ".env.local", "KEY=val\n");

        let zip_bytes = create_vault_zip(&[blocked, ok]).unwrap();
        let extracted = extract_vault_zip(&zip_bytes).unwrap();

        assert_eq!(extracted.len(), 1);
        assert!(extracted.contains_key(".env.local"));
    }

    #[test]
    fn hash_deterministic() {
        let data = b"some zip content";
        let h1 = compute_plaintext_hash(data);
        let h2 = compute_plaintext_hash(data);
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_changes_with_content() {
        let h1 = compute_plaintext_hash(b"content A");
        let h2 = compute_plaintext_hash(b"content B");
        assert_ne!(h1, h2);
    }
}
