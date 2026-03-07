//! AES-256-GCM encryption + Argon2id key derivation.
//! Blob format: [salt 16B][nonce 12B][ciphertext...]

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::rngs::OsRng;
use rand::RngCore;
use zeroize::Zeroize;

use crate::error::AppError;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

// Argon2id params: 64MB memory, 3 iterations, 1 lane
const ARGON2_M_COST: u32 = 65536;
const ARGON2_T_COST: u32 = 3;
const ARGON2_P_COST: u32 = 1;

/// Derive a 32-byte AES key from password + salt using Argon2id.
fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], AppError> {
    let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(32))
        .map_err(|e| AppError::Crypto(format!("Argon2 params: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Crypto(format!("Argon2 hash: {e}")))?;

    Ok(key)
}

/// Encrypt plaintext bytes. Returns blob: [salt 16B][nonce 12B][ciphertext].
/// Generates fresh random salt and nonce per call.
pub fn encrypt(plaintext: &[u8], password: &str) -> Result<Vec<u8>, AppError> {
    // Generate random salt and nonce
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce_bytes);

    // Derive key from password + salt
    let mut key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Crypto(format!("AES init: {e}")))?;

    // Encrypt
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| AppError::Crypto(format!("AES encrypt: {e}")))?;

    // Wipe key from memory
    key.zeroize();

    // Pack blob: salt + nonce + ciphertext
    let mut blob = Vec::with_capacity(SALT_LEN + NONCE_LEN + ciphertext.len());
    blob.extend_from_slice(&salt);
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);

    Ok(blob)
}

/// Decrypt blob (salt + nonce + ciphertext) using password.
pub fn decrypt(blob: &[u8], password: &str) -> Result<Vec<u8>, AppError> {
    let min_len = SALT_LEN + NONCE_LEN + 1;
    if blob.len() < min_len {
        return Err(AppError::Crypto("Blob too short".into()));
    }

    let salt = &blob[..SALT_LEN];
    let nonce_bytes = &blob[SALT_LEN..SALT_LEN + NONCE_LEN];
    let ciphertext = &blob[SALT_LEN + NONCE_LEN..];

    let mut key = derive_key(password, salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Crypto(format!("AES init: {e}")))?;

    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Crypto("Decryption failed — wrong password or corrupted blob".into()))?;

    key.zeroize();

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let password = "test-master-key-2026";
        let plaintext = b"DATABASE_URL=postgres://localhost/mydb\nAPI_KEY=sk_test_123";

        let blob = encrypt(plaintext, password).unwrap();
        let decrypted = decrypt(&blob, password).unwrap();

        assert_eq!(plaintext.to_vec(), decrypted);
    }

    #[test]
    fn wrong_password_fails() {
        let blob = encrypt(b"secret data", "correct-password").unwrap();
        let result = decrypt(&blob, "wrong-password");
        assert!(result.is_err());
    }

    #[test]
    fn blob_too_short_fails() {
        let result = decrypt(&[0u8; 10], "any-password");
        assert!(result.is_err());
    }

    #[test]
    fn unique_blobs_per_encrypt() {
        let blob1 = encrypt(b"same data", "same-password").unwrap();
        let blob2 = encrypt(b"same data", "same-password").unwrap();
        // Different salt+nonce each time
        assert_ne!(blob1, blob2);
    }
}
