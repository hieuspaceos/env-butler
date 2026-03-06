#![deny(unsafe_code)]

/// Application-wide error type exposed to Tauri frontend.
/// All variants serialize to JSON for the React UI to handle.
#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("Security block: {0}")]
    SecurityBlock(String),

    #[error("Crypto error: {0}")]
    Crypto(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Supabase error: {0}")]
    Supabase(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<zip::result::ZipError> for AppError {
    fn from(e: zip::result::ZipError) -> Self {
        AppError::Io(format!("Zip error: {e}"))
    }
}
