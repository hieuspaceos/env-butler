#![deny(unsafe_code)]

//! CI/CD service token: base64-encoded package bundling passphrase + invite token.
//! Single string safe for env var storage (ENVBUTLER_TOKEN).
//! Format: base64(passphrase_len:u16_le | passphrase_bytes | invite_token_bytes)
//!
//! SECURITY NOTE: This token contains the passphrase and encrypted invite data
//! (which includes Supabase service_role key + master key). If this token leaks,
//! an attacker can decrypt your vault. Treat it like a database password.
//! Store it only in encrypted CI secrets (e.g., GitHub Secrets, GitLab CI Variables).

use base64::{engine::general_purpose::STANDARD, Engine};

use crate::error::AppError;
use crate::meta::SupabaseConfig;
use crate::team;

/// Env var name for CI/CD service token
pub const TOKEN_ENV_VAR: &str = "ENVBUTLER_TOKEN";

/// Generate a service token: invite token + passphrase bundled as base64 string.
pub fn generate_service_token(
    slug: &str,
    master_key: &str,
    config: &SupabaseConfig,
    created_by: &str,
    passphrase: &str,
) -> Result<String, AppError> {
    let invite_bytes = team::generate_invite_token(slug, master_key, config, created_by, passphrase)?;

    // Pack: passphrase_len (2 bytes LE) + passphrase + invite token
    let pass_bytes = passphrase.as_bytes();
    let pass_len = pass_bytes.len() as u16;

    let mut packed = Vec::with_capacity(2 + pass_bytes.len() + invite_bytes.len());
    packed.extend_from_slice(&pass_len.to_le_bytes());
    packed.extend_from_slice(pass_bytes);
    packed.extend_from_slice(&invite_bytes);

    Ok(STANDARD.encode(&packed))
}

/// Decode a service token from base64 string → (passphrase, invite_token_bytes).
pub fn decode_service_token(token_str: &str) -> Result<(String, Vec<u8>), AppError> {
    let packed = STANDARD
        .decode(token_str.trim())
        .map_err(|e| AppError::Validation(format!("Invalid service token: bad base64: {e}")))?;

    if packed.len() < 2 {
        return Err(AppError::Validation("Invalid service token: too short".into()));
    }

    let pass_len = u16::from_le_bytes([packed[0], packed[1]]) as usize;

    if packed.len() < 2 + pass_len {
        return Err(AppError::Validation("Invalid service token: truncated".into()));
    }

    let passphrase = std::str::from_utf8(&packed[2..2 + pass_len])
        .map_err(|_| AppError::Validation("Invalid service token: bad passphrase encoding".into()))?
        .to_string();

    let invite_bytes = packed[2 + pass_len..].to_vec();

    Ok((passphrase, invite_bytes))
}

/// Read ENVBUTLER_TOKEN from environment and fully decode to InvitePayload.
pub fn read_token_from_env() -> Result<team::InvitePayload, AppError> {
    let token_str = std::env::var(TOKEN_ENV_VAR).map_err(|_| {
        AppError::NotFound(format!(
            "{TOKEN_ENV_VAR} environment variable not set. Generate one with `env-butler ci generate-token`."
        ))
    })?;

    let (passphrase, invite_bytes) = decode_service_token(&token_str)?;
    team::parse_invite_token(&invite_bytes, &passphrase)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meta::SupabaseConfig;

    fn test_config() -> SupabaseConfig {
        SupabaseConfig {
            supabase_url: "https://test.supabase.co".into(),
            supabase_service_role_key: "eyJtest123".into(),
            supabase_anon_key: None,
            sync_folder: None,
        }
    }

    #[test]
    fn service_token_roundtrip() {
        let config = test_config();
        let passphrase = "ci-passphrase-secure";

        let token_str = generate_service_token("my-proj", "master-key", &config, "ci-bot", passphrase).unwrap();
        let (decoded_pass, invite_bytes) = decode_service_token(&token_str).unwrap();

        assert_eq!(decoded_pass, passphrase);

        let payload = team::parse_invite_token(&invite_bytes, passphrase).unwrap();
        assert_eq!(payload.vault_slug, "my-proj");
        assert_eq!(payload.master_key, "master-key");
    }

    #[test]
    fn base64_roundtrip() {
        let data = b"Hello, World! This is a test of base64 encoding.";
        let encoded = STANDARD.encode(data);
        let decoded = STANDARD.decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn empty_token_fails() {
        let result = decode_service_token("");
        assert!(result.is_err());
    }
}
