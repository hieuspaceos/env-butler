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
        // Canonicalize parent to catch symlink traversals
        let resolved_parent = target
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .ok_or_else(|| {
                AppError::SecurityBlock(format!(
                    "Cannot resolve parent directory for: {filename}"
                ))
            })?;
        if !resolved_parent.starts_with(&canonical) {
            return Err(AppError::SecurityBlock(format!(
                "Path traversal blocked: {filename}"
            )));
        }
        std::fs::write(&target, content)?;
        println!("  Wrote {}", filename);
        written.push(filename.clone());
    }

    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slug_from_path_normal() {
        let result = slug_from_path("/home/user/my-project");
        assert_eq!(result, "my-project");
    }

    #[test]
    fn test_slug_from_path_with_trailing_slash() {
        let result = slug_from_path("/home/user/my-project/");
        assert_eq!(result, "my-project");
    }

    #[test]
    fn test_slug_from_path_root() {
        let result = slug_from_path("/");
        assert_eq!(result, "project");
    }

    #[test]
    fn test_slug_from_path_empty_string() {
        let result = slug_from_path("");
        assert_eq!(result, "project");
    }

    #[test]
    fn test_slug_from_path_single_component() {
        let result = slug_from_path("my-project");
        assert_eq!(result, "my-project");
    }

    #[test]
    fn test_slug_from_path_with_spaces() {
        let result = slug_from_path("/home/user/my project");
        assert_eq!(result, "my project");
    }

    #[test]
    fn test_slug_from_path_with_special_chars() {
        let result = slug_from_path("/home/user/my-project-123");
        assert_eq!(result, "my-project-123");
    }

    #[test]
    fn test_write_files_to_dir_single_file() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let mut files = HashMap::new();
        files.insert(".env".to_string(), "KEY=value".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_ok());

        let written = result.unwrap();
        assert_eq!(written.len(), 1);
        assert_eq!(written[0], ".env");

        // Verify file was actually written
        let content = std::fs::read_to_string(temp_dir.path().join(".env"))
            .expect("Failed to read written file");
        assert_eq!(content, "KEY=value");
    }

    #[test]
    fn test_write_files_to_dir_multiple_files() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let mut files = HashMap::new();
        files.insert(".env".to_string(), "KEY1=value1".to_string());
        files.insert(".env.local".to_string(), "KEY2=value2".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_ok());

        let written = result.unwrap();
        assert_eq!(written.len(), 2);

        // Verify files were written
        let content1 = std::fs::read_to_string(temp_dir.path().join(".env"))
            .expect("Failed to read .env");
        assert_eq!(content1, "KEY1=value1");

        let content2 = std::fs::read_to_string(temp_dir.path().join(".env.local"))
            .expect("Failed to read .env.local");
        assert_eq!(content2, "KEY2=value2");
    }

    #[test]
    fn test_write_files_to_dir_blocks_parent_dir_traversal() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let mut files = HashMap::new();
        files.insert("../malicious.txt".to_string(), "bad".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_err());

        match result {
            Err(AppError::SecurityBlock(msg)) => {
                assert!(msg.contains("Blocked unsafe filename"));
            }
            _ => panic!("Expected SecurityBlock error"),
        }
    }

    #[test]
    fn test_write_files_to_dir_blocks_absolute_path_forward_slash() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let mut files = HashMap::new();
        files.insert("/etc/passwd".to_string(), "bad".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_err());

        match result {
            Err(AppError::SecurityBlock(msg)) => {
                assert!(msg.contains("Blocked unsafe filename"));
            }
            _ => panic!("Expected SecurityBlock error"),
        }
    }

    #[test]
    fn test_write_files_to_dir_blocks_absolute_path_backslash() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let mut files = HashMap::new();
        files.insert("\\windows\\system32".to_string(), "bad".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_err());

        match result {
            Err(AppError::SecurityBlock(msg)) => {
                assert!(msg.contains("Blocked unsafe filename"));
            }
            _ => panic!("Expected SecurityBlock error"),
        }
    }

    #[test]
    fn test_write_files_to_dir_blocks_double_dot_middle() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let mut files = HashMap::new();
        files.insert("subdir/../../../etc/passwd".to_string(), "bad".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_err());

        match result {
            Err(AppError::SecurityBlock(msg)) => {
                assert!(msg.contains("Blocked unsafe filename"));
            }
            _ => panic!("Expected SecurityBlock error"),
        }
    }

    #[test]
    fn test_write_files_to_dir_creates_subdirs() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");

        // Create a subdirectory first
        let subdir = temp_dir.path().join("subdir");
        std::fs::create_dir(&subdir).expect("Failed to create subdir");

        let mut files = HashMap::new();
        files.insert("subdir/.env".to_string(), "KEY=value".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_ok());

        let written = result.unwrap();
        assert_eq!(written.len(), 1);

        // Verify file was written in subdirectory
        let content = std::fs::read_to_string(subdir.join(".env"))
            .expect("Failed to read written file");
        assert_eq!(content, "KEY=value");
    }

    #[test]
    fn test_write_files_to_dir_overwrites_existing() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");

        // Write initial file
        let filepath = temp_dir.path().join(".env");
        std::fs::write(&filepath, "OLD=content").expect("Failed to write initial file");

        let mut files = HashMap::new();
        files.insert(".env".to_string(), "NEW=content".to_string());

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_ok());

        // Verify file was overwritten
        let content = std::fs::read_to_string(&filepath).expect("Failed to read file");
        assert_eq!(content, "NEW=content");
    }

    #[test]
    fn test_write_files_to_dir_empty_files_map() {
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let files = HashMap::new();

        let result = write_files_to_dir(&files, temp_dir.path());
        assert!(result.is_ok());

        let written = result.unwrap();
        assert_eq!(written.len(), 0);
    }
}
