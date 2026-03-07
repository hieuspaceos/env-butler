//! Tauri commands for vault scan, encrypt, decrypt, and Supabase push/pull.

use env_butler_core::{crypto, meta, recovery, scanner, supabase, vault, AppError, ScannedFile};
use serde::Serialize;
use std::collections::HashMap;

use super::validate_file_path;

/// Encrypted vault payload returned to frontend for push
#[derive(Debug, Serialize)]
pub struct EncryptedPayload {
    pub blob_hex: String,
    pub plaintext_hash: String,
    pub manifest: Vec<ScannedFile>,
}

/// Decrypted vault contents returned to frontend for pull
#[derive(Debug, Serialize)]
pub struct DecryptedManifest {
    pub files: HashMap<String, String>,
}

#[tauri::command]
pub async fn cmd_scan_project(path: String) -> Result<Vec<ScannedFile>, AppError> {
    scanner::scan_project(&path, &[])
}

#[tauri::command]
pub async fn cmd_encrypt_and_prepare(
    path: String,
    password: String,
) -> Result<EncryptedPayload, AppError> {
    let scanned = scanner::scan_project(&path, &[])?;
    let allowed: Vec<&ScannedFile> = scanned.iter().filter(|f| !f.blocked).collect();
    if allowed.is_empty() {
        return Err(AppError::NotFound("No .env files found to sync".into()));
    }

    let zip_bytes = vault::create_vault_zip(&scanned)?;
    let plaintext_hash = vault::compute_plaintext_hash(&zip_bytes);
    let blob = crypto::encrypt(&zip_bytes, &password)?;
    let blob_hex = hex::encode(&blob);

    Ok(EncryptedPayload {
        blob_hex,
        plaintext_hash,
        manifest: scanned,
    })
}

#[tauri::command]
pub async fn cmd_decrypt_vault(
    blob_hex: String,
    password: String,
) -> Result<DecryptedManifest, AppError> {
    let blob =
        hex::decode(&blob_hex).map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    let files = vault::extract_vault_zip(&zip_bytes)?;
    Ok(DecryptedManifest { files })
}

#[tauri::command]
pub async fn cmd_generate_recovery_kit() -> Result<String, AppError> {
    recovery::generate_mnemonic()
}

#[tauri::command]
pub async fn cmd_validate_mnemonic(mnemonic: String) -> Result<String, AppError> {
    recovery::mnemonic_to_password(&mnemonic)
}

#[tauri::command]
pub async fn cmd_push_to_supabase(
    slug: String,
    blob_hex: String,
    plaintext_hash: String,
    metadata: serde_json::Value,
) -> Result<(), AppError> {
    let config = meta::load_config()?;
    supabase::push_vault(&config, &slug, &blob_hex, &plaintext_hash, Some(metadata)).await?;
    meta::update_sync_state(&slug, &plaintext_hash)?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_pull_from_supabase(slug: String) -> Result<supabase::VaultRecord, AppError> {
    let config = meta::load_config()?;
    supabase::pull_vault(&config, &slug).await
}

#[tauri::command]
pub async fn cmd_check_conflict(
    slug: String,
    remote_hash: String,
    local_hash: String,
) -> Result<supabase::ConflictStatus, AppError> {
    let project = meta::get_project(&slug)?;
    let last_hash = project.and_then(|p| p.last_sync_hash);
    Ok(supabase::check_conflict(
        &local_hash,
        &remote_hash,
        last_hash.as_deref(),
    ))
}

#[tauri::command]
pub async fn cmd_decrypt_and_apply(
    blob_hex: String,
    password: String,
    project_path: String,
    slug: String,
) -> Result<Vec<String>, AppError> {
    let blob =
        hex::decode(&blob_hex).map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    let plaintext_hash = vault::compute_plaintext_hash(&zip_bytes);
    let files = vault::extract_vault_zip(&zip_bytes)?;

    // Write files to project directory (with path traversal protection)
    let project_dir = std::path::Path::new(&project_path).canonicalize()?;
    let mut written = Vec::new();
    for (filename, content) in &files {
        let target = validate_file_path(filename, &project_dir)?;
        std::fs::write(&target, content)?;
        written.push(filename.clone());
    }

    meta::update_sync_state(&slug, &plaintext_hash)?;
    Ok(written)
}

#[tauri::command]
pub async fn cmd_decrypt_for_diff(
    blob_hex: String,
    password: String,
) -> Result<HashMap<String, String>, AppError> {
    let blob =
        hex::decode(&blob_hex).map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    vault::extract_vault_zip(&zip_bytes)
}
