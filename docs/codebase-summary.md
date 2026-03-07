# Codebase Summary

## Stats
- **Rust**: 12 modules across core + tauri, ~2,400 LOC, 38 unit tests
- **TypeScript/React**: 17 component/page files + 6 lib files, ~1,400 LOC, 47 unit tests
- **CLI**: Rust binary, 12 commands (init, push, pull, folder-push, folder-pull, export, import, team, ci, recovery, status, config)
- **Landing**: Next.js static site, ~400 LOC
- **CI/CD**: GitHub Actions release workflow (macOS + Windows + Linux)

## Key Files

### Rust Core (`crates/core/src/`)
| File | Purpose | LOC |
|---|---|---|
| `crypto.rs` | AES-256-GCM encrypt/decrypt, Argon2id KDF | ~130 |
| `scanner.rs` | Surgical Butler 3-layer file scanning | ~300 |
| `vault.rs` | Zip archive + SHA-256 hashing | ~130 |
| `meta.rs` | Project/Supabase config in ~/.env-butler/ | ~180 |
| `recovery.rs` | BIP39 24-word mnemonic (Master Key) generation & derivation | ~60 |
| `supabase.rs` | HTTP push/pull to Supabase vault table | ~180 |
| `file_sync.rs` | Export/import encrypted .envbutler files | ~200 |
| `team.rs` | Invite token generation/parsing (AES-256-GCM + Argon2id) | ~180 |
| `ci_token.rs` | Base64 encode/decode CI service tokens | ~100 |
| `error.rs` | AppError enum, serializes as string | ~35 |

### Tauri Backend (`src-tauri/src/`)
| File | Purpose |
|---|---|
| `lib.rs` | Tauri commands, app setup, plugin registration |
| `main.rs` | Entry point |

### CLI (`crates/cli/src/`)
| File | Purpose |
|---|---|
| `main.rs` | Clap CLI with 12 subcommands |

### React Frontend (`src/`)
| File | Purpose |
|---|---|
| `pages/dashboard.tsx` | Composition shell (~90 lines) |
| `pages/onboarding.tsx` | First-run wizard: project + mnemonic (Master Key) + save offline + Supabase |
| `pages/settings.tsx` | Composition shell (~75 lines) |
| `components/dashboard-cloud-sync.tsx` | Supabase push/pull + conflict resolution |
| `components/dashboard-file-sync.tsx` | Export/import + folder-based sync |
| `components/dashboard-team-section.tsx` | Team invite/join UI |
| `components/settings-project-list.tsx` | Project add/remove |
| `components/settings-sync-folder.tsx` | Cloud folder picker |
| `components/settings-supabase-form.tsx` | Supabase URL + key form |
| `components/push-preview-modal.tsx` | Layer 3: non-skippable push review |
| `components/recovery-kit-display.tsx` | BIP39 word grid + file save |
| `components/diff-view.tsx` | Variable-level masked conflict diff |
| `components/master-key-input.tsx` | Secure mnemonic input (ref-based, v0.4.0: mnemonic is the key) |
| `components/project-status-card.tsx` | Sync status badge + actions |
| `components/update-checker.tsx` | Auto-update banner |
| `lib/tauri-commands.ts` | Typed wrappers for all Tauri invoke() calls |
| `lib/env-parser.ts` | .env file parsing + value masking |
| `lib/diff-engine.ts` | Variable-level diff computation |
| `lib/error-utils.ts` | Error message extraction |
| `hooks/use-project-state.ts` | Active project state management |

### Infrastructure
| File | Purpose |
|---|---|
| `.github/workflows/release.yml` | CI/CD: macOS universal + Windows + Linux builds |
| `supabase/migrations/001_create_vault_table.sql` | Database schema |
| `landing/` | Next.js landing page (static export) |
| `vitest.config.ts` | Frontend test configuration |
