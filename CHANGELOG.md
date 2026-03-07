# Changelog

## v0.3.0 — 2026-03-07

### Features
- **Auto-update** — Ed25519-signed updates via `tauri-plugin-updater`, banner on dashboard
- **Frontend tests** — Vitest + React Testing Library, 27 unit tests (env-parser, diff-engine, error-utils)
- **Settings modularization** — Split into project list, sync folder, Supabase form components

### Improvements
- HTTPS verified on landing (Vercel auto-enabled), updated all HTTP references
- Removed stale `fs:allow-*-with-dialog` permissions (no longer exist in Tauri v2.10)

### Platforms
- macOS (Universal), Windows (x64)

## v0.2.0 — 2026-03-07

### Features
- **CLI mode** — Full CLI binary via Cargo workspace (`crates/core`, `crates/cli`, `src-tauri`)
- **Team sharing** — Invite token system with AES-256-GCM + Argon2id encrypted `.envbutler-team` files
- **CI/CD service tokens** — Base64 bundled tokens for non-interactive pulls in CI pipelines
- **Dashboard modularization** — 603 lines split into cloud sync, file sync, team section components
- **Team UI** — Invite teammate + join via `.envbutler-team` file on dashboard

### Improvements
- Landing page: "Sync Your Way" section, hero badges (Google Drive/iCloud/Dropbox)
- 38 core Rust tests passing

### Platforms
- macOS (Universal), Windows (x64)

## v0.1.2 — 2026-03-06

### Security
- **Path traversal protection** — Validates project slugs and file paths
- **Scoped filesystem permissions** — `**` narrowed to `~/.env-butler/**` + dialog-scoped
- **Rust commands for file I/O** — `cmd_write_env_files`, `cmd_read_env_contents` replace frontend fs calls
- **`#![deny(unsafe_code)]`** at crate level
- **PGP private key blocking** in scanner
- **Config file permission 600** on Unix

### Improvements
- MIT LICENSE added
- Linux CI build added
- GitHub repo URLs fixed

## v0.1.1 — 2026-03-06

### Security
- **Service role key** — Supabase uses service_role key instead of anon key (RLS denies anon)

### Features
- **Local file sync** — Export/import encrypted `.envbutler` files (magic bytes `ENVBTLR\0`)
- **Folder-based sync** — Point to Google Drive/iCloud/Dropbox folder, push/pull auto
- **Sync folder picker** with clear button in Settings
- **Dashboard file sync** — Push/Pull buttons when sync folder configured + Export/Import for manual

### Improvements
- 30 Rust tests passing

## v0.1.0 — 2026-03-06

Initial release.

### Features
- **Zero-knowledge encryption** — AES-256-GCM + Argon2id, Master Key never stored or transmitted
- **BIP39 Recovery Kit** — 24-word mnemonic for Master Key recovery, saved as .txt file
- **Surgical Butler** — 3-layer safety (allowlist, content fingerprint, push preview)
- **Push & Pull sync** — Encrypted blob sync to self-hosted Supabase
- **Conflict detection** — Hash-based comparison with variable-level masked diff
- **Multi-project support** — Add/remove projects, switch on dashboard
- **Native folder picker** — Auto-slug from folder name
- **Settings page** — Supabase config, project management

### Platforms
- macOS (Universal — Apple Silicon + Intel)
- Windows (x64 — NSIS installer + MSI)
