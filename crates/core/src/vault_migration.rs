#![deny(unsafe_code)]

//! Migration from vault format v1 (password-based) to v2 (envelope encryption).
//!
//! Steps:
//! 1. Pull existing encrypted blob from Supabase
//! 2. Decrypt with owner's mnemonic (v1 password-based)
//! 3. Generate a random Vault Key
//! 4. Re-encrypt plaintext with Vault Key (envelope)
//! 5. Wrap Vault Key with owner's mnemonic-derived key
//! 6. Push updated blob + format_version=2 to Supabase
//! 7. Store owner as first vault_member

use crate::envelope;
use crate::error::AppError;
use crate::supabase_team::{VaultMember};

/// Result of a successful v1 → v2 migration
#[derive(Debug, Clone)]
pub struct MigrationResult {
    /// The new random Vault Key (caller should zeroize after use)
    pub vault_key: [u8; 32],
    /// Vault Key wrapped with owner's passphrase
    pub wrapped_vault_key: Vec<u8>,
    /// Owner's member_id (key hash)
    pub owner_member_id: String,
    /// Re-encrypted blob using Vault Key
    pub new_encrypted_blob: Vec<u8>,
    /// Original plaintext hash (unchanged)
    pub plaintext_hash: String,
    /// Backup of the original v1 encrypted blob
    pub backup_blob: String,
}

/// Migrate a vault from v1 (password-based) to v2 (envelope encryption).
/// Does NOT touch Supabase — returns data for caller to persist.
///
/// - `encrypted_blob_hex`: current v1 blob from Supabase (hex-encoded)
/// - `owner_mnemonic`: owner's mnemonic/passphrase used for v1 encryption
pub fn migrate_v1_to_v2(
    encrypted_blob_hex: &str,
    owner_mnemonic: &str,
) -> Result<MigrationResult, AppError> {
    // 1. Decode v1 blob
    let encrypted_bytes = hex::decode(encrypted_blob_hex)
        .map_err(|e| AppError::Crypto(format!("Decode v1 blob: {e}")))?;

    // 2. Decrypt with owner's mnemonic (v1 uses Argon2id password-based)
    let plaintext = crate::crypto::decrypt(&encrypted_bytes, owner_mnemonic)?;

    // 3. Compute plaintext hash (preserved across migration)
    let plaintext_hash = crate::vault::compute_plaintext_hash(&plaintext);

    // 4. Generate new Vault Key
    let vault_key = envelope::generate_vault_key();

    // 5. Re-encrypt with Vault Key (direct AES, no Argon2)
    let new_encrypted = envelope::encrypt_with_key(&plaintext, &vault_key)?;

    // 6. Wrap Vault Key with owner's mnemonic
    let wrapped = envelope::wrap_key(&vault_key, owner_mnemonic)?;

    // 7. Compute owner's member_id
    let owner_id = envelope::compute_member_id(owner_mnemonic)?;

    Ok(MigrationResult {
        vault_key,
        wrapped_vault_key: wrapped,
        owner_member_id: owner_id,
        new_encrypted_blob: new_encrypted,
        plaintext_hash,
        backup_blob: encrypted_blob_hex.to_string(),
    })
}

/// Build a VaultMember record for the owner after migration
pub fn build_owner_member(
    vault_slug: &str,
    result: &MigrationResult,
) -> VaultMember {
    VaultMember {
        id: None,
        vault_slug: vault_slug.to_string(),
        member_id: result.owner_member_id.clone(),
        wrapped_vault_key: hex::encode(&result.wrapped_vault_key),
        role: "owner".to_string(),
        created_by: Some(result.owner_member_id.clone()),
        created_at: None,
        revoked_at: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_v1_to_v2_roundtrip() {
        let mnemonic = "owner-mnemonic-phrase-for-testing";
        let plaintext = b"DATABASE_URL=postgres://prod\nAPI_KEY=sk_live_xyz";

        // Simulate v1: encrypt with password, hex-encode
        let v1_blob = crate::crypto::encrypt(plaintext, mnemonic).unwrap();
        let v1_hex = hex::encode(&v1_blob);

        // Migrate
        let result = migrate_v1_to_v2(&v1_hex, mnemonic).unwrap();

        // Verify: can decrypt with new vault key
        let decrypted = envelope::decrypt_with_key(&result.new_encrypted_blob, &result.vault_key).unwrap();
        assert_eq!(plaintext.to_vec(), decrypted);

        // Verify: can unwrap vault key with owner's mnemonic
        let unwrapped = envelope::unwrap_key(&result.wrapped_vault_key, mnemonic).unwrap();
        assert_eq!(result.vault_key, unwrapped);

        // Verify: plaintext hash preserved
        let expected_hash = crate::vault::compute_plaintext_hash(plaintext);
        assert_eq!(result.plaintext_hash, expected_hash);

        // Verify: backup preserved
        assert_eq!(result.backup_blob, v1_hex);
    }

    #[test]
    fn migrate_wrong_mnemonic_fails() {
        let v1_blob = crate::crypto::encrypt(b"secret", "correct-mnemonic-pass").unwrap();
        let v1_hex = hex::encode(&v1_blob);

        let result = migrate_v1_to_v2(&v1_hex, "wrong-mnemonic-phrase");
        assert!(result.is_err());
    }

    #[test]
    fn migrate_invalid_hex_fails() {
        let result = migrate_v1_to_v2("not-valid-hex!!!", "any-mnemonic");
        assert!(result.is_err());
    }

    #[test]
    fn build_owner_member_record() {
        let mnemonic = "owner-test-mnemonic-phrase-123";
        let v1_blob = crate::crypto::encrypt(b"data", mnemonic).unwrap();
        let v1_hex = hex::encode(&v1_blob);

        let result = migrate_v1_to_v2(&v1_hex, mnemonic).unwrap();
        let member = build_owner_member("my-project", &result);

        assert_eq!(member.vault_slug, "my-project");
        assert_eq!(member.member_id, result.owner_member_id);
        assert_eq!(member.role, "owner");
        assert!(member.revoked_at.is_none());
    }
}
