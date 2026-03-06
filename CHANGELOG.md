# Changelog

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
