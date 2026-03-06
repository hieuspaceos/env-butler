pub mod crypto;
pub mod error;
pub mod file_sync;
pub mod meta;
pub mod recovery;
pub mod scanner;
pub mod supabase;
pub mod vault;

pub use error::AppError;
pub use meta::{ProjectsConfig, SupabaseConfig};
pub use scanner::ScannedFile;
