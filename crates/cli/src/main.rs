//! Env Butler CLI — secure .env file sync from the terminal.
//! Command handlers are split into focused modules.

mod ci_commands;
mod helpers;
mod sync_commands;
mod team_commands;

use clap::{Parser, Subcommand};
use env_butler_core::AppError;

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
        /// Supabase anon key (optional, required for Team v2)
        #[arg(long)]
        anon_key: Option<String>,
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
    /// Generate a v2 invite token (envelope encryption, no secrets shared)
    InviteV2 {
        /// Output file path (defaults to {slug}-v2.envbutler-team)
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Join a v2 team vault using an invite token
    JoinV2 {
        /// Path to .envbutler-team file
        file: String,
    },
    /// Owner approves a pending member (wraps vault key with temp passphrase)
    Approve {
        /// Member ID (hex hash from 'team list')
        member_id: String,
        /// Temp passphrase to share with the member out-of-band
        #[arg(long)]
        passphrase: String,
    },
    /// Member activates their membership using temp passphrase from owner
    Activate,
    /// List active members for the current vault
    List,
    /// Revoke a member's access
    Revoke {
        /// Member ID (hex hash from 'team list')
        member_id: String,
    },
    /// Migrate vault from v1 (password-based) to v2 (envelope encryption)
    Migrate,
    /// Generate an invite token for a team member (legacy v1)
    Invite {
        /// Output file path (defaults to {slug}.envbutler-team)
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Join a team vault using a legacy v1 invite token
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
        Commands::Init { slug } => sync_commands::cmd_init(slug)?,
        Commands::Push => sync_commands::cmd_push().await?,
        Commands::Pull { force } => sync_commands::cmd_pull(force).await?,
        Commands::Export { output } => sync_commands::cmd_export(output)?,
        Commands::Import { file } => sync_commands::cmd_import(&file)?,
        Commands::FolderPush => sync_commands::cmd_folder_push()?,
        Commands::FolderPull { force } => sync_commands::cmd_folder_pull(force)?,
        Commands::Status => sync_commands::cmd_status()?,
        Commands::Config { url, key, anon_key } => sync_commands::cmd_config(&url, &key, anon_key.as_deref())?,
        Commands::Recovery { action } => match action {
            RecoveryAction::Generate => sync_commands::cmd_recovery_generate()?,
            RecoveryAction::Restore => sync_commands::cmd_recovery_restore()?,
        },
        Commands::Team { action } => match action {
            TeamAction::InviteV2 { output } => team_commands::cmd_team_invite_v2(output).await?,
            TeamAction::JoinV2 { file } => team_commands::cmd_team_join_v2(&file).await?,
            TeamAction::Approve { member_id, passphrase } => team_commands::cmd_team_approve(&member_id, &passphrase).await?,
            TeamAction::Activate => team_commands::cmd_team_activate().await?,
            TeamAction::List => team_commands::cmd_team_list().await?,
            TeamAction::Revoke { member_id } => team_commands::cmd_team_revoke(&member_id).await?,
            TeamAction::Migrate => team_commands::cmd_team_migrate().await?,
            TeamAction::Invite { output } => team_commands::cmd_team_invite(output)?,
            TeamAction::Join { file } => team_commands::cmd_team_join(&file)?,
        },
        Commands::Ci { action } => match action {
            CiAction::GenerateToken => ci_commands::cmd_ci_generate_token()?,
            CiAction::Pull { force } => ci_commands::cmd_ci_pull(force).await?,
        },
    }
    Ok(())
}
