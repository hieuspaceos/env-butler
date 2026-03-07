use env_butler_core::{
    crypto, envelope, file_sync, meta, recovery, scanner, supabase, supabase_team, team, vault,
    vault_migration, AppError, ScannedFile, SupabaseConfig,
};
use serde::Serialize;
use std::collections::HashMap;

/// Validate filename and resolve target path with path traversal protection.
/// Returns the validated target path within project_dir.
fn validate_file_path(
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
        .unwrap_or_else(|| project_dir.to_path_buf());
    if !resolved.starts_with(project_dir) {
        return Err(AppError::SecurityBlock(format!(
            "Path traversal blocked: {filename}"
        )));
    }
    Ok(target)
}

/// Encrypted vault payload returned to frontend for push
#[derive(Debug, Serialize)]
pub struct EncryptedPayload {
    pub blob_hex: String,
    pub plaintext_hash: String,
    pub manifest: Vec<ScannedFile>,
}

/// Decrypted vault contents returned to frontend for pull
#[derive(Debug, Serialize)]
pub struct DecryptedManifest {
    pub files: HashMap<String, String>,
}

// -- Tauri Commands --

#[tauri::command]
async fn cmd_scan_project(path: String) -> Result<Vec<ScannedFile>, AppError> {
    scanner::scan_project(&path, &[])
}

#[tauri::command]
async fn cmd_encrypt_and_prepare(path: String, password: String) -> Result<EncryptedPayload, AppError> {
    let scanned = scanner::scan_project(&path, &[])?;
    let allowed: Vec<&ScannedFile> = scanned.iter().filter(|f| !f.blocked).collect();
    if allowed.is_empty() {
        return Err(AppError::NotFound("No .env files found to sync".into()));
    }

    let zip_bytes = vault::create_vault_zip(&scanned)?;
    let plaintext_hash = vault::compute_plaintext_hash(&zip_bytes);
    let blob = crypto::encrypt(&zip_bytes, &password)?;
    let blob_hex = hex::encode(&blob);

    Ok(EncryptedPayload {
        blob_hex,
        plaintext_hash,
        manifest: scanned,
    })
}

#[tauri::command]
async fn cmd_decrypt_vault(blob_hex: String, password: String) -> Result<DecryptedManifest, AppError> {
    let blob = hex::decode(&blob_hex)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    let files = vault::extract_vault_zip(&zip_bytes)?;
    Ok(DecryptedManifest { files })
}

#[tauri::command]
async fn cmd_generate_recovery_kit() -> Result<String, AppError> {
    recovery::generate_mnemonic()
}

#[tauri::command]
async fn cmd_validate_mnemonic(mnemonic: String) -> Result<String, AppError> {
    recovery::mnemonic_to_password(&mnemonic)
}

#[tauri::command]
async fn cmd_load_projects() -> Result<meta::ProjectsConfig, AppError> {
    meta::load_projects()
}

#[tauri::command]
async fn cmd_save_project_slug(path: String, slug: String) -> Result<(), AppError> {
    meta::upsert_project(&slug, &path)
}

#[tauri::command]
async fn cmd_remove_project(slug: String) -> Result<(), AppError> {
    meta::remove_project(&slug)
}

// -- Supabase sync commands --

#[tauri::command]
async fn cmd_push_to_supabase(
    slug: String,
    blob_hex: String,
    plaintext_hash: String,
    metadata: serde_json::Value,
) -> Result<(), AppError> {
    let config = meta::load_config()?;
    supabase::push_vault(&config, &slug, &blob_hex, &plaintext_hash, Some(metadata)).await?;
    meta::update_sync_state(&slug, &plaintext_hash)?;
    Ok(())
}

#[tauri::command]
async fn cmd_pull_from_supabase(slug: String) -> Result<supabase::VaultRecord, AppError> {
    let config = meta::load_config()?;
    supabase::pull_vault(&config, &slug).await
}

#[tauri::command]
async fn cmd_check_conflict(
    slug: String,
    remote_hash: String,
    local_hash: String,
) -> Result<supabase::ConflictStatus, AppError> {
    let project = meta::get_project(&slug)?;
    let last_hash = project.and_then(|p| p.last_sync_hash);
    Ok(supabase::check_conflict(
        &local_hash,
        &remote_hash,
        last_hash.as_deref(),
    ))
}

#[tauri::command]
async fn cmd_decrypt_and_apply(
    blob_hex: String,
    password: String,
    project_path: String,
    slug: String,
) -> Result<Vec<String>, AppError> {
    let blob = hex::decode(&blob_hex)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    let plaintext_hash = vault::compute_plaintext_hash(&zip_bytes);
    let files = vault::extract_vault_zip(&zip_bytes)?;

    // Write files to project directory (with path traversal protection)
    let project_dir = std::path::Path::new(&project_path).canonicalize()?;
    let mut written = Vec::new();
    for (filename, content) in &files {
        let target = validate_file_path(filename, &project_dir)?;
        std::fs::write(&target, content)?;
        written.push(filename.clone());
    }

    meta::update_sync_state(&slug, &plaintext_hash)?;
    Ok(written)
}

#[tauri::command]
async fn cmd_decrypt_for_diff(
    blob_hex: String,
    password: String,
) -> Result<HashMap<String, String>, AppError> {
    let blob = hex::decode(&blob_hex)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    vault::extract_vault_zip(&zip_bytes)
}

// -- Local file sync commands --

#[tauri::command]
async fn cmd_export_vault(project_path: String, password: String) -> Result<Vec<u8>, AppError> {
    file_sync::export_vault(&project_path, &password)
}

#[tauri::command]
async fn cmd_import_vault(file_bytes: Vec<u8>, password: String) -> Result<HashMap<String, String>, AppError> {
    file_sync::import_vault(&file_bytes, &password)
}

#[tauri::command]
async fn cmd_folder_push(slug: String, project_path: String, password: String) -> Result<String, AppError> {
    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Go to Settings.".into())
    })?;
    file_sync::push_to_folder(&folder, &slug, &project_path, &password)
}

#[tauri::command]
async fn cmd_folder_pull(slug: String, password: String) -> Result<HashMap<String, String>, AppError> {
    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Go to Settings.".into())
    })?;
    file_sync::pull_from_folder(&folder, &slug, &password)
}

#[tauri::command]
async fn cmd_save_supabase_config(
    url: String,
    service_role_key: String,
    anon_key: Option<String>,
) -> Result<(), AppError> {
    // Validate Supabase URL format
    if !url.starts_with("https://") || !url.contains(".supabase.co") {
        return Err(AppError::Validation(
            "Invalid Supabase URL. Expected format: https://xxx.supabase.co".into(),
        ));
    }
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
        .map(|k| if k.trim().is_empty() { None } else { Some(k.trim().to_string()) })
        .unwrap_or_else(|| existing.as_ref().and_then(|c| c.supabase_anon_key.clone()));
    meta::save_config(&SupabaseConfig {
        supabase_url: url,
        supabase_service_role_key: service_role_key,
        supabase_anon_key: resolved_anon,
        sync_folder: existing.and_then(|c| c.sync_folder),
    })
}

#[tauri::command]
async fn cmd_save_sync_folder(folder: Option<String>) -> Result<(), AppError> {
    let mut config = meta::load_config().unwrap_or_default();
    config.sync_folder = folder;
    meta::save_config(&config)
}

#[tauri::command]
async fn cmd_load_supabase_config() -> Result<SupabaseConfig, AppError> {
    meta::load_config()
}

// -- Read local env files for diff comparison --

#[tauri::command]
async fn cmd_read_env_contents(path: String) -> Result<HashMap<String, String>, AppError> {
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
async fn cmd_write_env_files(
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

// -- Team sharing commands --

#[tauri::command]
async fn cmd_team_generate_invite(
    slug: String,
    master_key: String,
    passphrase: String,
    created_by: String,
) -> Result<Vec<u8>, AppError> {
    let config = meta::load_config()?;
    team::generate_invite_token(&slug, &master_key, &config, &created_by, &passphrase)
}

#[tauri::command]
async fn cmd_team_join(
    file_bytes: Vec<u8>,
    passphrase: String,
    project_path: String,
) -> Result<team::InvitePayload, AppError> {
    let payload = team::parse_invite_token(&file_bytes, &passphrase)?;

    // Save config from invite token
    meta::save_config(&SupabaseConfig {
        supabase_url: payload.supabase_url.clone(),
        supabase_service_role_key: payload.supabase_key.clone(),
        supabase_anon_key: None,
        sync_folder: payload.sync_folder.clone(),
    })?;

    // Register project
    meta::upsert_project(&payload.vault_slug, &project_path)?;

    Ok(payload)
}

// -- Team v2 commands (envelope encryption) --

/// Generate a v2 invite token — no master key needed.
/// Returns token bytes (to save as .envbutler-team) + invite_code.
#[tauri::command]
async fn cmd_team_invite_v2(
    slug: String,
    created_by: String,
) -> Result<serde_json::Value, AppError> {
    let config = meta::load_config()?;
    let anon_key = config.supabase_anon_key.clone()
        .ok_or_else(|| AppError::Validation(
            "Anon key not configured. Add it in Settings > Supabase Connection.".into(),
        ))?;

    let (token_bytes, invite_code, expires_at) =
        team::generate_invite_v2(&slug, &config.supabase_url, &anon_key, &created_by)?;

    // Store invite code in Supabase vault_invites table
    let invite = supabase_team::VaultInvite {
        id: None,
        vault_slug: slug,
        code: invite_code.clone(),
        created_by,
        created_at: None,
        expires_at,
        used_at: None,
        used_by: None,
    };
    supabase_team::create_invite(&config, &invite).await?;

    Ok(serde_json::json!({
        "token_bytes": token_bytes,
        "invite_code": invite_code,
    }))
}

/// Join via v2 invite — member registers their identity and consumes the invite code.
/// Returns membership info with status "pending_approval" — owner must approve next.
#[tauri::command]
async fn cmd_team_join_v2(
    file_bytes: Vec<u8>,
    member_passphrase: String,
    project_path: String,
) -> Result<serde_json::Value, AppError> {
    let parsed = team::parse_invite(&file_bytes, None)?;
    match parsed {
        team::ParsedInvite::V2(payload) => {
            let member_id = envelope::compute_member_id(&member_passphrase)?;

            // Save config with anon key from invite (member doesn't get service_role)
            meta::save_config(&SupabaseConfig {
                supabase_url: payload.supabase_url.clone(),
                supabase_service_role_key: String::new(),
                supabase_anon_key: Some(payload.supabase_anon_key.clone()),
                sync_folder: None,
            })?;

            // Consume invite code — marks it as used in Supabase
            let config = meta::load_config()?;
            supabase_team::consume_invite(&config, &payload.vault_slug, &payload.invite_code, &member_id).await?;

            // Register project locally
            meta::upsert_project(&payload.vault_slug, &project_path)?;

            Ok(serde_json::json!({
                "vault_slug": payload.vault_slug,
                "member_id": member_id,
                "created_by": payload.created_by,
                "status": "pending_approval",
            }))
        }
        team::ParsedInvite::V1(_) => {
            Err(AppError::Validation("This is a v1 invite. Use the legacy Join flow.".into()))
        }
    }
}

/// Owner approves a pending member by wrapping the vault key with a temp passphrase.
/// Owner shares temp_passphrase with member out-of-band; member calls cmd_team_activate_membership.
#[tauri::command]
async fn cmd_team_approve_member(
    vault_slug: String,
    member_id: String,
    owner_mnemonic: String,
    temp_passphrase: String,
) -> Result<(), AppError> {
    let config = meta::load_config()?;

    // Unwrap vault key using owner's mnemonic
    let owner_id = envelope::compute_member_id(&owner_mnemonic)?;
    let owner_record = supabase_team::get_vault_member(&config, &vault_slug, &owner_id).await?;
    let wrapped_bytes = hex::decode(&owner_record.wrapped_vault_key)
        .map_err(|e| AppError::Crypto(format!("Decode owner wrapped key: {e}")))?;
    let vault_key = envelope::unwrap_key(&wrapped_bytes, &owner_mnemonic)?;

    // Re-wrap vault key with temp passphrase for member to pick up
    let member_wrapped = envelope::wrap_key(&vault_key, &temp_passphrase)?;

    // Store member record with temp-passphrase-wrapped key
    let member = supabase_team::VaultMember {
        id: None,
        vault_slug: vault_slug.clone(),
        member_id,
        wrapped_vault_key: hex::encode(&member_wrapped),
        role: "member".to_string(),
        created_by: Some(owner_id),
        created_at: None,
        revoked_at: None,
    };
    supabase_team::upsert_vault_member(&config, &member).await
}

/// Member activates their membership — unwraps vault key with temp passphrase,
/// re-wraps with their personal passphrase, and stores the new record.
#[tauri::command]
async fn cmd_team_activate_membership(
    vault_slug: String,
    temp_passphrase: String,
    member_passphrase: String,
) -> Result<(), AppError> {
    let config = meta::load_config()?;
    let member_id = envelope::compute_member_id(&member_passphrase)?;

    // Get record that has vault key wrapped with temp passphrase
    let record = supabase_team::get_vault_member(&config, &vault_slug, &member_id).await?;
    let wrapped_bytes = hex::decode(&record.wrapped_vault_key)
        .map_err(|e| AppError::Crypto(format!("Decode temp-wrapped key: {e}")))?;

    // Unwrap with temp passphrase, re-wrap with member's personal passphrase
    let vault_key = envelope::unwrap_key(&wrapped_bytes, &temp_passphrase)?;
    let personal_wrapped = envelope::wrap_key(&vault_key, &member_passphrase)?;

    let updated = supabase_team::VaultMember {
        id: record.id,
        vault_slug,
        member_id,
        wrapped_vault_key: hex::encode(&personal_wrapped),
        role: record.role,
        created_by: record.created_by,
        created_at: record.created_at,
        revoked_at: None,
    };
    supabase_team::upsert_vault_member(&config, &updated).await
}

/// List active members for a vault (owner only).
#[tauri::command]
async fn cmd_team_list_members(
    vault_slug: String,
) -> Result<Vec<supabase_team::VaultMember>, AppError> {
    let config = meta::load_config()?;
    supabase_team::list_vault_members(&config, &vault_slug).await
}

/// Revoke a member by vault_slug + member_id (owner only).
#[tauri::command]
async fn cmd_team_revoke_member(vault_slug: String, member_id: String) -> Result<(), AppError> {
    let config = meta::load_config()?;
    supabase_team::revoke_vault_member(&config, &vault_slug, &member_id).await
}

/// Migrate vault from v1 (password-based) to v2 (envelope encryption).
/// Returns owner_member_id and backup of old blob for safety.
#[tauri::command]
async fn cmd_vault_migrate_v2(
    vault_slug: String,
    owner_mnemonic: String,
) -> Result<serde_json::Value, AppError> {
    let config = meta::load_config()?;

    // Pull current v1 vault blob
    let record = supabase::pull_vault(&config, &vault_slug).await?;

    // Perform migration (decrypt v1, re-encrypt v2)
    let result = vault_migration::migrate_v1_to_v2(&record.encrypted_blob, &owner_mnemonic)?;
    let owner_member = vault_migration::build_owner_member(&vault_slug, &result);

    // Push new blob with format_version=2
    let new_blob_hex = hex::encode(&result.new_encrypted_blob);
    supabase::push_vault(
        &config,
        &vault_slug,
        &new_blob_hex,
        &result.plaintext_hash,
        Some(serde_json::json!({"format_version": 2})),
    ).await?;

    // Register owner as first vault_member
    supabase_team::upsert_vault_member(&config, &owner_member).await?;

    Ok(serde_json::json!({
        "owner_member_id": result.owner_member_id,
        "backup_blob": result.backup_blob,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_scan_project,
            cmd_encrypt_and_prepare,
            cmd_decrypt_vault,
            cmd_generate_recovery_kit,
            cmd_validate_mnemonic,
            cmd_load_projects,
            cmd_save_project_slug,
            cmd_remove_project,
            cmd_push_to_supabase,
            cmd_pull_from_supabase,
            cmd_check_conflict,
            cmd_decrypt_and_apply,
            cmd_decrypt_for_diff,
            cmd_export_vault,
            cmd_import_vault,
            cmd_folder_push,
            cmd_folder_pull,
            cmd_save_sync_folder,
            cmd_save_supabase_config,
            cmd_load_supabase_config,
            cmd_team_generate_invite,
            cmd_team_join,
            cmd_write_env_files,
            cmd_read_env_contents,
            cmd_team_invite_v2,
            cmd_team_join_v2,
            cmd_team_approve_member,
            cmd_team_activate_membership,
            cmd_team_list_members,
            cmd_team_revoke_member,
            cmd_vault_migrate_v2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
