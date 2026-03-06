mod crypto;
mod error;
mod file_sync;
mod meta;
mod recovery;
mod scanner;
mod supabase;
mod vault;

use error::AppError;
use meta::{ProjectsConfig, SupabaseConfig};
use scanner::ScannedFile;
use serde::Serialize;
use std::collections::HashMap;

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

// -- Tauri Commands --

#[tauri::command]
async fn cmd_scan_project(path: String) -> Result<Vec<ScannedFile>, AppError> {
    scanner::scan_project(&path, &[])
}

#[tauri::command]
async fn cmd_encrypt_and_prepare(path: String, password: String) -> Result<EncryptedPayload, AppError> {
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
async fn cmd_decrypt_vault(blob_hex: String, password: String) -> Result<DecryptedManifest, AppError> {
    let blob = hex::decode(&blob_hex)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    let files = vault::extract_vault_zip(&zip_bytes)?;
    Ok(DecryptedManifest { files })
}

#[tauri::command]
async fn cmd_generate_recovery_kit() -> Result<String, AppError> {
    recovery::generate_mnemonic()
}

#[tauri::command]
async fn cmd_validate_mnemonic(mnemonic: String) -> Result<String, AppError> {
    recovery::mnemonic_to_password(&mnemonic)
}

#[tauri::command]
async fn cmd_load_projects() -> Result<ProjectsConfig, AppError> {
    meta::load_projects()
}

#[tauri::command]
async fn cmd_save_project_slug(path: String, slug: String) -> Result<(), AppError> {
    meta::upsert_project(&slug, &path)
}

#[tauri::command]
async fn cmd_remove_project(slug: String) -> Result<(), AppError> {
    meta::remove_project(&slug)
}

// -- Phase 4: Supabase sync commands --

#[tauri::command]
async fn cmd_push_to_supabase(
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
async fn cmd_pull_from_supabase(slug: String) -> Result<supabase::VaultRecord, AppError> {
    let config = meta::load_config()?;
    supabase::pull_vault(&config, &slug).await
}

#[tauri::command]
async fn cmd_check_conflict(
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
async fn cmd_decrypt_and_apply(
    blob_hex: String,
    password: String,
    project_path: String,
    slug: String,
) -> Result<Vec<String>, AppError> {
    let blob = hex::decode(&blob_hex)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    let plaintext_hash = vault::compute_plaintext_hash(&zip_bytes);
    let files = vault::extract_vault_zip(&zip_bytes)?;

    // Write files to project directory (with path traversal protection)
    let project_dir = std::path::Path::new(&project_path).canonicalize()?;
    let mut written = Vec::new();
    for (filename, content) in &files {
        // Block path traversal: reject filenames with ".." or absolute paths
        if filename.contains("..") || filename.starts_with('/') || filename.starts_with('\\') {
            return Err(AppError::SecurityBlock(format!(
                "Blocked unsafe filename in vault: {filename}"
            )));
        }
        let target = project_dir.join(filename);
        // Double-check resolved path stays inside project directory
        let resolved = target.parent().map(|p| p.to_path_buf()).unwrap_or(target.clone());
        if !resolved.starts_with(&project_dir) {
            return Err(AppError::SecurityBlock(format!(
                "Path traversal blocked: {filename}"
            )));
        }
        std::fs::write(&target, content)?;
        written.push(filename.clone());
    }

    // Update sync state
    meta::update_sync_state(&slug, &plaintext_hash)?;

    Ok(written)
}

#[tauri::command]
async fn cmd_decrypt_for_diff(
    blob_hex: String,
    password: String,
) -> Result<HashMap<String, String>, AppError> {
    let blob = hex::decode(&blob_hex)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    vault::extract_vault_zip(&zip_bytes)
}

// -- Local file sync commands --

#[tauri::command]
async fn cmd_export_vault(project_path: String, password: String) -> Result<Vec<u8>, AppError> {
    file_sync::export_vault(&project_path, &password)
}

#[tauri::command]
async fn cmd_import_vault(file_bytes: Vec<u8>, password: String) -> Result<HashMap<String, String>, AppError> {
    file_sync::import_vault(&file_bytes, &password)
}

#[tauri::command]
async fn cmd_folder_push(slug: String, project_path: String, password: String) -> Result<String, AppError> {
    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Go to Settings.".into())
    })?;
    file_sync::push_to_folder(&folder, &slug, &project_path, &password)
}

#[tauri::command]
async fn cmd_folder_pull(slug: String, password: String) -> Result<HashMap<String, String>, AppError> {
    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Go to Settings.".into())
    })?;
    file_sync::pull_from_folder(&folder, &slug, &password)
}

#[tauri::command]
async fn cmd_save_supabase_config(url: String, service_role_key: String) -> Result<(), AppError> {
    // Validate: service_role key should start with "eyJ" (JWT format)
    if !service_role_key.starts_with("eyJ") {
        return Err(AppError::Validation(
            "Invalid key format. Use your Supabase Service Role Key (starts with eyJ...).".into(),
        ));
    }
    // Preserve existing sync_folder when saving Supabase config
    let existing = meta::load_config().ok();
    meta::save_config(&SupabaseConfig {
        supabase_url: url,
        supabase_service_role_key: service_role_key,
        sync_folder: existing.and_then(|c| c.sync_folder),
    })
}

#[tauri::command]
async fn cmd_save_sync_folder(folder: Option<String>) -> Result<(), AppError> {
    let mut config = meta::load_config().unwrap_or_default();
    config.sync_folder = folder;
    meta::save_config(&config)
}

#[tauri::command]
async fn cmd_load_supabase_config() -> Result<SupabaseConfig, AppError> {
    meta::load_config()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_scan_project,
            cmd_encrypt_and_prepare,
            cmd_decrypt_vault,
            cmd_generate_recovery_kit,
            cmd_validate_mnemonic,
            cmd_load_projects,
            cmd_save_project_slug,
            cmd_remove_project,
            cmd_push_to_supabase,
            cmd_pull_from_supabase,
            cmd_check_conflict,
            cmd_decrypt_and_apply,
            cmd_decrypt_for_diff,
            cmd_export_vault,
            cmd_import_vault,
            cmd_folder_push,
            cmd_folder_pull,
            cmd_save_sync_folder,
            cmd_save_supabase_config,
            cmd_load_supabase_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
