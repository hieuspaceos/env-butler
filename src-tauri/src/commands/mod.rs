//! Tauri command modules — split by domain for maintainability.
//! All commands are re-exported here for use in generate_handler![].

pub mod file_sync;
pub mod project;
pub mod sync;
pub mod team;

use env_butler_core::AppError;

/// Validate filename and resolve target path with path traversal protection.
/// Returns the validated target path within project_dir.
pub fn validate_file_path(
    filename: &str,
    project_dir: &std::path::Path,
) -> Result<std::path::PathBuf, AppError> {
    if filename.contains("..") || filename.starts_with('/') || filename.starts_with('\\') {
        return Err(AppError::SecurityBlock(format!(
            "Blocked unsafe filename: {filename}"
        )));
    }
    let target = project_dir.join(filename);
    // Canonicalize target's parent to catch symlink traversals
    let resolved = target
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .ok_or_else(|| {
            AppError::SecurityBlock(format!("Cannot resolve parent directory for: {filename}"))
        })?;
    if !resolved.starts_with(project_dir) {
        return Err(AppError::SecurityBlock(format!(
            "Path traversal blocked: {filename}"
        )));
    }
    Ok(target)
}

