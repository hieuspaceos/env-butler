#![deny(unsafe_code)]

//! Team invite tokens for vault sharing.
//!
//! **v1 (legacy):** Encrypted package containing master key + service role key.
//! Format: ENVBTLR_TEAM\0 (12 bytes) | version 0x01 | AES-256-GCM encrypted JSON.
//! DEPRECATED: Still supported for backward compat, shows warning in UI.
//!
//! **v2 (envelope):** Plaintext JSON with Supabase URL + vault slug + one-time code.
//! Format: ENVBTLR_TEAM\0 (12 bytes) | version 0x02 | JSON payload.
//! No secrets in the invite — member registers their own passphrase-derived key.

use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::crypto;
use crate::error::AppError;
use crate::meta::SupabaseConfig;

/// Magic bytes identifying an invite token file
const TEAM_MAGIC: &[u8; 12] = b"ENVBTLR_TEAM";
/// v1 token format (legacy, deprecated)
const TOKEN_VERSION_V1: u8 = 0x01;
/// v2 token format (envelope encryption)
const TOKEN_VERSION_V2: u8 = 0x02;
/// Minimum passphrase length
const MIN_PASSPHRASE_LEN: usize = 8;
/// Default invite expiry: 48 hours
const INVITE_EXPIRY_HOURS: i64 = 48;

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

// --- v2 Invite (envelope encryption, no secrets in token) ---

/// Payload inside a v2 invite token (plaintext — no secrets)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitePayloadV2 {
    pub vault_slug: String,
    pub supabase_url: String,
    /// Anon key for member-scoped RLS access (safe to share — it's public by design)
    pub supabase_anon_key: String,
    /// One-time code stored in vault_invites table
    pub invite_code: String,
    pub created_by: String,
    pub created_at: String,
    pub expires_at: String,
}

/// Result of parsing an invite token — either v1 (legacy) or v2 (envelope)
#[derive(Debug, Clone)]
pub enum ParsedInvite {
    /// Legacy invite with master key + service role key (deprecated)
    V1(InvitePayload),
    /// Envelope invite with one-time code (no secrets)
    V2(InvitePayloadV2),
}

/// Generate a v2 invite token file + the invite code for Supabase storage.
/// Returns (token_bytes, invite_code, expires_at) — caller stores code in vault_invites.
pub fn generate_invite_v2(
    slug: &str,
    supabase_url: &str,
    supabase_anon_key: &str,
    created_by: &str,
) -> Result<(Vec<u8>, String, String), AppError> {
    let invite_code = Uuid::new_v4().to_string();
    let now = Utc::now();
    let expires_at = (now + Duration::hours(INVITE_EXPIRY_HOURS)).to_rfc3339();

    let payload = InvitePayloadV2 {
        vault_slug: slug.to_string(),
        supabase_url: supabase_url.to_string(),
        supabase_anon_key: supabase_anon_key.to_string(),
        invite_code: invite_code.clone(),
        created_by: created_by.to_string(),
        created_at: now.to_rfc3339(),
        expires_at: expires_at.clone(),
    };

    let json = serde_json::to_vec(&payload)
        .map_err(|e| AppError::Io(format!("Serialize v2 invite: {e}")))?;

    // v2 token: magic (12) + version 0x02 (1) + plaintext JSON
    let mut token = Vec::with_capacity(12 + 1 + json.len());
    token.extend_from_slice(TEAM_MAGIC);
    token.push(TOKEN_VERSION_V2);
    token.extend_from_slice(&json);

    Ok((token, invite_code, expires_at))
}

// --- v1 Legacy (deprecated, kept for backward compat) ---

/// Generate an encrypted v1 invite token file (DEPRECATED).
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

    let mut token = Vec::with_capacity(12 + 1 + encrypted.len());
    token.extend_from_slice(TEAM_MAGIC);
    token.push(TOKEN_VERSION_V1);
    token.extend_from_slice(&encrypted);

    Ok(token)
}

/// Parse and decrypt a v1 invite token (DEPRECATED).
pub fn parse_invite_token(bytes: &[u8], passphrase: &str) -> Result<InvitePayload, AppError> {
    match parse_invite(bytes, Some(passphrase))? {
        ParsedInvite::V1(payload) => Ok(payload),
        ParsedInvite::V2(_) => Err(AppError::Validation(
            "Expected v1 invite token but got v2. Use the new join flow.".into(),
        )),
    }
}

// --- Unified parser ---

/// Parse an invite token, auto-detecting version.
/// passphrase is required for v1, ignored for v2.
pub fn parse_invite(bytes: &[u8], passphrase: Option<&str>) -> Result<ParsedInvite, AppError> {
    if bytes.len() < 14 {
        return Err(AppError::Validation("Invalid invite token: too small".into()));
    }

    if &bytes[..12] != TEAM_MAGIC {
        return Err(AppError::Validation(
            "Not a valid invite token file. Expected .envbutler-team format.".into(),
        ));
    }

    let version = bytes[12];
    let data = &bytes[13..];

    match version {
        TOKEN_VERSION_V1 => {
            let passphrase = passphrase.ok_or_else(|| {
                AppError::Validation("Passphrase required for v1 invite token.".into())
            })?;
            let json_bytes = crypto::decrypt(data, passphrase)?;
            let payload: InvitePayload = serde_json::from_slice(&json_bytes)
                .map_err(|e| AppError::Crypto(format!("Invalid v1 invite payload: {e}")))?;
            Ok(ParsedInvite::V1(payload))
        }
        TOKEN_VERSION_V2 => {
            let payload: InvitePayloadV2 = serde_json::from_slice(data)
                .map_err(|e| AppError::Validation(format!("Invalid v2 invite payload: {e}")))?;
            Ok(ParsedInvite::V2(payload))
        }
        _ => Err(AppError::Validation(format!(
            "Unsupported invite token version: {version}. Update Env Butler to the latest version."
        ))),
    }
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
            supabase_anon_key: Some("eyJanon456".into()),
            sync_folder: Some("/tmp/sync".into()),
        }
    }

    // --- v1 tests (legacy, still must work) ---

    #[test]
    fn v1_invite_token_roundtrip() {
        let config = test_config();
        let passphrase = "test-passphrase-12345";

        let token = generate_invite_token("my-project", "master-key-abc", &config, "owner", passphrase).unwrap();
        let payload = parse_invite_token(&token, passphrase).unwrap();

        assert_eq!(payload.vault_slug, "my-project");
        assert_eq!(payload.master_key, "master-key-abc");
        assert_eq!(payload.supabase_url, "https://test.supabase.co");
        assert_eq!(payload.supabase_key, "eyJtest123");
    }

    #[test]
    fn v1_wrong_passphrase_fails() {
        let config = test_config();
        let token = generate_invite_token("proj", "key", &config, "owner", "correct-passphrase").unwrap();
        assert!(parse_invite_token(&token, "wrong-passphrase!").is_err());
    }

    #[test]
    fn v1_short_passphrase_rejected() {
        let config = test_config();
        let result = generate_invite_token("proj", "key", &config, "owner", "short");
        assert!(result.unwrap_err().to_string().contains("at least"));
    }

    // --- v2 tests ---

    #[test]
    fn v2_invite_roundtrip() {
        let (token, code, expires_at) =
            generate_invite_v2("my-vault", "https://test.supabase.co", "eyJanon123", "owner-alice").unwrap();

        let parsed = parse_invite(&token, None).unwrap();
        match parsed {
            ParsedInvite::V2(p) => {
                assert_eq!(p.vault_slug, "my-vault");
                assert_eq!(p.supabase_url, "https://test.supabase.co");
                assert_eq!(p.supabase_anon_key, "eyJanon123");
                assert_eq!(p.invite_code, code);
                assert_eq!(p.expires_at, expires_at);
                assert_eq!(p.created_by, "owner-alice");
            }
            ParsedInvite::V1(_) => panic!("Expected v2 invite"),
        }
    }

    #[test]
    fn v2_invite_code_is_uuid() {
        let (_, code, _) = generate_invite_v2("slug", "https://x.supabase.co", "anon", "me").unwrap();
        assert!(Uuid::parse_str(&code).is_ok());
    }

    #[test]
    fn v2_no_service_role_key_in_token() {
        let (token, _, _) = generate_invite_v2("slug", "https://x.supabase.co", "eyJanon", "me").unwrap();
        let token_str = String::from_utf8_lossy(&token);
        // v2 tokens must NOT contain service role key or master key
        assert!(!token_str.contains("master_key"));
        assert!(!token_str.contains("service_role"));
    }

    // --- Unified parser tests ---

    #[test]
    fn unified_parser_detects_v1() {
        let config = test_config();
        let token = generate_invite_token("proj", "key", &config, "owner", "my-passphrase-123").unwrap();
        let parsed = parse_invite(&token, Some("my-passphrase-123")).unwrap();
        assert!(matches!(parsed, ParsedInvite::V1(_)));
    }

    #[test]
    fn unified_parser_detects_v2() {
        let (token, _, _) = generate_invite_v2("proj", "https://x.supabase.co", "anon", "me").unwrap();
        let parsed = parse_invite(&token, None).unwrap();
        assert!(matches!(parsed, ParsedInvite::V2(_)));
    }

    #[test]
    fn invalid_magic_fails() {
        assert!(parse_invite(b"NOT_A_TOKEN_FILE_CONTENT", None).is_err());
    }

    #[test]
    fn too_small_fails() {
        assert!(parse_invite(b"tiny", None).is_err());
    }

    #[test]
    fn unknown_version_fails() {
        let mut token = Vec::new();
        token.extend_from_slice(TEAM_MAGIC);
        token.push(0xFF); // unknown version
        token.extend_from_slice(b"some data here");
        assert!(parse_invite(&token, None).is_err());
    }
}
