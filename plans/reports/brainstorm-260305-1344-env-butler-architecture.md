# Brainstorm Report: Env-Butler Architecture
**Date:** 2026-03-05 | **Status:** Complete → Ready for Implementation Plan

---

## Problem Statement
Build a secure `.env` sync tool for developers: zero-knowledge encryption, cross-machine sync via Supabase, team-sharing, and radical transparency via public GitHub builds.

---

## Final Stack Decision
| Layer | Choice | Rationale |
|---|---|---|
| Desktop app | Tauri + Rust | Native perf, Apple Silicon first-class, no Electron bloat |
| Frontend | React + Tailwind + shadcn/ui | Familiar, fast to build |
| Encryption | AES-256-GCM + Argon2id | Industry standard ZK pattern |
| Recovery | tiny-bip39 (Rust) | "Same standard as Bitcoin wallets" — trust signal |
| Storage | Supabase (self-hosted only) | No service obligation, user-owned data |
| Landing page | Next.js static export (or Astro) | Marketing site, no SSR needed |
| CI/CD | GitHub Actions | Public builds = transparency |

---

## Architecture Decisions

### Encryption Blob Format
```
[ Argon2id salt (16B) ][ AES-GCM nonce (12B) ][ ciphertext ]
```
Salt travels with the blob — consistent across machines. Standard practice.

### Project Identity
User assigns a **project slug** on first push. Stored in `~/.env-butler/projects.json`.
Remote vault key = SHA-256(slug). Avoids path collision across machines.

### Team Mode (v1)
Shared vault password = shared Master Key. All team members use same password.
Key exchange is manual (out-of-app scope, documented: "use 1Password/Bitwarden to share").
Per-user envelope encryption deferred to v2.

### Sync Metadata Location
`~/.env-butler/` global directory. Per-project sync state keyed by project slug.

### Conflict Detection (hash-based, not timestamp)
```
pull_requested:
  remote_hash = vault.plaintext_hash (stored in Supabase)
  local_hash  = SHA-256(current .env.* files)
  last_hash   = ~/.env-butler/projects.json[slug].last_sync_hash

  local == remote          → already in sync
  local == last_hash       → safe pull (only remote changed)
  remote == last_hash      → push reminder (only local changed)
  else                     → TRUE CONFLICT → DiffView
```

### Supabase vault table
```sql
id UUID PRIMARY KEY,
project_slug TEXT UNIQUE NOT NULL,
encrypted_blob BYTEA NOT NULL,
plaintext_hash TEXT NOT NULL,
updated_at TIMESTAMPTZ DEFAULT NOW(),
metadata JSONB  -- file list, var counts, sizes
```
RLS: rows scoped to project_slug. Enable from day one.

### BIP39 Recovery Kit
```
tiny-bip39 → 24-word mnemonic → mnemonic.to_seed("") → 64-byte seed
→ Argon2id(seed[0..32], salt, params) → 32-byte AES key
```
Recovery Kit = the 24-word mnemonic. Printed/saved offline by user.
Marketing: "Secured by the same recovery standard as Bitcoin wallets."

---

## Surgical Butler: 3-Layer Safety System (Core Competitive Advantage)

### Layer 1 — Strict Allowlist (not glob scan)
Only sync files matching explicit list:
```
.env, .env.local,
.env.development, .env.development.local,
.env.test, .env.test.local,
.env.production, .env.production.local,
.env.staging
```
User can add custom entries. Nothing else touched.

### Layer 2 — Rust Content Fingerprinting (pre-push)
| Trigger | Action |
|---|---|
| `-----BEGIN * PRIVATE KEY-----` in content | Block + warn |
| `-----BEGIN CERTIFICATE-----` in content | Warn |
| filename contains `id_rsa`, `id_ed25519`, `.pem`, `.p12` | Block + warn |
| file size > 50KB | Block |
| binary content detected | Block |

### Layer 3 — Mandatory Push Preview (non-skippable modal)
```
About to encrypt and push:
  .env.local         (12 vars, 847 bytes)
  .env.development   (8 vars, 623 bytes)
  .env.production    (15 vars — contains STRIPE_SECRET_KEY)

[Cancel]  [Push Securely →]
```

### Smart Variable-Level Diff (Pull Conflict)
Parse .env files into Key-Value pairs. Never show raw file diff.

Masking rule: show first 4 + last 4 chars of values > 8 chars.
```
STRIPE_KEY: sk_li...abcd  →  sk_li...wxyz  (CHANGED)
NEW_VAR:    (not present)  →  val...1234   (ADDED)
OLD_VAR:    old...5678     →  (removed)    (DELETED)
```
Visual legend: green = Added, yellow = Changed, red = Deleted.

---

## Rust Backend Module Plan
```
src-tauri/src/
├── crypto.rs      → Argon2id + AES-256-GCM enc/dec
├── vault.rs       → zip/unzip .env.* files, blob packing
├── scanner.rs     → Layer 1 allowlist + Layer 2 fingerprinting
├── supabase.rs    → HTTP push/pull (reqwest)
├── meta.rs        → ~/.env-butler/ read/write, projects.json
└── recovery.rs    → tiny-bip39 mnemonic generation
```

---

## Phase Sequence
| Phase | Scope |
|---|---|
| 1 | Tauri scaffold + crypto + scanner + push preview UI + Recovery Kit (onboarding) |
| 2 | Supabase push/pull + conflict detection + variable-level diff view |
| 3 | GitHub Actions — universal .dmg, .exe, SHA-256 checksums, README transparency |
| 4 | Landing page (Next.js static or Astro) — dark mode, core values, bypass guide |

---

## Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Salt inconsistency across machines | Salt prepended to blob, travels with data |
| Project name collision | User-assigned slug, not folder name |
| SSH key accidentally synced | Layer 1 allowlist + Layer 2 fingerprint blocks it |
| Supabase anon key exposed | RLS scoped to project_slug from day one |
| macOS Gatekeeper friction | Document `xattr -d com.apple.quarantine`, explain public build process |
| Team key exchange outside app | Document: share via 1Password/Bitwarden, not Env-Butler |

---

## Unresolved Questions
- None. All critical decisions finalized.
