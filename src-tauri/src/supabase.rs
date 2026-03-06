#![deny(unsafe_code)]

//! HTTP push/pull to self-hosted Supabase vault table via reqwest.
//! Uses rustls for TLS — no OpenSSL dependency.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::error::AppError;
use crate::meta::SupabaseConfig;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Convert raw Supabase error response into a user-friendly message
fn friendly_error(status: reqwest::StatusCode, body: &str) -> String {
    // Try to parse Supabase PostgREST error JSON
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(msg) = json.get("message").and_then(|m| m.as_str()) {
            // Table not found
            if msg.contains("Could not find the table") {
                return "Vault table not found. Run the migration SQL in your Supabase SQL Editor first.".into();
            }
            // Permission denied
            if msg.contains("permission denied") || msg.contains("row-level security") {
                return "Permission denied. Check your Supabase RLS policies.".into();
            }
            return msg.to_string();
        }
    }

    match status.as_u16() {
        401 => "Invalid Supabase credentials. Check your URL and Anon Key in Settings.".into(),
        403 => "Access forbidden. Check your Supabase RLS policies.".into(),
        404 => "Vault table not found. Run the migration SQL in your Supabase SQL Editor.".into(),
        500..=599 => "Supabase server error. Try again later.".into(),
        _ => format!("Supabase error ({status}): {body}"),
    }
}

/// Record stored in Supabase vault table
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRecord {
    pub project_slug: String,
    pub encrypted_blob: String,
    pub plaintext_hash: String,
    pub metadata: Option<serde_json::Value>,
    pub updated_at: Option<String>,
}

/// Build a reqwest client with Supabase auth headers
fn build_client(config: &SupabaseConfig) -> Result<(Client, String), AppError> {
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| AppError::Supabase(format!("HTTP client init: {e}")))?;

    let base_url = config.supabase_url.trim_end_matches('/');
    Ok((client, base_url.to_string()))
}

/// Push (upsert) encrypted vault blob to Supabase.
pub async fn push_vault(
    config: &SupabaseConfig,
    slug: &str,
    blob_hex: &str,
    plaintext_hash: &str,
    metadata: Option<serde_json::Value>,
) -> Result<(), AppError> {
    let (client, base_url) = build_client(config)?;
    let url = format!("{base_url}/rest/v1/vault?on_conflict=project_slug");

    let body = serde_json::json!({
        "project_slug": slug,
        "encrypted_blob": blob_hex,
        "plaintext_hash": plaintext_hash,
        "metadata": metadata,
    });

    let response = client
        .post(&url)
        .header("apikey", &config.supabase_anon_key)
        .header("Authorization", format!("Bearer {}", config.supabase_anon_key))
        .header("Content-Type", "application/json")
        // Upsert: merge on conflict (project_slug is UNIQUE)
        .header("Prefer", "resolution=merge-duplicates")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Push request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(friendly_error(status, &body)));
    }

    Ok(())
}

/// Pull encrypted vault blob from Supabase by project slug.
pub async fn pull_vault(
    config: &SupabaseConfig,
    slug: &str,
) -> Result<VaultRecord, AppError> {
    let (client, base_url) = build_client(config)?;
    let url = format!(
        "{base_url}/rest/v1/vault?project_slug=eq.{slug}&select=*",
    );

    let response = client
        .get(&url)
        .header("apikey", &config.supabase_anon_key)
        .header("Authorization", format!("Bearer {}", config.supabase_anon_key))
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Pull request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(friendly_error(status, &body)));
    }

    let records: Vec<VaultRecord> = response
        .json()
        .await
        .map_err(|e| AppError::Supabase(format!("Parse response: {e}")))?;

    records
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound(format!("No vault found for project: {slug}")))
}

/// Conflict status returned to frontend
#[derive(Debug, Clone, Serialize)]
pub enum ConflictStatus {
    InSync,
    SafePull,
    PushReminder,
    Conflict,
}

/// Check conflict state between local files and remote vault.
pub fn check_conflict(
    local_hash: &str,
    remote_hash: &str,
    last_sync_hash: Option<&str>,
) -> ConflictStatus {
    if local_hash == remote_hash {
        return ConflictStatus::InSync;
    }

    match last_sync_hash {
        Some(last) if local_hash == last => ConflictStatus::SafePull,
        Some(last) if remote_hash == last => ConflictStatus::PushReminder,
        _ => ConflictStatus::Conflict,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conflict_in_sync() {
        let status = check_conflict("abc", "abc", Some("abc"));
        assert!(matches!(status, ConflictStatus::InSync));
    }

    #[test]
    fn conflict_safe_pull() {
        // Local unchanged, remote updated
        let status = check_conflict("old", "new", Some("old"));
        assert!(matches!(status, ConflictStatus::SafePull));
    }

    #[test]
    fn conflict_push_reminder() {
        // Local changed, remote unchanged
        let status = check_conflict("new", "old", Some("old"));
        assert!(matches!(status, ConflictStatus::PushReminder));
    }

    #[test]
    fn conflict_true_conflict() {
        // Both changed
        let status = check_conflict("local-new", "remote-new", Some("old"));
        assert!(matches!(status, ConflictStatus::Conflict));
    }

    #[test]
    fn conflict_no_last_hash() {
        // First sync — no last hash
        let status = check_conflict("local", "remote", None);
        assert!(matches!(status, ConflictStatus::Conflict));
    }
}
