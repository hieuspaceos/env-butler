# Codebase Summary

## Stats
- **Rust**: 7 modules, ~1,100 LOC, 26 unit tests
- **TypeScript/React**: 10 files, ~800 LOC
- **Landing**: Next.js static site, ~300 LOC
- **CI/CD**: GitHub Actions release workflow

## Key Files

### Rust Backend
| File | Purpose | LOC |
|---|---|---|
| `lib.rs` | Tauri commands, app setup | ~210 |
| `crypto.rs` | AES-256-GCM encrypt/decrypt, Argon2id KDF | ~130 |
| `scanner.rs` | Surgical Butler 3-layer file scanning | ~300 |
| `vault.rs` | Zip archive + SHA-256 hashing | ~130 |
| `meta.rs` | Project/Supabase config in ~/.env-butler/ | ~180 |
| `recovery.rs` | BIP39 24-word mnemonic generation | ~60 |
| `supabase.rs` | HTTP push/pull to Supabase vault table | ~180 |
| `error.rs` | AppError enum, serializes as string | ~35 |

### React Frontend
| File | Purpose |
|---|---|
| `pages/dashboard.tsx` | Main view: push/pull, conflict resolution |
| `pages/onboarding.tsx` | First-run wizard: project + key + recovery + Supabase |
| `pages/settings.tsx` | Project management + global Supabase config |
| `components/push-preview-modal.tsx` | Layer 3: non-skippable push review |
| `components/recovery-kit-display.tsx` | BIP39 word grid + file save |
| `components/diff-view.tsx` | Variable-level masked conflict diff |
| `components/master-key-input.tsx` | Secure password input |
| `components/project-status-card.tsx` | Sync status badge + actions |
| `hooks/use-project-state.ts` | Active project state management |
| `lib/tauri-commands.ts` | Typed wrappers for all Tauri invoke() calls |

### Infrastructure
| File | Purpose |
|---|---|
| `.github/workflows/release.yml` | CI/CD: macOS universal + Windows builds |
| `supabase/migrations/001_create_vault_table.sql` | Database schema |
| `landing/` | Next.js landing page (static export) |
