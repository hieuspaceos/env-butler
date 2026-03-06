#![deny(unsafe_code)]

//! CI/CD service token: base64-encoded package bundling passphrase + invite token.
//! Single string safe for env var storage (ENVBUTLER_TOKEN).
//! Format: base64(passphrase_len:u16_le | passphrase_bytes | invite_token_bytes)

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

    Ok(base64_encode(&packed))
}

/// Decode a service token from base64 string → (passphrase, invite_token_bytes).
pub fn decode_service_token(token_str: &str) -> Result<(String, Vec<u8>), AppError> {
    let packed = base64_decode(token_str)?;

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

// Simple base64 encode/decode using standard alphabet (no external dep needed)
fn base64_encode(data: &[u8]) -> String {
    use base64_alphabet::STANDARD;
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(STANDARD[(triple >> 18) & 0x3F]);
        result.push(STANDARD[(triple >> 12) & 0x3F]);
        if chunk.len() > 1 {
            result.push(STANDARD[(triple >> 6) & 0x3F]);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(STANDARD[triple & 0x3F]);
        } else {
            result.push('=');
        }
    }
    result
}

fn base64_decode(input: &str) -> Result<Vec<u8>, AppError> {
    let input = input.trim();
    if input.is_empty() {
        return Err(AppError::Validation("Empty service token".into()));
    }
    let mut result = Vec::new();
    let chars: Vec<u8> = input.bytes().collect();
    for chunk in chars.chunks(4) {
        if chunk.len() < 4 {
            return Err(AppError::Validation("Invalid service token: bad base64".into()));
        }
        let vals: Result<Vec<u8>, _> = chunk.iter().map(|&c| b64_val(c)).collect();
        let vals = vals.map_err(|_| AppError::Validation("Invalid service token: bad base64 char".into()))?;
        result.push((vals[0] << 2) | (vals[1] >> 4));
        if chunk[2] != b'=' {
            result.push((vals[1] << 4) | (vals[2] >> 2));
        }
        if chunk[3] != b'=' {
            result.push((vals[2] << 6) | vals[3]);
        }
    }
    Ok(result)
}

fn b64_val(c: u8) -> Result<u8, ()> {
    match c {
        b'A'..=b'Z' => Ok(c - b'A'),
        b'a'..=b'z' => Ok(c - b'a' + 26),
        b'0'..=b'9' => Ok(c - b'0' + 52),
        b'+' => Ok(62),
        b'/' => Ok(63),
        b'=' => Ok(0),
        _ => Err(()),
    }
}

mod base64_alphabet {
    pub const STANDARD: [char; 64] = [
        'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P',
        'Q','R','S','T','U','V','W','X','Y','Z','a','b','c','d','e','f',
        'g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v',
        'w','x','y','z','0','1','2','3','4','5','6','7','8','9','+','/',
    ];
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meta::SupabaseConfig;

    fn test_config() -> SupabaseConfig {
        SupabaseConfig {
            supabase_url: "https://test.supabase.co".into(),
            supabase_service_role_key: "eyJtest123".into(),
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
        let encoded = base64_encode(data);
        let decoded = base64_decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn empty_token_fails() {
        let result = decode_service_token("");
        assert!(result.is_err());
    }
}
