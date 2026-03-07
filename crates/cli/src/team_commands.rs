//! Team commands: v1 legacy invite/join + v2 envelope encryption flows.

use env_butler_core::{envelope, meta, supabase_team, team, vault_migration, AppError};

use crate::helpers::{ask_password, current_dir_str, resolve_project};

// -- v1 Legacy --

pub fn cmd_team_invite(output: Option<String>) -> Result<(), AppError> {
    let (slug, _path) = resolve_project(true)?;
    let master_key = ask_password("Master Key: ")?;
    let passphrase = ask_password("Invite passphrase (share this separately): ")?;

    print!("Your name (for token metadata): ");
    std::io::Write::flush(&mut std::io::stdout()).ok();
    let mut name = String::new();
    std::io::stdin()
        .read_line(&mut name)
        .map_err(|e| AppError::Io(e.to_string()))?;
    let name = name.trim();

    let config = meta::load_config()?;
    let token_bytes =
        team::generate_invite_token(&slug, &master_key, &config, name, &passphrase)?;

    let out_path = output.unwrap_or_else(|| format!("{}.envbutler-team", slug));
    std::fs::write(&out_path, &token_bytes)?;

    println!("Invite token saved to: {}", out_path);
    println!("Share this file + passphrase with your team member.");
    println!("They can join with: env-butler team join {}", out_path);
    Ok(())
}

pub fn cmd_team_join(file: &str) -> Result<(), AppError> {
    let passphrase = ask_password("Invite passphrase: ")?;
    let file_bytes = std::fs::read(file)?;

    let payload = team::parse_invite_token(&file_bytes, &passphrase)?;

    // Save Supabase config from invite
    meta::save_config(&meta::SupabaseConfig {
        supabase_url: payload.supabase_url.clone(),
        supabase_service_role_key: payload.supabase_key.clone(),
        supabase_anon_key: None,
        sync_folder: payload.sync_folder.clone(),
    })?;

    // Register project with the vault slug
    let path = current_dir_str()?;
    meta::upsert_project(&payload.vault_slug, &path)?;

    println!("Joined team vault '{}'", payload.vault_slug);
    println!("Supabase: {}", payload.supabase_url);
    if let Some(folder) = &payload.sync_folder {
        println!("Sync folder: {}", folder);
    }
    println!("Created by: {} ({})", payload.created_by, payload.created_at);
    println!();
    println!("You can now push/pull with your team's Master Key.");
    Ok(())
}

// -- v2 Envelope --

/// Generate a v2 invite token (no master key, no passphrase — just anon key from config).
pub async fn cmd_team_invite_v2(output: Option<String>) -> Result<(), AppError> {
    let (slug, _path) = resolve_project(true)?;
    let config = meta::load_config()?;
    let anon_key = config.supabase_anon_key.as_deref()
        .ok_or_else(|| AppError::Validation(
            "Anon key not configured. Run: env-butler config --url <url> --key <key> --anon-key <anon>".into(),
        ))?;

    print!("Your name (optional): ");
    std::io::Write::flush(&mut std::io::stdout()).ok();
    let mut name = String::new();
    std::io::stdin().read_line(&mut name).map_err(|e| AppError::Io(e.to_string()))?;
    let name = name.trim().to_string();
    let created_by = if name.is_empty() { "owner".to_string() } else { name };

    let (token_bytes, invite_code, expires_at) =
        team::generate_invite_v2(&slug, &config.supabase_url, anon_key, &created_by)?;

    // Store invite code in Supabase
    let invite = supabase_team::VaultInvite {
        id: None,
        vault_slug: slug.clone(),
        code: invite_code.clone(),
        created_by: created_by.clone(),
        created_at: None,
        expires_at,
        used_at: None,
        used_by: None,
    };
    supabase_team::create_invite(&config, &invite).await?;

    let out_path = output.unwrap_or_else(|| format!("{}-v2.envbutler-team", slug));
    std::fs::write(&out_path, &token_bytes)?;

    println!("v2 Invite token saved to: {}", out_path);
    println!("Invite code: {}", invite_code);
    println!("Share this FILE with your teammate. No passphrase needed.");
    println!("They join with: env-butler team join-v2 {}", out_path);
    Ok(())
}

/// Member joins via v2 invite — consumes invite code, registers in vault_members as pending.
pub async fn cmd_team_join_v2(file: &str) -> Result<(), AppError> {
    let file_bytes = std::fs::read(file)?;
    let parsed = team::parse_invite(&file_bytes, None)?;

    match parsed {
        team::ParsedInvite::V2(payload) => {
            let member_passphrase = ask_password("Your personal passphrase (used to decrypt vaults): ")?;
            let member_id = envelope::compute_member_id(&member_passphrase)?;

            // Save config with anon key from invite
            meta::save_config(&meta::SupabaseConfig {
                supabase_url: payload.supabase_url.clone(),
                supabase_service_role_key: String::new(),
                supabase_anon_key: Some(payload.supabase_anon_key.clone()),
                sync_folder: None,
            })?;

            // Consume invite code
            let config = meta::load_config()?;
            supabase_team::consume_invite(&config, &payload.vault_slug, &payload.invite_code, &member_id).await?;

            // Register project locally
            let path = current_dir_str()?;
            meta::upsert_project(&payload.vault_slug, &path)?;

            println!("Joined vault '{}' (status: pending approval)", payload.vault_slug);
            println!("Your member ID: {}", &member_id[..16]);
            println!("Invited by: {}", payload.created_by);
            println!();
            println!("Wait for the owner to approve you, then activate:");
            println!("  env-butler team activate");
        }
        team::ParsedInvite::V1(_) => {
            return Err(AppError::Validation(
                "This is a v1 invite. Use: env-butler team join <file>".into(),
            ));
        }
    }
    Ok(())
}

/// Owner approves a pending member by wrapping vault key with a temp passphrase.
pub async fn cmd_team_approve(member_id: &str, temp_passphrase: &str) -> Result<(), AppError> {
    let (slug, _) = resolve_project(true)?;
    let config = meta::load_config()?;
    let owner_mnemonic = ask_password("Your mnemonic (Master Key): ")?;

    // Unwrap vault key with owner's mnemonic
    let owner_id = envelope::compute_member_id(&owner_mnemonic)?;
    let owner_record = supabase_team::get_vault_member(&config, &slug, &owner_id).await?;
    let wrapped_bytes = hex::decode(&owner_record.wrapped_vault_key)
        .map_err(|e| AppError::Crypto(format!("Decode owner wrapped key: {e}")))?;
    let vault_key = envelope::unwrap_key(&wrapped_bytes, &owner_mnemonic)?;

    // Re-wrap with temp passphrase for member
    let member_wrapped = envelope::wrap_key(&vault_key, temp_passphrase)?;

    let member = supabase_team::VaultMember {
        id: None,
        vault_slug: slug.clone(),
        member_id: member_id.to_string(),
        wrapped_vault_key: hex::encode(&member_wrapped),
        role: "member".to_string(),
        created_by: Some(owner_id),
        created_at: None,
        revoked_at: None,
    };
    supabase_team::upsert_vault_member(&config, &member).await?;

    println!("Member approved: {}...", &member_id[..16.min(member_id.len())]);
    println!("Share this temp passphrase with them: {}", temp_passphrase);
    println!("They activate with: env-butler team activate");
    Ok(())
}

/// Member activates — unwraps vault key with temp passphrase, re-wraps with personal passphrase.
pub async fn cmd_team_activate() -> Result<(), AppError> {
    let (slug, _) = resolve_project(true)?;
    let config = meta::load_config()?;
    let member_passphrase = ask_password("Your personal passphrase: ")?;
    let temp_passphrase = ask_password("Temp passphrase (from owner): ")?;

    let member_id = envelope::compute_member_id(&member_passphrase)?;

    // Get record with temp-wrapped vault key
    let record = supabase_team::get_vault_member(&config, &slug, &member_id).await?;
    let wrapped_bytes = hex::decode(&record.wrapped_vault_key)
        .map_err(|e| AppError::Crypto(format!("Decode temp-wrapped key: {e}")))?;

    let vault_key = envelope::unwrap_key(&wrapped_bytes, &temp_passphrase)?;
    let personal_wrapped = envelope::wrap_key(&vault_key, &member_passphrase)?;

    let updated = supabase_team::VaultMember {
        id: record.id,
        vault_slug: slug.clone(),
        member_id: member_id.clone(),
        wrapped_vault_key: hex::encode(&personal_wrapped),
        role: record.role,
        created_by: record.created_by,
        created_at: record.created_at,
        revoked_at: None,
    };
    supabase_team::upsert_vault_member(&config, &updated).await?;

    println!("Membership activated for vault '{}'", slug);
    println!("You can now push/pull using your personal passphrase.");
    Ok(())
}

/// List active members for current project's vault.
pub async fn cmd_team_list() -> Result<(), AppError> {
    let (slug, _) = resolve_project(true)?;
    let config = meta::load_config()?;
    let members = supabase_team::list_vault_members(&config, &slug).await?;

    if members.is_empty() {
        println!("No active members in vault '{}'.", slug);
        return Ok(());
    }

    println!("Members of vault '{}':", slug);
    for m in &members {
        println!(
            "  [{role}] {id}...  (created_by: {by})",
            role = m.role,
            id = &m.member_id[..16.min(m.member_id.len())],
            by = m.created_by.as_deref().unwrap_or("unknown"),
        );
    }
    Ok(())
}

/// Revoke a member from the current project's vault.
pub async fn cmd_team_revoke(member_id: &str) -> Result<(), AppError> {
    let (slug, _) = resolve_project(true)?;
    let config = meta::load_config()?;
    supabase_team::revoke_vault_member(&config, &slug, member_id).await?;
    println!("Revoked member {}... from vault '{}'", &member_id[..16.min(member_id.len())], slug);
    Ok(())
}

/// Migrate current project's vault from v1 to v2 envelope encryption.
pub async fn cmd_team_migrate() -> Result<(), AppError> {
    let (slug, _) = resolve_project(true)?;
    let config = meta::load_config()?;
    let owner_mnemonic = ask_password("Your mnemonic (current Master Key): ")?;

    println!("Pulling vault from Supabase...");
    let record = env_butler_core::supabase::pull_vault(&config, &slug).await?;

    println!("Migrating to v2 envelope encryption...");
    let result = vault_migration::migrate_v1_to_v2(&record.encrypted_blob, &owner_mnemonic)?;
    let owner_member = vault_migration::build_owner_member(&slug, &result);

    // Push new blob with format_version=2
    let new_blob_hex = hex::encode(&result.new_encrypted_blob);
    env_butler_core::supabase::push_vault(
        &config,
        &slug,
        &new_blob_hex,
        &result.plaintext_hash,
        Some(serde_json::json!({"format_version": 2})),
    ).await?;

    // Register owner as first vault_member
    supabase_team::upsert_vault_member(&config, &owner_member).await?;

    println!("Migration complete!");
    println!("Owner member ID: {}", &result.owner_member_id[..16]);
    println!("Backup of v1 blob stored — save this if you need to roll back:");
    println!("{}", &result.backup_blob[..32.min(result.backup_blob.len())]);
    Ok(())
}
