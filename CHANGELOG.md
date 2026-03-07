# Changelog

## v0.5.0 — 2026-03-07

### Breaking Changes
- **Vault format v2** — Envelope encryption requires explicit migration. Existing v1 vaults must be upgraded via GUI ("Migrate to v2") or `env-butler team migrate`. Run SQL migrations `002_team_v2_envelope_encryption.sql` and `003_team_v2_rls_member_scoping.sql` in Supabase first.

### Features
- **Team v2 — per-user envelope encryption** — A random Vault Key encrypts .env data, wrapped individually per member with their own passphrase. No shared secret across the team.
- **Member-scoped RLS** — Members use Supabase anon key + Row Level Security policies. Owner retains admin access via service_role key.
- **Secure v2 invite flow** — Invite tokens contain no secrets (URL + one-time code only). Member registers their own key during join.
- **Individual revocation** — Revoke a single member without rotating the Vault Key for everyone else.
- **Explicit v1→v2 migration** — Backup-safe upgrade path via GUI button or CLI command.

### New CLI Commands
- `env-butler team invite-v2` — generate a v2 invite token
- `env-butler team join-v2 <file>` — join via v2 invite
- `env-butler team approve <member-id> --passphrase <temp>` — owner approves member
- `env-butler team activate` — member activates membership
- `env-butler team list` — list vault members
- `env-butler team revoke <member-id>` — revoke a member
- `env-butler team migrate` — upgrade vault to v2

### New Modules
- `envelope.rs` — per-member key wrapping (AES-256-GCM)
- `supabase_team.rs` — team member CRUD against Supabase
- `vault_migration.rs` — v1→v2 migration logic

### Platforms
- macOS (Universal), Windows (x64)

## v0.4.0 — 2026-03-07

### Breaking Changes
- **Mnemonic IS the Master Key** — BIP39 24-word mnemonic now serves as the encryption key directly. No separate custom password step. Existing vaults encrypted with old custom passwords must be re-encrypted.

### Security
- Team invite + CI token now display warnings about shared credentials
- Onboarding saves Supabase config during setup
- `toErrorMessage` handles null/undefined safely
- Custom base64 replaced with `base64` crate

### Improvements
- "Anon Key" label renamed to "Service Role Key" in Settings
- Version bumped to 0.4.0 across all manifests
- 20 new component tests (master-key-input, diff-view, project-status-card) — 47 total frontend tests

### Platforms
- macOS (Universal), Windows (x64)

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
