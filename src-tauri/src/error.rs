#![deny(unsafe_code)]

/// Application-wide error type exposed to Tauri frontend.
/// Serializes as a plain string (via Display) so the React UI gets readable messages.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    SecurityBlock(String),

    #[error("{0}")]
    Crypto(String),

    #[error("{0}")]
    Io(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Supabase(String),

    #[error("{0}")]
    Validation(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
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
