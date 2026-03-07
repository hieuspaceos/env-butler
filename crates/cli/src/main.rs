use clap::{Parser, Subcommand};
use env_butler_core::{
    ci_token, crypto, file_sync, meta, recovery, scanner, supabase, team, vault, AppError,
    ScannedFile,
};

#[derive(Parser)]
#[command(name = "env-butler", about = "Secure .env file sync from the terminal")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize project — register current directory
    Init {
        /// Project slug (defaults to directory name)
        #[arg(short, long)]
        slug: Option<String>,
    },
    /// Encrypt and push .env files to Supabase
    Push,
    /// Pull and decrypt .env files from Supabase
    Pull {
        /// Skip conflict check and overwrite local files
        #[arg(long)]
        force: bool,
    },
    /// Export encrypted .envbutler file
    Export {
        /// Output file path (defaults to {slug}.envbutler)
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Import and decrypt a .envbutler file
    Import {
        /// Path to .envbutler file
        file: String,
    },
    /// Push encrypted .env files to sync folder (Google Drive, iCloud, Dropbox)
    FolderPush,
    /// Pull encrypted .env files from sync folder
    FolderPull {
        /// Skip conflict check and overwrite local files
        #[arg(long)]
        force: bool,
    },
    /// Show project sync status
    Status,
    /// Configure Supabase connection
    Config {
        /// Supabase project URL
        #[arg(long)]
        url: String,
        /// Supabase service role key
        #[arg(long)]
        key: String,
    },
    /// Recovery kit management
    Recovery {
        #[command(subcommand)]
        action: RecoveryAction,
    },
    /// Team sharing — invite members via encrypted tokens
    Team {
        #[command(subcommand)]
        action: TeamAction,
    },
    /// CI/CD — non-interactive pull using service tokens
    Ci {
        #[command(subcommand)]
        action: CiAction,
    },
}

#[derive(Subcommand)]
enum RecoveryAction {
    /// Generate a new BIP39 recovery mnemonic
    Generate,
    /// Restore Master Key from mnemonic phrase
    Restore,
}

#[derive(Subcommand)]
enum TeamAction {
    /// Generate an invite token for a team member
    Invite {
        /// Output file path (defaults to {slug}.envbutler-team)
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Join a team vault using an invite token
    Join {
        /// Path to .envbutler-team file
        file: String,
    },
}

#[derive(Subcommand)]
enum CiAction {
    /// Generate a service token for CI/CD (store in GitHub Secrets)
    GenerateToken,
    /// Pull .env files using ENVBUTLER_TOKEN env var (non-interactive)
    Pull {
        /// Skip conflict check
        #[arg(long)]
        force: bool,
    },
}

/// Prompt for Master Key password (hidden input)
fn ask_password(prompt: &str) -> Result<String, AppError> {
    let password = rpassword::read_password_from_tty(Some(prompt))
        .map_err(|e| AppError::Io(format!("Failed to read password: {e}")))?;
    if password.is_empty() {
        return Err(AppError::Validation("Password cannot be empty".into()));
    }
    Ok(password)
}

/// Get current directory as string
fn current_dir_str() -> Result<String, AppError> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Derive slug from directory name
fn slug_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string())
}

/// Resolve project slug: lookup registered project first, fallback to dir name.
/// Returns (slug, path). Ensures project is registered for push/pull.
fn resolve_project(require_init: bool) -> Result<(String, String), AppError> {
    let path = current_dir_str()?;
    let slug = slug_from_path(&path);

    if require_init {
        let project = meta::get_project(&slug)?;
        if project.is_none() {
            return Err(AppError::Validation(format!(
                "Project not initialized. Run `env-butler init` in this directory first."
            )));
        }
    }

    Ok((slug, path))
}

/// Write decrypted files to project directory with path traversal protection
fn write_files_to_dir(
    files: &std::collections::HashMap<String, String>,
    project_dir: &std::path::Path,
) -> Result<Vec<String>, AppError> {
    let canonical = project_dir.canonicalize()?;
    let mut written = Vec::new();

    for (filename, content) in files {
        if filename.contains("..") || filename.starts_with('/') || filename.starts_with('\\') {
            return Err(AppError::SecurityBlock(format!(
                "Blocked unsafe filename: {filename}"
            )));
        }
        let target = canonical.join(filename);
        std::fs::write(&target, content)?;
        println!("  Wrote {}", filename);
        written.push(filename.clone());
    }

    Ok(written)
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    if let Err(e) = run(cli).await {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }
}

async fn run(cli: Cli) -> Result<(), AppError> {
    match cli.command {
        Commands::Init { slug } => cmd_init(slug)?,
        Commands::Push => cmd_push().await?,
        Commands::Pull { force } => cmd_pull(force).await?,
        Commands::Export { output } => cmd_export(output)?,
        Commands::Import { file } => cmd_import(&file)?,
        Commands::FolderPush => cmd_folder_push()?,
        Commands::FolderPull { force } => cmd_folder_pull(force)?,
        Commands::Status => cmd_status()?,
        Commands::Config { url, key } => cmd_config(&url, &key)?,
        Commands::Recovery { action } => match action {
            RecoveryAction::Generate => cmd_recovery_generate()?,
            RecoveryAction::Restore => cmd_recovery_restore()?,
        },
        Commands::Team { action } => match action {
            TeamAction::Invite { output } => cmd_team_invite(output)?,
            TeamAction::Join { file } => cmd_team_join(&file)?,
        },
        Commands::Ci { action } => match action {
            CiAction::GenerateToken => cmd_ci_generate_token()?,
            CiAction::Pull { force } => cmd_ci_pull(force).await?,
        },
    }
    Ok(())
}

fn cmd_init(slug: Option<String>) -> Result<(), AppError> {
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

async fn cmd_push() -> Result<(), AppError> {
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

async fn cmd_pull(force: bool) -> Result<(), AppError> {
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

fn cmd_export(output: Option<String>) -> Result<(), AppError> {
    let (slug, path) = resolve_project(false)?;
    let password = ask_password("Master Key: ")?;

    let bytes = file_sync::export_vault(&path, &password)?;
    let out_path = output.unwrap_or_else(|| format!("{}.envbutler", slug));
    std::fs::write(&out_path, &bytes)?;

    println!("Exported to {}", out_path);
    Ok(())
}

fn cmd_import(file: &str) -> Result<(), AppError> {
    let password = ask_password("Master Key: ")?;
    let file_bytes = std::fs::read(file)?;
    let files = file_sync::import_vault(&file_bytes, &password)?;

    let path = current_dir_str()?;
    let project_dir = std::path::Path::new(&path);
    write_files_to_dir(&files, project_dir)?;

    println!("Imported {} file(s) from {}", files.len(), file);
    Ok(())
}

fn cmd_folder_push() -> Result<(), AppError> {
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

fn cmd_folder_pull(force: bool) -> Result<(), AppError> {
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

fn cmd_status() -> Result<(), AppError> {
    let path = current_dir_str()?;
    let slug = slug_from_path(&path);

    let files = scanner::scan_project(&path, &[])?;
    let env_files: Vec<&ScannedFile> = files.iter().filter(|f| !f.blocked).collect();
    let blocked: Vec<&ScannedFile> = files.iter().filter(|f| f.blocked).collect();

    // Check if project is registered
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

fn cmd_config(url: &str, key: &str) -> Result<(), AppError> {
    if !key.starts_with("eyJ") {
        return Err(AppError::Validation(
            "Invalid key format. Use your Supabase Service Role Key (starts with eyJ...).".into(),
        ));
    }

    let existing = meta::load_config().ok();
    meta::save_config(&meta::SupabaseConfig {
        supabase_url: url.to_string(),
        supabase_service_role_key: key.to_string(),
        sync_folder: existing.and_then(|c| c.sync_folder),
    })?;

    println!("Supabase config saved.");
    Ok(())
}

fn cmd_recovery_generate() -> Result<(), AppError> {
    let mnemonic = recovery::generate_mnemonic()?;
    println!("Recovery Mnemonic (BIP39 — 24 words):");
    println!();
    println!("  {}", mnemonic);
    println!();
    println!("Write these words down and store them safely.");
    println!("This mnemonic can restore your Master Key.");
    Ok(())
}

fn cmd_recovery_restore() -> Result<(), AppError> {
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

// -- Team commands --

fn cmd_team_invite(output: Option<String>) -> Result<(), AppError> {
    let (slug, _path) = resolve_project(true)?;
    let master_key = ask_password("Master Key: ")?;
    let passphrase = ask_password("Invite passphrase (share this separately): ")?;

    print!("Your name (for token metadata): ");
    std::io::Write::flush(&mut std::io::stdout()).ok();
    let mut name = String::new();
    std::io::stdin().read_line(&mut name).map_err(|e| AppError::Io(e.to_string()))?;
    let name = name.trim();

    let config = meta::load_config()?;
    let token_bytes = team::generate_invite_token(&slug, &master_key, &config, name, &passphrase)?;

    let out_path = output.unwrap_or_else(|| format!("{}.envbutler-team", slug));
    std::fs::write(&out_path, &token_bytes)?;

    println!("Invite token saved to: {}", out_path);
    println!("Share this file + passphrase with your team member.");
    println!("They can join with: env-butler team join {}", out_path);
    Ok(())
}

fn cmd_team_join(file: &str) -> Result<(), AppError> {
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
    println!("Created by: {} ({})", payload.created_by, payload.created_at);
    println!();
    println!("You can now push/pull with your team's Master Key.");
    Ok(())
}

// -- CI commands --

fn cmd_ci_generate_token() -> Result<(), AppError> {
    let (slug, _path) = resolve_project(true)?;
    let master_key = ask_password("Master Key: ")?;
    let passphrase = ask_password("Token passphrase (internal, not shared): ")?;

    let config = meta::load_config()?;
    let token_str = ci_token::generate_service_token(&slug, &master_key, &config, "ci-service", &passphrase)?;

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

async fn cmd_ci_pull(force: bool) -> Result<(), AppError> {
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
        // In CI, warn if .env files already exist
        for filename in files.keys() {
            let target = project_dir.join(filename);
            if target.exists() {
                return Err(AppError::Validation(format!(
                    "File already exists: {}. Use --force to overwrite.", filename
                )));
            }
        }
    }

    write_files_to_dir(&files, project_dir)?;
    println!("CI pull: wrote {} file(s) for '{}'", files.len(), payload.vault_slug);
    Ok(())
}
