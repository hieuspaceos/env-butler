//! Shared CLI helper functions: password prompts, path resolution, file writing.

use env_butler_core::{meta, AppError};
use std::collections::HashMap;
use std::path::Path;

/// Prompt for Master Key password (hidden input)
pub fn ask_password(prompt: &str) -> Result<String, AppError> {
    eprint!("{}", prompt);
    let password = rpassword::read_password()
        .map_err(|e| AppError::Io(format!("Failed to read password: {e}")))?;
    if password.is_empty() {
        return Err(AppError::Validation("Password cannot be empty".into()));
    }
    Ok(password)
}

/// Get current directory as string
pub fn current_dir_str() -> Result<String, AppError> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Derive slug from directory name
pub fn slug_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string())
}

/// Resolve project slug: lookup registered project first, fallback to dir name.
/// Returns (slug, path). Ensures project is registered for push/pull.
pub fn resolve_project(require_init: bool) -> Result<(String, String), AppError> {
    let path = current_dir_str()?;
    let slug = slug_from_path(&path);

    if require_init {
        let project = meta::get_project(&slug)?;
        if project.is_none() {
            return Err(AppError::Validation(
                "Project not initialized. Run `env-butler init` in this directory first."
                    .to_string(),
            ));
        }
    }

    Ok((slug, path))
}

/// Write decrypted files to project directory with path traversal protection
pub fn write_files_to_dir(
    files: &HashMap<String, String>,
    project_dir: &Path,
) -> Result<Vec<String>, AppError> {
    let canonical = project_dir.canonicalize()?;
    let mut written = Vec::new();

    for (filename, content) in files {
        if filename.contains("..") || filename.starts_with('/') || filename.starts_with('\\') {
            return Err(AppError::SecurityBlock(format!(
                "Blocked unsafe filename: {filename}"
            )));
        }
        let target = canonical.join(filename);
        std::fs::write(&target, content)?;
        println!("  Wrote {}", filename);
        written.push(filename.clone());
    }

    Ok(written)
}
