//! Team commands: invite and join via encrypted tokens.

use env_butler_core::{meta, team, AppError};

use crate::helpers::{ask_password, current_dir_str, resolve_project};

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
    println!(
        "Created by: {} ({})",
        payload.created_by, payload.created_at
    );
    println!();
    println!("You can now push/pull with your team's Master Key.");
    Ok(())
}
