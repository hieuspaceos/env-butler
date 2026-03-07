//! Tauri commands for team sharing: v1 legacy invite/join + v2 envelope encryption.

use env_butler_core::{envelope, meta, supabase, supabase_team, team, vault_migration, AppError, SupabaseConfig};

// -- Team v1 legacy commands --

#[tauri::command]
pub async fn cmd_team_generate_invite(
    slug: String,
    master_key: String,
    passphrase: String,
    created_by: String,
) -> Result<Vec<u8>, AppError> {
    let config = meta::load_config()?;
    team::generate_invite_token(&slug, &master_key, &config, &created_by, &passphrase)
}

#[tauri::command]
pub async fn cmd_team_join(
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

// -- Team v2 envelope encryption commands --

/// Generate a v2 invite token — no master key needed.
/// Returns token bytes (to save as .envbutler-team) + invite_code.
#[tauri::command]
pub async fn cmd_team_invite_v2(
    slug: String,
    created_by: String,
) -> Result<serde_json::Value, AppError> {
    let config = meta::load_config()?;
    let anon_key = config.supabase_anon_key.clone().ok_or_else(|| {
        AppError::Validation(
            "Anon key not configured. Add it in Settings > Supabase Connection.".into(),
        )
    })?;

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
pub async fn cmd_team_join_v2(
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
            supabase_team::consume_invite(
                &config,
                &payload.vault_slug,
                &payload.invite_code,
                &member_id,
            )
            .await?;

            // Register project locally
            meta::upsert_project(&payload.vault_slug, &project_path)?;

            Ok(serde_json::json!({
                "vault_slug": payload.vault_slug,
                "member_id": member_id,
                "created_by": payload.created_by,
                "status": "pending_approval",
            }))
        }
        team::ParsedInvite::V1(_) => Err(AppError::Validation(
            "This is a v1 invite. Use the legacy Join flow.".into(),
        )),
    }
}

/// Owner approves a pending member by wrapping the vault key with a temp passphrase.
/// Owner shares temp_passphrase with member out-of-band; member calls cmd_team_activate_membership.
#[tauri::command]
pub async fn cmd_team_approve_member(
    vault_slug: String,
    member_id: String,
    owner_mnemonic: String,
    temp_passphrase: String,
) -> Result<(), AppError> {
    let config = meta::load_config()?;

    // Unwrap vault key using owner's mnemonic
    let owner_id = envelope::compute_member_id(&owner_mnemonic)?;
    let owner_record =
        supabase_team::get_vault_member(&config, &vault_slug, &owner_id).await?;
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
pub async fn cmd_team_activate_membership(
    vault_slug: String,
    temp_passphrase: String,
    member_passphrase: String,
) -> Result<(), AppError> {
    let config = meta::load_config()?;
    let member_id = envelope::compute_member_id(&member_passphrase)?;

    // Get record that has vault key wrapped with temp passphrase
    let record =
        supabase_team::get_vault_member(&config, &vault_slug, &member_id).await?;
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
pub async fn cmd_team_list_members(
    vault_slug: String,
) -> Result<Vec<supabase_team::VaultMember>, AppError> {
    let config = meta::load_config()?;
    supabase_team::list_vault_members(&config, &vault_slug).await
}

/// Revoke a member by vault_slug + member_id (owner only).
#[tauri::command]
pub async fn cmd_team_revoke_member(
    vault_slug: String,
    member_id: String,
) -> Result<(), AppError> {
    let config = meta::load_config()?;
    supabase_team::revoke_vault_member(&config, &vault_slug, &member_id).await
}

/// Migrate vault from v1 (password-based) to v2 (envelope encryption).
/// Returns owner_member_id and backup of old blob for safety.
#[tauri::command]
pub async fn cmd_vault_migrate_v2(
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
    )
    .await?;

    // Register owner as first vault_member
    supabase_team::upsert_vault_member(&config, &owner_member).await?;

    Ok(serde_json::json!({
        "owner_member_id": result.owner_member_id,
        "backup_blob": result.backup_blob,
    }))
}
