#![deny(unsafe_code)]

//! BIP39 24-word mnemonic generation for Master Key recovery.
//! The mnemonic phrase IS the recovery key — user prints/saves offline.

use bip39::{Language, Mnemonic, MnemonicType};

use crate::error::AppError;

/// Generate a new 24-word BIP39 mnemonic recovery phrase.
pub fn generate_mnemonic() -> Result<String, AppError> {
    let mnemonic = Mnemonic::new(MnemonicType::Words24, Language::English);
    Ok(mnemonic.into_phrase())
}

/// Convert a mnemonic phrase into a password string for key derivation.
/// Normalizes: lowercase, trim, single-space between words.
pub fn mnemonic_to_password(mnemonic: &str) -> Result<String, AppError> {
    // Validate the mnemonic by parsing it
    let parsed = Mnemonic::from_phrase(mnemonic.trim(), Language::English)
        .map_err(|e| AppError::Crypto(format!("Invalid mnemonic: {e}")))?;

    Ok(parsed.into_phrase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_produces_24_words() {
        let phrase = generate_mnemonic().unwrap();
        let words: Vec<&str> = phrase.split_whitespace().collect();
        assert_eq!(words.len(), 24);
    }

    #[test]
    fn mnemonic_roundtrip() {
        let phrase = generate_mnemonic().unwrap();
        let password = mnemonic_to_password(&phrase).unwrap();
        assert_eq!(phrase, password);
    }

    #[test]
    fn invalid_mnemonic_fails() {
        let result = mnemonic_to_password("not a valid mnemonic phrase at all");
        assert!(result.is_err());
    }

    #[test]
    fn mnemonic_derives_consistent_key() {
        let phrase = generate_mnemonic().unwrap();
        let pw1 = mnemonic_to_password(&phrase).unwrap();
        let pw2 = mnemonic_to_password(&phrase).unwrap();
        assert_eq!(pw1, pw2);
    }
}
