//! CI/CD commands: generate service tokens and non-interactive pull.

use env_butler_core::{ci_token, crypto, meta, supabase, vault, AppError};

use crate::helpers::{ask_password, current_dir_str, resolve_project, write_files_to_dir};

pub fn cmd_ci_generate_token() -> Result<(), AppError> {
    let (slug, _path) = resolve_project(true)?;
    let master_key = ask_password("Master Key: ")?;
    let passphrase = ask_password("Token passphrase (internal, not shared): ")?;

    let config = meta::load_config()?;
    let token_str =
        ci_token::generate_service_token(&slug, &master_key, &config, "ci-service", &passphrase)?;

    println!();
    println!("Service token (add to GitHub Secrets as ENVBUTLER_TOKEN):");
    println!();
    println!("{}", token_str);
    println!();
    println!("Usage in GitHub Actions:");
    println!("  env:");
    println!("    ENVBUTLER_TOKEN: ${{{{ secrets.ENVBUTLER_TOKEN }}}}");
    println!("  run: env-butler ci pull");
    Ok(())
}

pub async fn cmd_ci_pull(force: bool) -> Result<(), AppError> {
    // Read token from environment (non-interactive)
    let payload = ci_token::read_token_from_env()?;

    // Set up config from token
    let config = meta::SupabaseConfig {
        supabase_url: payload.supabase_url.clone(),
        supabase_service_role_key: payload.supabase_key.clone(),
        sync_folder: payload.sync_folder.clone(),
    };

    let path = current_dir_str()?;

    // Pull from Supabase
    let record = supabase::pull_vault(&config, &payload.vault_slug).await?;
    let blob = hex::decode(&record.encrypted_blob)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &payload.master_key)?;
    let files = vault::extract_vault_zip(&zip_bytes)?;

    // Write files
    let project_dir = std::path::Path::new(&path);
    if !force {
        for filename in files.keys() {
            let target = project_dir.join(filename);
            if target.exists() {
                return Err(AppError::Validation(format!(
                    "File already exists: {}. Use --force to overwrite.",
                    filename
                )));
            }
        }
    }

    write_files_to_dir(&files, project_dir)?;
    println!(
        "CI pull: wrote {} file(s) for '{}'",
        files.len(),
        payload.vault_slug
    );
    Ok(())
}
