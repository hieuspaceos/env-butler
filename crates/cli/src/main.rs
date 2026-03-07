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
        Commands::Config { url, key } => sync_commands::cmd_config(&url, &key)?,
        Commands::Recovery { action } => match action {
            RecoveryAction::Generate => sync_commands::cmd_recovery_generate()?,
            RecoveryAction::Restore => sync_commands::cmd_recovery_restore()?,
        },
        Commands::Team { action } => match action {
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
