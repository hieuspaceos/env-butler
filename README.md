# Env Butler

Secure `.env` sync tool for developers. Zero-knowledge encryption, cross-machine sync — GUI and CLI.

## Features

- **Zero-Knowledge Encryption** — AES-256-GCM + Argon2id. Your Master Key never leaves your machine.
- **Surgical Butler Safety** — 3-layer protection prevents syncing SSH keys, certificates, or binary files.
- **BIP39 Recovery Kit** — 12-word mnemonic (same standard as Bitcoin wallets) for Master Key recovery.
- **Hash-Based Conflict Detection** — Variable-level masked diff view when local and remote diverge.
- **3 Sync Methods** — Supabase cloud, folder-based (Google Drive/iCloud/Dropbox), or portable `.envbutler` files.
- **CLI + GUI** — Desktop app (Tauri) and terminal CLI share the same Rust core.
- **Self-Hosted** — Your Supabase instance, your data. No managed service, no vendor lock-in.

## Documentation

Full docs at [env-butler.vercel.app/docs](https://env-butler.vercel.app/docs/) — setup guide, architecture, security model, and FAQ.

## Quick Start

### Desktop App

Download from [Releases](../../releases) — macOS (universal `.dmg`) or Windows (`.exe`).

1. Open Env Butler → enter your project path and slug
2. Set your Master Key (never stored or transmitted)
3. Save your 12-word Recovery Kit offline
4. Enter your Supabase URL + Service Role Key in Settings
5. **Push/Pull** to sync via Supabase, Google Drive, iCloud, or Dropbox

### CLI

```bash
# Install from source
cargo install --path crates/cli

# Initialize project
cd ~/my-project
env-butler init

# Configure Supabase (optional)
env-butler config --url https://xxx.supabase.co --key eyJ...

# Sync via Supabase
env-butler push
env-butler pull

# Sync via folder (Google Drive, iCloud, Dropbox)
env-butler folder-push
env-butler folder-pull

# Portable file sync
env-butler export
env-butler import project.envbutler

# Recovery
env-butler recovery generate
env-butler recovery restore

# Status
env-butler status
```

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop app | Tauri v2 + Rust |
| CLI | Rust + Clap |
| Frontend | React + TypeScript + Tailwind CSS |
| Encryption | AES-256-GCM + Argon2id |
| Recovery | BIP39 (tiny-bip39) |
| Storage | Self-hosted Supabase / Google Drive / iCloud / Dropbox |
| CI/CD | GitHub Actions (public builds) |
| Landing & Docs | Next.js (static export on Vercel) |

## Architecture

```
Cargo.toml (workspace)
├── crates/core/     — shared Rust library (crypto, vault, scanner, sync)
├── crates/cli/      — CLI binary (env-butler)
└── src-tauri/       — desktop app (Tauri commands → core)
```

## Surgical Butler: 3-Layer Safety

1. **Allowlist** — Only syncs `.env`, `.env.local`, `.env.development`, etc.
2. **Content Fingerprint** — Blocks SSH private keys, certificates, binary files, files > 50KB
3. **Push Preview** — Non-skippable modal showing every file, var count, and sensitive key warnings

## Security Transparency

### How Our Builds Work

Env Butler is built **publicly** on GitHub Actions — every binary was compiled from the exact source code in this repository, on GitHub-hosted runners, in logs you can inspect.

**Verify your download:**
1. Go to [Actions](../../actions) → find the release build for your version
2. Open the build log → find the SHA-256 hash for your file
3. Compare with `checksums.txt` attached to the [Release](../../releases)

On macOS:
```bash
shasum -a 256 Env-Butler_*.dmg
```

On Windows (PowerShell):
```powershell
Get-FileHash Env-Butler_*.exe -Algorithm SHA256
```

### Why No Apple/Microsoft Certificate?

Paid certificates cost $99–$299/year and require a legal entity. To keep Env Butler **100% open-source and free**, we don't use them. Instead, we offer full build transparency.

**macOS Gatekeeper bypass:**
```bash
xattr -d com.apple.quarantine /Applications/Env\ Butler.app
```
Or: Right-click → Open → Open (first time only).

**Windows SmartScreen:** Click "More info" → "Run anyway".

## Development

```bash
# Install dependencies
npm install

# Run desktop app in development
npm run tauri dev

# Run Rust tests
cargo test

# Build CLI only
cargo build -p env-butler-cli

# Build desktop app for production
npm run tauri build
```

## License

MIT
