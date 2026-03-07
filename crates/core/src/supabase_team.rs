#![deny(unsafe_code)]

//! Supabase CRUD for team envelope encryption tables:
//! - vault_members: per-member wrapped vault keys
//! - vault_invites: one-time invite codes

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::error::AppError;
use crate::meta::SupabaseConfig;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

// --- Data types ---

/// A member's envelope record in Supabase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMember {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub vault_slug: String,
    pub member_id: String,
    pub wrapped_vault_key: String,
    #[serde(default = "default_role")]
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<String>,
}

fn default_role() -> String {
    "member".into()
}

/// An invite code record in Supabase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultInvite {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub vault_slug: String,
    pub code: String,
    pub created_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    pub expires_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_by: Option<String>,
}

// --- HTTP helpers ---

/// Build reqwest client + base URL from config
fn build_client(config: &SupabaseConfig) -> Result<(Client, String), AppError> {
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| AppError::Supabase(format!("HTTP client init: {e}")))?;
    let base_url = config.supabase_url.trim_end_matches('/').to_string();
    Ok((client, base_url))
}

/// Auth headers for owner operations (service_role, bypasses RLS)
fn owner_headers(config: &SupabaseConfig) -> Vec<(&'static str, String)> {
    vec![
        ("apikey", config.supabase_service_role_key.clone()),
        ("Authorization", format!("Bearer {}", config.supabase_service_role_key)),
        ("Content-Type", "application/json".into()),
    ]
}

/// Auth headers for member-scoped operations (anon key + x-member-id, respects RLS).
/// Falls back to service_role if anon key not configured (backward compat).
fn member_headers(config: &SupabaseConfig, member_id: &str) -> Vec<(&'static str, String)> {
    let api_key = config.supabase_anon_key.as_deref()
        .unwrap_or(&config.supabase_service_role_key);
    vec![
        ("apikey", api_key.to_string()),
        ("Authorization", format!("Bearer {api_key}")),
        ("Content-Type", "application/json".into()),
        ("x-member-id", member_id.to_string()),
    ]
}

/// Parse error response into user-friendly message
fn parse_error(status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(msg) = json.get("message").and_then(|m| m.as_str()) {
            if msg.contains("Could not find the table") {
                return "Table not found. Run the Team v2 migration SQL in Supabase SQL Editor.".into();
            }
            return msg.to_string();
        }
    }
    format!("Supabase error ({status}): {body}")
}

// --- Vault Members CRUD ---

/// Add a member's wrapped key to a vault (upsert by vault_slug + member_id).
/// Owner-only operation — uses service_role key.
pub async fn upsert_vault_member(
    config: &SupabaseConfig,
    member: &VaultMember,
) -> Result<(), AppError> {
    let (client, base_url) = build_client(config)?;
    let url = format!("{base_url}/rest/v1/vault_members?on_conflict=vault_slug,member_id");

    let mut req = client.post(&url);
    for (k, v) in owner_headers(config) {
        req = req.header(k, v);
    }
    req = req.header("Prefer", "resolution=merge-duplicates");

    let response = req
        .json(member)
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Upsert member failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }
    Ok(())
}

/// List active (non-revoked) members for a vault.
/// Owner-only operation — uses service_role key.
pub async fn list_vault_members(
    config: &SupabaseConfig,
    vault_slug: &str,
) -> Result<Vec<VaultMember>, AppError> {
    let (client, base_url) = build_client(config)?;
    let encoded = urlencoding::encode(vault_slug);
    let url = format!(
        "{base_url}/rest/v1/vault_members?vault_slug=eq.{encoded}&revoked_at=is.null&select=*"
    );

    let mut req = client.get(&url);
    for (k, v) in owner_headers(config) {
        req = req.header(k, v);
    }

    let response = req
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("List members failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }

    response
        .json()
        .await
        .map_err(|e| AppError::Supabase(format!("Parse members: {e}")))
}

/// Get a specific member's record (for unwrapping their vault key).
/// Member-scoped — uses anon key + x-member-id header when available.
pub async fn get_vault_member(
    config: &SupabaseConfig,
    vault_slug: &str,
    member_id: &str,
) -> Result<VaultMember, AppError> {
    let (client, base_url) = build_client(config)?;
    let encoded_slug = urlencoding::encode(vault_slug);
    let encoded_member = urlencoding::encode(member_id);
    let url = format!(
        "{base_url}/rest/v1/vault_members?vault_slug=eq.{encoded_slug}&member_id=eq.{encoded_member}&revoked_at=is.null&select=*"
    );

    let mut req = client.get(&url);
    for (k, v) in member_headers(config, member_id) {
        req = req.header(k, v);
    }

    let response = req
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Get member failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }

    let members: Vec<VaultMember> = response
        .json()
        .await
        .map_err(|e| AppError::Supabase(format!("Parse member: {e}")))?;

    members
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound(format!("Member not found in vault: {vault_slug}")))
}

/// Revoke a member by setting revoked_at timestamp.
/// Owner-only operation — uses service_role key.
pub async fn revoke_vault_member(
    config: &SupabaseConfig,
    vault_slug: &str,
    member_id: &str,
) -> Result<(), AppError> {
    let (client, base_url) = build_client(config)?;
    let encoded_slug = urlencoding::encode(vault_slug);
    let encoded_member = urlencoding::encode(member_id);
    let url = format!(
        "{base_url}/rest/v1/vault_members?vault_slug=eq.{encoded_slug}&member_id=eq.{encoded_member}"
    );

    let body = serde_json::json!({
        "revoked_at": chrono::Utc::now().to_rfc3339()
    });

    let mut req = client.patch(&url);
    for (k, v) in owner_headers(config) {
        req = req.header(k, v);
    }

    let response = req
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Revoke member failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }
    Ok(())
}

// --- Vault Invites CRUD ---

/// Create a new invite code for a vault.
/// Owner-only operation — uses service_role key.
pub async fn create_invite(
    config: &SupabaseConfig,
    invite: &VaultInvite,
) -> Result<(), AppError> {
    let (client, base_url) = build_client(config)?;
    let url = format!("{base_url}/rest/v1/vault_invites");

    let mut req = client.post(&url);
    for (k, v) in owner_headers(config) {
        req = req.header(k, v);
    }

    let response = req
        .json(invite)
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Create invite failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }
    Ok(())
}

/// Pull vault data as a member (scoped via anon key + x-member-id).
/// RLS ensures member can only read vaults they belong to.
pub async fn pull_vault_as_member(
    config: &SupabaseConfig,
    vault_slug: &str,
    member_id: &str,
) -> Result<crate::supabase::VaultRecord, AppError> {
    let (client, base_url) = build_client(config)?;
    let encoded_slug = urlencoding::encode(vault_slug);
    let url = format!(
        "{base_url}/rest/v1/vault?project_slug=eq.{encoded_slug}&select=*"
    );

    let mut req = client.get(&url);
    for (k, v) in member_headers(config, member_id) {
        req = req.header(k, v);
    }

    let response = req
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Member pull failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }

    let records: Vec<crate::supabase::VaultRecord> = response
        .json()
        .await
        .map_err(|e| AppError::Supabase(format!("Parse vault: {e}")))?;

    records
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound(format!("No vault found or access denied: {vault_slug}")))
}

/// Validate and consume an invite code. Returns the invite if valid and unused.
/// Member-scoped — uses anon key (RLS allows reading/consuming unused invites).
pub async fn consume_invite(
    config: &SupabaseConfig,
    vault_slug: &str,
    code: &str,
    member_id: &str,
) -> Result<VaultInvite, AppError> {
    let (client, base_url) = build_client(config)?;
    let encoded_slug = urlencoding::encode(vault_slug);
    let encoded_code = urlencoding::encode(code);

    // Fetch unused, non-expired invite
    let url = format!(
        "{base_url}/rest/v1/vault_invites?vault_slug=eq.{encoded_slug}&code=eq.{encoded_code}&used_at=is.null&select=*"
    );

    let mut req = client.get(&url);
    for (k, v) in member_headers(config, member_id) {
        req = req.header(k, v);
    }

    let response = req
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Fetch invite failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }

    let invites: Vec<VaultInvite> = response
        .json()
        .await
        .map_err(|e| AppError::Supabase(format!("Parse invite: {e}")))?;

    let invite = invites
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Validation("Invalid or expired invite code.".into()))?;

    // Check expiry
    if let Ok(expires) = chrono::DateTime::parse_from_rfc3339(&invite.expires_at) {
        if chrono::Utc::now() > expires {
            return Err(AppError::Validation("Invite code has expired.".into()));
        }
    }

    // Mark as used
    let patch_url = format!(
        "{base_url}/rest/v1/vault_invites?vault_slug=eq.{encoded_slug}&code=eq.{encoded_code}"
    );
    let patch_body = serde_json::json!({
        "used_at": chrono::Utc::now().to_rfc3339(),
        "used_by": member_id,
    });

    let (client2, _) = build_client(config)?;
    let mut req2 = client2.patch(&patch_url);
    for (k, v) in member_headers(config, member_id) {
        req2 = req2.header(k, v);
    }

    let patch_resp = req2
        .json(&patch_body)
        .send()
        .await
        .map_err(|e| AppError::Supabase(format!("Mark invite used: {e}")))?;

    if !patch_resp.status().is_success() {
        let status = patch_resp.status();
        let body = patch_resp.text().await.unwrap_or_default();
        return Err(AppError::Supabase(parse_error(status, &body)));
    }

    Ok(invite)
}
