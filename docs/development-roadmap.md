# Development Roadmap

## Phase 1: Core App (Complete)
- [x] Tauri v2 scaffold with React + TypeScript + Tailwind
- [x] Rust crypto engine (AES-256-GCM, Argon2id, BIP39)
- [x] Surgical Butler 3-layer safety scanner
- [x] React frontend (dashboard, onboarding, settings)
- [x] Supabase vault sync with hash-based conflict detection
- [x] GitHub Actions CI/CD (macOS + Windows + Linux)
- [x] Next.js landing page

## Phase 2: UX Polish (Complete)
- [x] Native folder picker (tauri-plugin-dialog)
- [x] Auto-populate project slug from folder name
- [x] Recovery kit file save
- [x] Project management in Settings (add/remove/list)
- [x] Multi-project switcher on dashboard
- [x] Readable error messages
- [x] Informational tone for sensitive key warnings

## Phase 3: Sync Methods (Complete)
- [x] Local file sync — export/import encrypted .envbutler files
- [x] Folder-based sync — Google Drive, iCloud, Dropbox
- [x] Sync folder picker with clear button in Settings

## Phase 4: CLI + Team Sharing (Complete)
- [x] Cargo workspace restructuring (crates/core, crates/cli, src-tauri)
- [x] Full CLI binary with 12 commands
- [x] Team sharing — invite token system (.envbutler-team files)
- [x] CI/CD service tokens for non-interactive pulls

## Phase 5: Security + Polish (Complete)
- [x] Security audit — tighten fs scope, path traversal protection
- [x] `#![deny(unsafe_code)]` at crate level
- [x] PGP private key blocking in scanner
- [x] Config file permission 600 on Unix
- [x] Dashboard modularization (603 → 90 lines shell)
- [x] Settings modularization (307 → 75 lines shell)
- [x] MIT LICENSE, repo URLs fixed

## Phase 6: Auto-Update + Testing (Complete)
- [x] Tauri auto-update plugin (Ed25519 signing)
- [x] Update checker banner on dashboard
- [x] Frontend unit tests (Vitest + React Testing Library)
- [x] 38 Rust core tests, 47 frontend tests
- [x] HTTPS on landing (Vercel)
- [x] CHANGELOG.md up to v0.4.0

## Phase 7: v0.4.0 Breaking Changes (Complete)
- [x] BIP39 mnemonic IS the Master Key (no separate password)
- [x] Onboarding: generate → save mnemonic offline → done
- [x] Team invite + CI token warn about shared credentials
- [x] Security audit: service role key, scoped fs, unsafe_code denial
- [x] Version to 0.4.0

## Phase 8: Future (Backlog)
- [ ] E2E tests (Playwright for full Tauri runtime)
- [ ] Per-user envelope encryption (team v2)
- [ ] Auto-sync on file change (file watcher)
- [ ] Multiple Supabase instances per project
- [ ] CI test pipeline
- [ ] File sync write locking
