//! Surgical Butler: 3-layer safety system for .env file scanning.
//! Layer 1: strict allowlist filter
//! Layer 2: content fingerprinting (block SSH keys, certs, binary, oversized files)
//! Layer 3: push preview modal (handled by React frontend)

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::AppError;

// Layer 1: only these filenames are allowed for sync
const ALLOWED_FILENAMES: &[&str] = &[
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.test",
    ".env.test.local",
    ".env.production",
    ".env.production.local",
    ".env.staging",
];

// Layer 2: content patterns that BLOCK the file
const BLOCK_CONTENT_PATTERNS: &[&str] = &[
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
    "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN DSA PRIVATE KEY-----",
    "-----BEGIN PGP PRIVATE KEY BLOCK-----",
];

// Layer 2: content patterns that WARN but don't block
const WARN_CONTENT_PATTERNS: &[&str] = &["-----BEGIN CERTIFICATE-----"];

// Layer 2: filename substrings that block
const BLOCK_FILENAME_SUBSTRINGS: &[&str] = &[
    "id_rsa",
    "id_ed25519",
    "id_dsa",
    "id_ecdsa",
    ".pem",
    ".p12",
    ".pfx",
    ".key",
    ".crt",
];

// Max file size: 50KB
const MAX_FILE_SIZE_BYTES: u64 = 50 * 1024;

// Sensitive key name patterns for frontend display
const SENSITIVE_KEY_PATTERNS: &[&str] = &[
    "STRIPE_",
    "SECRET_",
    "PRIVATE_KEY",
    "API_KEY",
    "TOKEN",
    "PASSWORD",
];

/// Result of scanning a single .env file
#[derive(Debug, Clone, Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub var_count: usize,
    pub has_sensitive_keys: bool,
    pub warnings: Vec<String>,
    pub blocked: bool,
    pub block_reason: Option<String>,
}

/// Scan a project directory for .env files.
/// Layer 1: filter by allowlist. Layer 2: fingerprint each file.
pub fn scan_project(
    project_path: &str,
    custom_allowed: &[String],
) -> Result<Vec<ScannedFile>, AppError> {
    let dir = Path::new(project_path);
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!(
            "Project path not found: {project_path}"
        )));
    }

    let entries = fs::read_dir(dir)?;
    let mut results = Vec::new();

    // Build full allowlist (defaults + custom)
    let mut allowlist: Vec<String> = ALLOWED_FILENAMES.iter().map(|s| s.to_string()).collect();
    allowlist.extend(custom_allowed.iter().cloned());

    for entry in entries {
        let entry = entry?;
        let filename = entry.file_name().to_string_lossy().to_string();

        // Layer 1: allowlist filter
        if !allowlist.iter().any(|a| a == &filename) {
            continue;
        }

        let path = entry.path();
        let metadata = fs::metadata(&path)?;

        if !metadata.is_file() {
            continue;
        }

        let size_bytes = metadata.len();
        let mut scanned = ScannedFile {
            path: path.to_string_lossy().to_string(),
            filename: filename.clone(),
            size_bytes,
            var_count: 0,
            has_sensitive_keys: false,
            warnings: Vec::new(),
            blocked: false,
            block_reason: None,
        };

        // Layer 2: fingerprint checks
        fingerprint_file(&mut scanned, &path, size_bytes)?;

        results.push(scanned);
    }

    // Sort by filename for consistent ordering
    results.sort_by(|a, b| a.filename.cmp(&b.filename));

    Ok(results)
}

/// Layer 2: run all fingerprint checks on a single file
fn fingerprint_file(
    scanned: &mut ScannedFile,
    path: &Path,
    size_bytes: u64,
) -> Result<(), AppError> {
    // Check filename substrings
    let filename_lower = scanned.filename.to_lowercase();
    for pattern in BLOCK_FILENAME_SUBSTRINGS {
        if filename_lower.contains(pattern) {
            scanned.blocked = true;
            scanned.block_reason = Some(format!("Filename contains blocked pattern: {pattern}"));
            return Ok(());
        }
    }

    // Check file size
    if size_bytes > MAX_FILE_SIZE_BYTES {
        scanned.blocked = true;
        scanned.block_reason = Some(format!(
            "File exceeds 50KB limit ({} bytes)",
            size_bytes
        ));
        return Ok(());
    }

    // Read file content for content-based checks
    let content = fs::read(path)?;

    // Check for binary content (null bytes in first 512 bytes)
    let check_len = content.len().min(512);
    if content[..check_len].contains(&0u8) {
        scanned.blocked = true;
        scanned.block_reason = Some("Binary file detected".into());
        return Ok(());
    }

    let text = String::from_utf8_lossy(&content);

    // Check for private key content patterns.
    // If the key appears inside an env var value (KEY=...-----BEGIN...), warn instead of block.
    // Only block if the file IS a raw key file (pattern appears at start of line, not after '=').
    for pattern in BLOCK_CONTENT_PATTERNS {
        if text.contains(pattern) {
            let is_env_value = text.lines().any(|line| {
                let trimmed = line.trim();
                if let Some(eq_pos) = trimmed.find('=') {
                    let value_part = &trimmed[eq_pos + 1..];
                    value_part.contains(pattern)
                } else {
                    false
                }
            });

            if is_env_value {
                // Key is inside an env var value — warn, don't block
                scanned.warnings.push(format!("Contains embedded private key (will be encrypted)"));
                scanned.has_sensitive_keys = true;
            } else {
                // Raw key file — block
                scanned.blocked = true;
                scanned.block_reason = Some(format!("Raw private key file: {pattern}"));
                return Ok(());
            }
        }
    }

    // Check for warning content patterns (certificates)
    for pattern in WARN_CONTENT_PATTERNS {
        if text.contains(pattern) {
            scanned.warnings.push(format!("Contains certificate: {pattern}"));
        }
    }

    // Count env vars and detect sensitive keys
    scanned.var_count = count_env_vars(&text);
    scanned.has_sensitive_keys |= detect_sensitive_key_names(&text);

    Ok(())
}

/// Count KEY=VALUE lines (non-empty, non-comment)
pub fn count_env_vars(content: &str) -> usize {
    content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with('#') && trimmed.contains('=')
        })
        .count()
}

/// Check if any key name matches sensitive patterns
pub fn detect_sensitive_key_names(content: &str) -> bool {
    content.lines().any(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            return false;
        }
        if let Some(key) = trimmed.split('=').next() {
            let key_upper = key.trim().to_uppercase();
            SENSITIVE_KEY_PATTERNS
                .iter()
                .any(|pattern| key_upper.contains(pattern))
        } else {
            false
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn count_vars_basic() {
        let content = "DB_URL=postgres://localhost\n# comment\n\nAPI_KEY=abc123\n";
        assert_eq!(count_env_vars(content), 2);
    }

    #[test]
    fn count_vars_empty() {
        assert_eq!(count_env_vars(""), 0);
        assert_eq!(count_env_vars("# only comments\n"), 0);
    }

    #[test]
    fn detect_sensitive_keys() {
        assert!(detect_sensitive_key_names("STRIPE_SECRET_KEY=sk_live_xxx"));
        assert!(detect_sensitive_key_names("API_KEY=abc"));
        assert!(detect_sensitive_key_names("DB_PASSWORD=secret"));
        assert!(!detect_sensitive_key_names("DATABASE_URL=postgres://localhost"));
    }

    #[test]
    fn scan_blocks_ssh_key_content() {
        let dir = tempfile::tempdir().unwrap();
        let env_path = dir.path().join(".env");
        fs::write(&env_path, "-----BEGIN OPENSSH PRIVATE KEY-----\nfake key data").unwrap();

        let results = scan_project(dir.path().to_str().unwrap(), &[]).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].blocked);
        assert!(results[0].block_reason.as_ref().unwrap().contains("private key"));
    }

    #[test]
    fn scan_allows_normal_env() {
        let dir = tempfile::tempdir().unwrap();
        let env_path = dir.path().join(".env.local");
        fs::write(&env_path, "DB_URL=postgres://localhost\nAPI_KEY=test123\n").unwrap();

        let results = scan_project(dir.path().to_str().unwrap(), &[]).unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].blocked);
        assert_eq!(results[0].var_count, 2);
        assert!(results[0].has_sensitive_keys);
    }

    #[test]
    fn scan_ignores_non_env_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("README.md"), "# Hello").unwrap();
        fs::write(dir.path().join("config.json"), "{}").unwrap();
        fs::write(dir.path().join(".env"), "KEY=val").unwrap();

        let results = scan_project(dir.path().to_str().unwrap(), &[]).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].filename, ".env");
    }

    #[test]
    fn scan_blocks_oversized_file() {
        let dir = tempfile::tempdir().unwrap();
        let env_path = dir.path().join(".env");
        // Write 60KB of content
        let content = "A".repeat(60 * 1024);
        fs::write(&env_path, content).unwrap();

        let results = scan_project(dir.path().to_str().unwrap(), &[]).unwrap();
        assert!(results[0].blocked);
        assert!(results[0].block_reason.as_ref().unwrap().contains("50KB"));
    }
}
