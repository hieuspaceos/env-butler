//! Sync commands: init, push, pull, export, import, folder-push, folder-pull, status, config.

use env_butler_core::{crypto, file_sync, meta, recovery, scanner, supabase, vault, AppError, ScannedFile};

use crate::helpers::{ask_password, current_dir_str, resolve_project, slug_from_path, write_files_to_dir};

pub fn cmd_init(slug: Option<String>) -> Result<(), AppError> {
    let path = current_dir_str()?;
    let slug = slug.unwrap_or_else(|| slug_from_path(&path));

    meta::upsert_project(&slug, &path)?;
    println!("Registered project '{}' at {}", slug, path);

    let files = scanner::scan_project(&path, &[])?;
    let env_count = files.iter().filter(|f| !f.blocked).count();
    let blocked_count = files.iter().filter(|f| f.blocked).count();
    println!("Found {} .env file(s), {} blocked", env_count, blocked_count);

    Ok(())
}

pub async fn cmd_push() -> Result<(), AppError> {
    let (slug, path) = resolve_project(true)?;
    let password = ask_password("Master Key: ")?;

    let scanned = scanner::scan_project(&path, &[])?;
    let allowed: Vec<&ScannedFile> = scanned.iter().filter(|f| !f.blocked).collect();
    if allowed.is_empty() {
        return Err(AppError::NotFound("No .env files found to sync".into()));
    }

    let zip_bytes = vault::create_vault_zip(&scanned)?;
    let plaintext_hash = vault::compute_plaintext_hash(&zip_bytes);
    let blob = crypto::encrypt(&zip_bytes, &password)?;
    let blob_hex = hex::encode(&blob);

    let metadata = serde_json::json!({
        "file_count": allowed.len(),
        "files": allowed.iter().map(|f| &f.filename).collect::<Vec<_>>(),
    });

    let config = meta::load_config()?;
    supabase::push_vault(&config, &slug, &blob_hex, &plaintext_hash, Some(metadata)).await?;
    meta::update_sync_state(&slug, &plaintext_hash)?;

    println!("Pushed {} file(s) for '{}'", allowed.len(), slug);
    for f in &allowed {
        println!("  {}", f.filename);
    }

    Ok(())
}

pub async fn cmd_pull(force: bool) -> Result<(), AppError> {
    let (slug, path) = resolve_project(true)?;
    let password = ask_password("Master Key: ")?;

    let config = meta::load_config()?;
    let record = supabase::pull_vault(&config, &slug).await?;

    let blob = hex::decode(&record.encrypted_blob)
        .map_err(|e| AppError::Crypto(format!("Invalid hex: {e}")))?;
    let zip_bytes = crypto::decrypt(&blob, &password)?;
    let plaintext_hash = vault::compute_plaintext_hash(&zip_bytes);

    // Conflict check: compare local vs remote hash
    if !force {
        let scanned = scanner::scan_project(&path, &[]).unwrap_or_default();
        let allowed: Vec<&ScannedFile> = scanned.iter().filter(|f| !f.blocked).collect();
        if !allowed.is_empty() {
            let local_zip = vault::create_vault_zip(&scanned)?;
            let local_hash = vault::compute_plaintext_hash(&local_zip);
            let project = meta::get_project(&slug)?;
            let last_hash = project.and_then(|p| p.last_sync_hash);
            let status = supabase::check_conflict(&local_hash, &plaintext_hash, last_hash.as_deref());

            match status {
                supabase::ConflictStatus::InSync => {
                    println!("Already in sync. Nothing to pull.");
                    return Ok(());
                }
                supabase::ConflictStatus::Conflict => {
                    return Err(AppError::Validation(
                        "Conflict: both local and remote changed since last sync. Use --force to overwrite local.".into()
                    ));
                }
                supabase::ConflictStatus::PushReminder => {
                    return Err(AppError::Validation(
                        "Local changes not pushed yet. Push first, or use --force to overwrite local.".into()
                    ));
                }
                supabase::ConflictStatus::SafePull => {} // OK to proceed
            }
        }
    }

    let files = vault::extract_vault_zip(&zip_bytes)?;
    let project_dir = std::path::Path::new(&path);
    write_files_to_dir(&files, project_dir)?;

    meta::update_sync_state(&slug, &plaintext_hash)?;
    println!("Pulled {} file(s) for '{}'", files.len(), slug);

    Ok(())
}

pub fn cmd_export(output: Option<String>) -> Result<(), AppError> {
    let (slug, path) = resolve_project(false)?;
    let password = ask_password("Master Key: ")?;

    let bytes = file_sync::export_vault(&path, &password)?;
    let out_path = output.unwrap_or_else(|| format!("{}.envbutler", slug));
    std::fs::write(&out_path, &bytes)?;

    println!("Exported to {}", out_path);
    Ok(())
}

pub fn cmd_import(file: &str) -> Result<(), AppError> {
    let password = ask_password("Master Key: ")?;
    let file_bytes = std::fs::read(file)?;
    let files = file_sync::import_vault(&file_bytes, &password)?;

    let path = current_dir_str()?;
    let project_dir = std::path::Path::new(&path);
    write_files_to_dir(&files, project_dir)?;

    println!("Imported {} file(s) from {}", files.len(), file);
    Ok(())
}

pub fn cmd_folder_push() -> Result<(), AppError> {
    let (slug, path) = resolve_project(true)?;
    let password = ask_password("Master Key: ")?;

    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Use GUI Settings or set manually in ~/.env-butler/config.json".into())
    })?;

    let dest = file_sync::push_to_folder(&folder, &slug, &path, &password)?;
    println!("Pushed to {}", dest);
    Ok(())
}

pub fn cmd_folder_pull(force: bool) -> Result<(), AppError> {
    let (slug, path) = resolve_project(true)?;
    let password = ask_password("Master Key: ")?;

    let config = meta::load_config()?;
    let folder = config.sync_folder.ok_or_else(|| {
        AppError::NotFound("Sync folder not configured. Use GUI Settings or set manually in ~/.env-butler/config.json".into())
    })?;

    // Conflict check for folder pull
    if !force {
        let scanned = scanner::scan_project(&path, &[]).unwrap_or_default();
        let allowed: Vec<&ScannedFile> = scanned.iter().filter(|f| !f.blocked).collect();
        if !allowed.is_empty() {
            let local_zip = vault::create_vault_zip(&scanned)?;
            let local_hash = vault::compute_plaintext_hash(&local_zip);
            let project = meta::get_project(&slug)?;
            let last_hash = project.and_then(|p| p.last_sync_hash);
            if last_hash.is_some() && last_hash.as_deref() != Some(&local_hash) {
                return Err(AppError::Validation(
                    "Local changes detected since last sync. Use --force to overwrite.".into()
                ));
            }
        }
    }

    let files = file_sync::pull_from_folder(&folder, &slug, &password)?;
    let project_dir = std::path::Path::new(&path);
    write_files_to_dir(&files, project_dir)?;

    println!("Pulled {} file(s) from sync folder", files.len());
    Ok(())
}

pub fn cmd_status() -> Result<(), AppError> {
    let path = current_dir_str()?;
    let slug = slug_from_path(&path);

    let files = scanner::scan_project(&path, &[])?;
    let env_files: Vec<&ScannedFile> = files.iter().filter(|f| !f.blocked).collect();
    let blocked: Vec<&ScannedFile> = files.iter().filter(|f| f.blocked).collect();

    let project = meta::get_project(&slug)?;
    let registered = project.is_some();

    println!("Project: {} {}", slug, if registered { "(registered)" } else { "(not initialized)" });
    println!("Path:    {}", path);
    println!();

    if env_files.is_empty() {
        println!("No .env files found.");
    } else {
        println!(".env files ({}):", env_files.len());
        for f in &env_files {
            println!("  {}", f.filename);
        }
    }

    if !blocked.is_empty() {
        println!();
        println!("Blocked ({}):", blocked.len());
        for f in &blocked {
            println!("  {} ({})", f.filename, f.block_reason.as_deref().unwrap_or("blocked"));
        }
    }

    match meta::load_config() {
        Ok(config) => {
            println!();
            println!("Supabase: configured ({})", config.supabase_url);
            if let Some(folder) = &config.sync_folder {
                println!("Sync folder: {}", folder);
            }
        }
        Err(_) => {
            println!();
            println!("Supabase: not configured (run `env-butler config`)");
        }
    }

    if let Some(proj) = meta::get_project(&slug)? {
        if let Some(hash) = &proj.last_sync_hash {
            println!("Last sync: {}", &hash[..12]);
        }
    }

    Ok(())
}

pub fn cmd_config(url: &str, key: &str, anon_key: Option<&str>) -> Result<(), AppError> {
    if !url.starts_with("https://") || !url.contains(".supabase.co") {
        return Err(AppError::Validation(
            "Invalid Supabase URL. Expected format: https://xxx.supabase.co".into(),
        ));
    }
    if !key.starts_with("eyJ") {
        return Err(AppError::Validation(
            "Invalid key format. Use your Supabase Service Role Key (starts with eyJ...).".into(),
        ));
    }
    if let Some(ak) = anon_key {
        if !ak.is_empty() && !ak.starts_with("eyJ") {
            return Err(AppError::Validation(
                "Invalid anon key format. Expected JWT starting with eyJ...".into(),
            ));
        }
    }

    let existing = meta::load_config().ok();
    // Prefer explicitly passed anon_key; fall back to existing stored value
    let resolved_anon = match anon_key {
        Some(ak) if !ak.is_empty() => Some(ak.to_string()),
        Some(_) => None, // empty string passed = clear anon key
        None => existing.as_ref().and_then(|c| c.supabase_anon_key.clone()),
    };
    meta::save_config(&meta::SupabaseConfig {
        supabase_url: url.to_string(),
        supabase_service_role_key: key.to_string(),
        supabase_anon_key: resolved_anon,
        sync_folder: existing.and_then(|c| c.sync_folder),
    })?;

    println!("Supabase config saved.");
    Ok(())
}

pub fn cmd_recovery_generate() -> Result<(), AppError> {
    let mnemonic = recovery::generate_mnemonic()?;
    println!("Recovery Mnemonic (BIP39 — 24 words):");
    println!();
    println!("  {}", mnemonic);
    println!();
    println!("Write these words down and store them safely.");
    println!("This mnemonic can restore your Master Key.");
    Ok(())
}

pub fn cmd_recovery_restore() -> Result<(), AppError> {
    println!("Enter your 24-word recovery mnemonic:");
    let mut mnemonic = String::new();
    std::io::stdin()
        .read_line(&mut mnemonic)
        .map_err(|e| AppError::Io(e.to_string()))?;

    let _password = recovery::mnemonic_to_password(mnemonic.trim())?;
    println!("Master Key recovered successfully.");
    println!("Use it as your password for push/pull/export/import commands.");
    Ok(())
}
