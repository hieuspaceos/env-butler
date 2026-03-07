//! Tauri commands for project management, Supabase config, and env file I/O.

use env_butler_core::{meta, scanner, AppError, SupabaseConfig};
use std::collections::HashMap;

use super::validate_file_path;

#[tauri::command]
pub async fn cmd_load_projects() -> Result<meta::ProjectsConfig, AppError> {
    meta::load_projects()
}

#[tauri::command]
pub async fn cmd_save_project_slug(path: String, slug: String) -> Result<(), AppError> {
    meta::upsert_project(&slug, &path)
}

#[tauri::command]
pub async fn cmd_remove_project(slug: String) -> Result<(), AppError> {
    meta::remove_project(&slug)
}

#[tauri::command]
pub async fn cmd_save_supabase_config(
    url: String,
    service_role_key: String,
    anon_key: Option<String>,
) -> Result<(), AppError> {
    // Validate Supabase URL format
    meta::validate_supabase_url(&url)?;
    if !service_role_key.starts_with("eyJ") {
        return Err(AppError::Validation(
            "Invalid key format. Use your Supabase Service Role Key (starts with eyJ...).".into(),
        ));
    }
    // Validate anon key format if provided
    if let Some(ref ak) = anon_key {
        let ak = ak.trim();
        if !ak.is_empty() && !ak.starts_with("eyJ") {
            return Err(AppError::Validation(
                "Invalid anon key format. Expected JWT starting with eyJ...".into(),
            ));
        }
    }
    let existing = meta::load_config().ok();
    // Prefer explicitly passed anon_key; fall back to existing if not provided
    let resolved_anon = anon_key
        .map(|k| {
            if k.trim().is_empty() {
                None
            } else {
                Some(k.trim().to_string())
            }
        })
        .unwrap_or_else(|| existing.as_ref().and_then(|c| c.supabase_anon_key.clone()));
    meta::save_config(&SupabaseConfig {
        supabase_url: url,
        supabase_service_role_key: service_role_key,
        supabase_anon_key: resolved_anon,
        sync_folder: existing.and_then(|c| c.sync_folder),
    })
}

#[tauri::command]
pub async fn cmd_save_sync_folder(folder: Option<String>) -> Result<(), AppError> {
    let mut config = meta::load_config().unwrap_or_default();
    config.sync_folder = folder;
    meta::save_config(&config)
}

#[tauri::command]
pub async fn cmd_load_supabase_config() -> Result<SupabaseConfig, AppError> {
    meta::load_config()
}

// -- Read local env files for diff comparison --

#[tauri::command]
pub async fn cmd_read_env_contents(path: String) -> Result<HashMap<String, String>, AppError> {
    let scanned = scanner::scan_project(&path, &[])?;
    let mut contents = HashMap::new();
    for file in scanned.iter().filter(|f| !f.blocked) {
        let c = std::fs::read_to_string(&file.path)
            .map_err(|e| AppError::Io(format!("Failed to read {}: {e}", file.filename)))?;
        contents.insert(file.filename.clone(), c);
    }
    Ok(contents)
}

// -- Write env files to project dir (with path traversal protection) --

#[tauri::command]
pub async fn cmd_write_env_files(
    project_path: String,
    files: HashMap<String, String>,
) -> Result<Vec<String>, AppError> {
    let project_dir = std::path::Path::new(&project_path).canonicalize()?;
    let mut written = Vec::new();
    for (filename, content) in &files {
        let target = validate_file_path(filename, &project_dir)?;
        std::fs::write(&target, content)?;
        written.push(filename.clone());
    }
    Ok(written)
}
