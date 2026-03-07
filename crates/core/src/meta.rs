//! ~/.env-butler/ metadata directory management.
//! Tracks project slugs, paths, and sync state in projects.json.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Top-level projects.json structure
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectsConfig {
    pub projects: HashMap<String, ProjectEntry>,
}

/// Single project entry with sync metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    pub slug: String,
    pub path: String,
    pub last_sync_hash: Option<String>,
    pub last_sync_at: Option<DateTime<Utc>>,
}

/// Get the metadata directory path: ~/.env-butler/
fn meta_dir() -> Result<PathBuf, AppError> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Io("Cannot find home directory".into()))?;
    Ok(home.join(".env-butler"))
}

/// Get the projects.json file path
fn projects_file() -> Result<PathBuf, AppError> {
    Ok(meta_dir()?.join("projects.json"))
}

/// Ensure ~/.env-butler/ directory exists
fn ensure_meta_dir() -> Result<(), AppError> {
    let dir = meta_dir()?;
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(())
}

/// Load projects.json. Returns empty config if file doesn't exist.
pub fn load_projects() -> Result<ProjectsConfig, AppError> {
    let path = projects_file()?;
    if !path.exists() {
        return Ok(ProjectsConfig::default());
    }

    let content = fs::read_to_string(&path)?;
    serde_json::from_str(&content).map_err(|e| AppError::Io(format!("Parse projects.json: {e}")))
}

/// Save projects.json to disk.
pub fn save_projects(config: &ProjectsConfig) -> Result<(), AppError> {
    ensure_meta_dir()?;
    let path = projects_file()?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::Io(format!("Serialize projects.json: {e}")))?;
    fs::write(&path, content)?;
    Ok(())
}

/// Add or update a project entry.
pub fn upsert_project(slug: &str, project_path: &str) -> Result<(), AppError> {
    let mut config = load_projects()?;
    config.projects.insert(
        slug.to_string(),
        ProjectEntry {
            slug: slug.to_string(),
            path: project_path.to_string(),
            last_sync_hash: None,
            last_sync_at: None,
        },
    );
    save_projects(&config)
}

/// Remove a project by slug.
pub fn remove_project(slug: &str) -> Result<(), AppError> {
    let mut config = load_projects()?;
    config.projects.remove(slug);
    save_projects(&config)
}

/// Update sync state after a successful push/pull.
pub fn update_sync_state(slug: &str, hash: &str) -> Result<(), AppError> {
    let mut config = load_projects()?;
    let entry = config
        .projects
        .get_mut(slug)
        .ok_or_else(|| AppError::NotFound(format!("Project not found: {slug}")))?;

    entry.last_sync_hash = Some(hash.to_string());
    entry.last_sync_at = Some(Utc::now());

    save_projects(&config)
}

/// Get sync state for a project.
pub fn get_project(slug: &str) -> Result<Option<ProjectEntry>, AppError> {
    let config = load_projects()?;
    Ok(config.projects.get(slug).cloned())
}

// -- Supabase config management --

/// Supabase connection config stored in ~/.env-butler/config.json
/// Uses service_role key (not anon key) to bypass RLS — safe because self-hosted.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SupabaseConfig {
    pub supabase_url: String,
    /// Service role key — has full DB access, bypasses RLS.
    /// Safe for self-hosted single-user: the key stays local on user's machine.
    #[serde(alias = "supabase_anon_key")]
    pub supabase_service_role_key: String,
    /// Optional sync folder path (Google Drive, iCloud, Dropbox, etc.)
    /// When set, Push/Pull can use this folder instead of Supabase.
    #[serde(default)]
    pub sync_folder: Option<String>,
}

/// Get the config.json file path
fn config_file() -> Result<PathBuf, AppError> {
    Ok(meta_dir()?.join("config.json"))
}

/// Load Supabase config from disk.
pub fn load_config() -> Result<SupabaseConfig, AppError> {
    let path = config_file()?;
    if !path.exists() {
        return Err(AppError::NotFound("Supabase not configured. Go to Settings.".into()));
    }
    let content = fs::read_to_string(&path)?;
    serde_json::from_str(&content).map_err(|e| AppError::Io(format!("Parse config.json: {e}")))
}

/// Save Supabase config to disk.
pub fn save_config(config: &SupabaseConfig) -> Result<(), AppError> {
    ensure_meta_dir()?;
    let path = config_file()?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::Io(format!("Serialize config.json: {e}")))?;
    fs::write(&path, content)?;

    // Set file permission 600 (owner read/write only) — config contains service_role key
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: meta.rs tests interact with real filesystem at ~/.env-butler/
    // Integration tests would use a temp dir override — skipped here for safety.

    #[test]
    fn default_config_is_empty() {
        let config = ProjectsConfig::default();
        assert!(config.projects.is_empty());
    }

    #[test]
    fn serialization_roundtrip() {
        let mut config = ProjectsConfig::default();
        config.projects.insert(
            "my-project".into(),
            ProjectEntry {
                slug: "my-project".into(),
                path: "/Users/test/project".into(),
                last_sync_hash: Some("abc123".into()),
                last_sync_at: Some(Utc::now()),
            },
        );

        let json = serde_json::to_string(&config).unwrap();
        let parsed: ProjectsConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.projects.len(), 1);
        assert_eq!(parsed.projects["my-project"].slug, "my-project");
    }
}
