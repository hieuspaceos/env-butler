#![deny(unsafe_code)]

//! Team invite token: encrypted package containing vault access credentials.
//! Owner generates token with passphrase → member imports to gain push/pull access.
//! Format: ENVBTLR_TEAM\0 (12 bytes) | version (1 byte) | AES-256-GCM encrypted JSON
//!
//! SECURITY NOTE: The invite token contains the Supabase service_role key and
//! the vault master key. Any team member who decrypts the token gains full access
//! to the Supabase instance — not just the shared project. Only invite trusted
//! team members. For higher isolation, use separate Supabase instances per team.

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::crypto;
use crate::error::AppError;
use crate::meta::SupabaseConfig;

/// Magic bytes identifying an invite token file
const TEAM_MAGIC: &[u8; 12] = b"ENVBTLR_TEAM";
/// Current token format version
const TOKEN_VERSION: u8 = 0x01;
/// Minimum passphrase length
const MIN_PASSPHRASE_LEN: usize = 8;

/// Payload encrypted inside the invite token
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitePayload {
    pub vault_slug: String,
    pub master_key: String,
    pub supabase_url: String,
    pub supabase_key: String,
    /// Optional shared sync folder path
    pub sync_folder: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub permissions: String,
}

/// Generate an encrypted invite token file.
/// Returns raw bytes suitable for writing to .envbutler-team file.
pub fn generate_invite_token(
    slug: &str,
    master_key: &str,
    config: &SupabaseConfig,
    created_by: &str,
    passphrase: &str,
) -> Result<Vec<u8>, AppError> {
    validate_passphrase(passphrase)?;

    let payload = InvitePayload {
        vault_slug: slug.to_string(),
        master_key: master_key.to_string(),
        supabase_url: config.supabase_url.clone(),
        supabase_key: config.supabase_service_role_key.clone(),
        sync_folder: config.sync_folder.clone(),
        created_by: created_by.to_string(),
        created_at: Utc::now().to_rfc3339(),
        permissions: "read-write".to_string(),
    };

    let json = serde_json::to_vec(&payload)
        .map_err(|e| AppError::Io(format!("Serialize invite payload: {e}")))?;

    let encrypted = crypto::encrypt(&json, passphrase)?;

    // Assemble: magic (12) + version (1) + encrypted blob
    let mut token = Vec::with_capacity(12 + 1 + encrypted.len());
    token.extend_from_slice(TEAM_MAGIC);
    token.push(TOKEN_VERSION);
    token.extend_from_slice(&encrypted);

    Ok(token)
}

/// Parse and decrypt an invite token file.
/// Returns the decrypted payload with vault access credentials.
pub fn parse_invite_token(bytes: &[u8], passphrase: &str) -> Result<InvitePayload, AppError> {
    // Minimum size: 12 magic + 1 version + some encrypted data
    if bytes.len() < 14 {
        return Err(AppError::Validation("Invalid invite token: too small".into()));
    }

    // Verify magic bytes
    if &bytes[..12] != TEAM_MAGIC {
        return Err(AppError::Validation(
            "Not a valid invite token file. Expected .envbutler-team format.".into(),
        ));
    }

    // Check version
    let version = bytes[12];
    if version != TOKEN_VERSION {
        return Err(AppError::Validation(format!(
            "Unsupported invite token version: {version}. Update Env Butler to the latest version."
        )));
    }

    // Decrypt payload
    let encrypted = &bytes[13..];
    let json_bytes = crypto::decrypt(encrypted, passphrase)?;

    serde_json::from_slice(&json_bytes)
        .map_err(|e| AppError::Crypto(format!("Invalid invite token payload: {e}")))
}

/// Validate passphrase meets minimum requirements
fn validate_passphrase(passphrase: &str) -> Result<(), AppError> {
    if passphrase.len() < MIN_PASSPHRASE_LEN {
        return Err(AppError::Validation(format!(
            "Passphrase must be at least {MIN_PASSPHRASE_LEN} characters"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> SupabaseConfig {
        SupabaseConfig {
            supabase_url: "https://test.supabase.co".into(),
            supabase_service_role_key: "eyJtest123".into(),
            sync_folder: Some("/tmp/sync".into()),
        }
    }

    #[test]
    fn invite_token_roundtrip() {
        let config = test_config();
        let passphrase = "test-passphrase-12345";

        let token = generate_invite_token("my-project", "master-key-abc", &config, "owner", passphrase).unwrap();
        let payload = parse_invite_token(&token, passphrase).unwrap();

        assert_eq!(payload.vault_slug, "my-project");
        assert_eq!(payload.master_key, "master-key-abc");
        assert_eq!(payload.supabase_url, "https://test.supabase.co");
        assert_eq!(payload.supabase_key, "eyJtest123");
        assert_eq!(payload.sync_folder, Some("/tmp/sync".into()));
        assert_eq!(payload.permissions, "read-write");
    }

    #[test]
    fn wrong_passphrase_fails() {
        let config = test_config();
        let token = generate_invite_token("proj", "key", &config, "owner", "correct-passphrase").unwrap();
        let result = parse_invite_token(&token, "wrong-passphrase!");
        assert!(result.is_err());
    }

    #[test]
    fn invalid_magic_fails() {
        let result = parse_invite_token(b"NOT_A_TOKEN_FILE_CONTENT", "passphrase");
        assert!(result.is_err());
    }

    #[test]
    fn too_small_fails() {
        let result = parse_invite_token(b"tiny", "passphrase");
        assert!(result.is_err());
    }

    #[test]
    fn short_passphrase_rejected() {
        let config = test_config();
        let result = generate_invite_token("proj", "key", &config, "owner", "short");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("at least"));
    }
}
