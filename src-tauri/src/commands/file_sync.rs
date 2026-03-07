//! Tauri commands for local file sync: export, import, folder push/pull.

use env_butler_core::{file_sync, meta, AppError};
use std::collections::HashMap;

#[tauri::command]
pub async fn cmd_export_vault(
    project_path: String,
    password: String,
) -> Result<Vec<u8>, AppError> {
    file_sync::export_vault(&project_path, &password)
}

#[tauri::command]
pub async fn cmd_import_vault(
    file_bytes: Vec<u8>,
    password: String,
) -> Result<HashMap<String, String>, AppError> {
    file_sync::import_vault(&file_bytes, &password)
}

#[tauri::command]
pub async fn cmd_folder_push(
    slug: String,
    project_path: String,
    password: String,
) -> Result<String, AppError> {
    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Go to Settings.".into())
    })?;
    file_sync::push_to_folder(&folder, &slug, &project_path, &password)
}

#[tauri::command]
pub async fn cmd_folder_pull(
    slug: String,
    password: String,
) -> Result<HashMap<String, String>, AppError> {
    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Go to Settings.".into())
    })?;
    file_sync::pull_from_folder(&folder, &slug, &password)
}
