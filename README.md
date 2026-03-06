# Env Butler

Secure `.env` sync tool for developers. Zero-knowledge encryption, cross-machine sync via self-hosted Supabase.

## Features

- **Zero-Knowledge Encryption** — AES-256-GCM + Argon2id. Your Master Key never leaves your machine.
- **Surgical Butler Safety** — 3-layer protection prevents syncing SSH keys, certificates, or binary files.
- **BIP39 Recovery Kit** — 24-word mnemonic (same standard as Bitcoin wallets) for Master Key recovery.
- **Hash-Based Conflict Detection** — Variable-level masked diff view when local and remote diverge.
- **Self-Hosted** — Your Supabase instance, your data. No managed service, no vendor lock-in.

## Documentation

Full docs at [env-butler.vercel.app/docs](https://env-butler.vercel.app/docs/) — setup guide, architecture, security model, and FAQ.

## Quick Start

### 1. Install

Download from [Releases](../../releases) — macOS (universal `.dmg`) or Windows (`.exe`).

### 2. Set Up Supabase

Run the migration in your Supabase SQL Editor:

```sql
-- Copy from supabase/migrations/001_create_vault_table.sql
```

### 3. Configure

1. Open Env Butler → enter your project path and slug
2. Set your Master Key (never stored or transmitted)
3. Save your 24-word Recovery Kit offline
4. Enter your Supabase URL + anon key in Settings

### 4. Sync

- **Push**: Scans `.env` files → shows preview → encrypts → uploads to Supabase
- **Pull**: Downloads → checks conflicts → decrypts → writes files (with approval)

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop app | Tauri v2 + Rust |
| Frontend | React + TypeScript + Tailwind CSS |
| Encryption | AES-256-GCM + Argon2id |
| Recovery | BIP39 (tiny-bip39) |
| Storage | Self-hosted Supabase |
| CI/CD | GitHub Actions (public builds) |
| Landing & Docs | Next.js (static export on Vercel) |

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

# Run in development
npm run tauri dev

# Run Rust tests
cd src-tauri && cargo test

# Build for production
npm run tauri build
```

## License

MIT
