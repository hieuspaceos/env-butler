#![deny(unsafe_code)]

//! Envelope encryption for team vaults.
//! - Vault Key: random 256-bit AES key, encrypts .env data directly (no Argon2 overhead)
//! - Key wrapping: Vault Key encrypted per-member using their passphrase-derived key (Argon2id)
//! - Member identity: SHA-256 hash of passphrase-derived key bytes

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use zeroize::Zeroize;

use crate::crypto;
use crate::error::AppError;

const NONCE_LEN: usize = 12;

/// Generate a random 256-bit Vault Key for encrypting vault data.
pub fn generate_vault_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    key
}

/// Encrypt plaintext directly with a raw 256-bit key (no Argon2 derivation).
/// Returns: [nonce 12B][ciphertext + auth tag].
pub fn encrypt_with_key(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, AppError> {
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Crypto(format!("AES init: {e}")))?;

    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| AppError::Crypto(format!("AES encrypt: {e}")))?;

    let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);
    Ok(blob)
}

/// Decrypt blob (nonce + ciphertext) using a raw 256-bit key.
pub fn decrypt_with_key(blob: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, AppError> {
    if blob.len() < NONCE_LEN + 1 {
        return Err(AppError::Crypto("Envelope blob too short".into()));
    }

    let nonce_bytes = &blob[..NONCE_LEN];
    let ciphertext = &blob[NONCE_LEN..];

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Crypto(format!("AES init: {e}")))?;

    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Crypto("Decryption failed — wrong key or corrupted blob".into()))
}

/// Wrap (encrypt) a Vault Key with a member's passphrase.
/// Uses Argon2id derivation via the existing crypto module.
pub fn wrap_key(vault_key: &[u8; 32], passphrase: &str) -> Result<Vec<u8>, AppError> {
    crypto::encrypt(vault_key, passphrase)
}

/// Unwrap (decrypt) a Vault Key using a member's passphrase.
/// Returns the 32-byte Vault Key.
pub fn unwrap_key(wrapped: &[u8], passphrase: &str) -> Result<[u8; 32], AppError> {
    let decrypted = crypto::decrypt(wrapped, passphrase)?;
    if decrypted.len() != 32 {
        return Err(AppError::Crypto(format!(
            "Unwrapped key has invalid length: {} (expected 32)",
            decrypted.len()
        )));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&decrypted);
    Ok(key)
}

/// Compute a member identity hash from their passphrase.
/// Derives a key via Argon2id with a fixed salt, then SHA-256 hashes the result.
/// The fixed salt is acceptable here because we only need a stable identifier,
/// not protection against brute-force (the wrapped key blob has its own random salt).
pub fn compute_member_id(passphrase: &str) -> Result<String, AppError> {
    // Use a fixed, application-specific salt for deterministic member ID derivation
    let id_salt = b"env-butler-member-id-v2";
    let mut derived = crate::crypto::derive_key_with_salt(passphrase, id_salt)?;
    let mut hasher = Sha256::new();
    hasher.update(&derived);
    derived.zeroize();
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_key_generation_is_random() {
        let k1 = generate_vault_key();
        let k2 = generate_vault_key();
        assert_ne!(k1, k2);
    }

    #[test]
    fn encrypt_decrypt_with_key_roundtrip() {
        let key = generate_vault_key();
        let plaintext = b"DATABASE_URL=postgres://localhost\nSECRET=abc";

        let blob = encrypt_with_key(plaintext, &key).unwrap();
        let decrypted = decrypt_with_key(&blob, &key).unwrap();
        assert_eq!(plaintext.to_vec(), decrypted);
    }

    #[test]
    fn wrong_key_fails_decrypt() {
        let key1 = generate_vault_key();
        let key2 = generate_vault_key();

        let blob = encrypt_with_key(b"secret", &key1).unwrap();
        let result = decrypt_with_key(&blob, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn blob_too_short_fails() {
        let key = generate_vault_key();
        let result = decrypt_with_key(&[0u8; 5], &key);
        assert!(result.is_err());
    }

    #[test]
    fn unique_blobs_per_encrypt() {
        let key = generate_vault_key();
        let b1 = encrypt_with_key(b"same", &key).unwrap();
        let b2 = encrypt_with_key(b"same", &key).unwrap();
        assert_ne!(b1, b2); // different nonce each time
    }

    #[test]
    fn wrap_unwrap_vault_key_roundtrip() {
        let vault_key = generate_vault_key();
        let passphrase = "member-strong-passphrase-123";

        let wrapped = wrap_key(&vault_key, passphrase).unwrap();
        let unwrapped = unwrap_key(&wrapped, passphrase).unwrap();
        assert_eq!(vault_key, unwrapped);
    }

    #[test]
    fn wrong_passphrase_unwrap_fails() {
        let vault_key = generate_vault_key();
        let wrapped = wrap_key(&vault_key, "correct-passphrase!").unwrap();
        let result = unwrap_key(&wrapped, "wrong-passphrase!!");
        assert!(result.is_err());
    }

    #[test]
    fn member_id_is_deterministic() {
        let id1 = compute_member_id("my-passphrase-123").unwrap();
        let id2 = compute_member_id("my-passphrase-123").unwrap();
        assert_eq!(id1, id2);
        assert_eq!(id1.len(), 64); // SHA-256 hex = 64 chars
    }

    #[test]
    fn different_passphrases_different_ids() {
        let id1 = compute_member_id("passphrase-alpha").unwrap();
        let id2 = compute_member_id("passphrase-bravo").unwrap();
        assert_ne!(id1, id2);
    }

    #[test]
    fn full_envelope_flow() {
        // Owner creates vault key
        let vault_key = generate_vault_key();

        // Encrypt data with vault key
        let plaintext = b"API_KEY=sk_live_123\nDB_HOST=prod.db.internal";
        let encrypted = encrypt_with_key(plaintext, &vault_key).unwrap();

        // Wrap vault key for member A
        let member_a_pass = "member-a-strong-passphrase";
        let wrapped_a = wrap_key(&vault_key, member_a_pass).unwrap();

        // Wrap vault key for member B
        let member_b_pass = "member-b-strong-passphrase";
        let wrapped_b = wrap_key(&vault_key, member_b_pass).unwrap();

        // Member A unwraps and decrypts
        let key_a = unwrap_key(&wrapped_a, member_a_pass).unwrap();
        let data_a = decrypt_with_key(&encrypted, &key_a).unwrap();
        assert_eq!(plaintext.to_vec(), data_a);

        // Member B unwraps and decrypts
        let key_b = unwrap_key(&wrapped_b, member_b_pass).unwrap();
        let data_b = decrypt_with_key(&encrypted, &key_b).unwrap();
        assert_eq!(plaintext.to_vec(), data_b);

        // Member A cannot use Member B's wrapped key
        let result = unwrap_key(&wrapped_b, member_a_pass);
        assert!(result.is_err());
    }

    #[test]
    fn tampered_blob_fails() {
        let key = generate_vault_key();
        let mut blob = encrypt_with_key(b"sensitive data", &key).unwrap();
        // Flip a byte in the ciphertext
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;
        let result = decrypt_with_key(&blob, &key);
        assert!(result.is_err());
    }
}
