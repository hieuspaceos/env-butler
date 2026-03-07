# System Architecture

## Overview
Tauri v2 desktop app + CLI, both backed by shared Rust core. All crypto in Rust. Frontend is purely UI — no secrets touch JavaScript.

## Component Diagram

```
                          Cargo Workspace
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              React Frontend (src/)               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │   │
│  │  │Dashboard │ │Onboarding│ │     Settings     │ │   │
│  │  │ (shell)  │ │          │ │     (shell)      │ │   │
│  │  └────┬─────┘ └────┬─────┘ └──────┬───────────┘ │   │
│  │       └─────────────┼──────────────┘             │   │
│  │              invoke() IPC                        │   │
│  ├──────────────────────────────────────────────────┤   │
│  │           src-tauri/ (Tauri commands)             │   │
│  │           lib.rs → delegates to core              │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼───────────────────────────┐   │
│  │              crates/core/ (shared library)        │   │
│  │  ┌────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐ │   │
│  │  │ crypto │ │scanner │ │recovery │ │file_sync │ │   │
│  │  │AES-256 │ │Surgical│ │ BIP39   │ │.envbutler│ │   │
│  │  │Argon2id│ │Butler  │ │mnemonic │ │  files   │ │   │
│  │  └────────┘ └────────┘ └─────────┘ └──────────┘ │   │
│  │  ┌────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐ │   │
│  │  │ vault  │ │  meta  │ │supabase │ │  team    │ │   │
│  │  │zip+hash│ │projects│ │HTTP sync│ │ invite   │ │   │
│  │  │        │ │config  │ │reqwest  │ │ tokens   │ │   │
│  │  └────────┘ └────────┘ └────┬────┘ └──────────┘ │   │
│  │                    ┌────────┘  ┌──────────┐      │   │
│  │                    │           │ci_token  │      │   │
│  │                    │           │ service  │      │   │
│  │                    │           │ tokens   │      │   │
│  │                    │           └──────────┘      │   │
│  └────────────────────┼────────────────────────────-┘   │
│                       │                                 │
│  ┌────────────────────┼─────────────────────────────┐   │
│  │     crates/cli/ (CLI binary)                      │   │
│  │     12 commands, same core library                │   │
│  └────────────────────┼─────────────────────────────┘   │
└───────────────────────┼─────────────────────────────────┘
                        │ HTTPS
               ┌────────▼────────┐
               │    Supabase     │
               │  (self-hosted)  │
               │   vault table   │
               └─────────────────┘
```

## 3 Sync Methods

```
1. Supabase Cloud     User ──push/pull──► Supabase (encrypted blob)
2. Folder-Based       User ──push/pull──► Google Drive/iCloud/Dropbox folder
3. Portable Files     User ──export──► .envbutler file ──import──► another machine
```

## Data Flow

### Push
1. Scanner finds `.env*` files (allowlist → fingerprint → preview)
2. Vault zips all allowed files, computes SHA-256 hash
3. Crypto encrypts zip with AES-256-GCM (key derived via Argon2id from Master Key)
4. Supabase module upserts encrypted blob + hash to vault table

### Pull
1. Supabase module fetches encrypted blob + remote hash
2. Scanner + Vault compute local hash for comparison
3. Conflict detection: InSync / SafePull / PushReminder / Conflict
4. If conflict: decrypt remote, parse both sides, show variable-level diff
5. User chooses: accept remote or keep local

### Team Sharing
1. Inviter generates encrypted `.envbutler-team` file (AES-256-GCM + Argon2id)
2. File contains Supabase config + project slug, encrypted with shared passphrase
3. Joiner imports file with passphrase → project auto-configured

### CI/CD
1. Generate base64 service token (bundles passphrase + invite token)
2. Set `ENVBUTLER_TOKEN` as CI secret
3. `env-butler ci pull` decodes token, joins team, pulls env files

## Encryption Format
```
[salt: 16 bytes][nonce: 12 bytes][ciphertext: variable]
```
- Salt: random per encryption, used by Argon2id to derive key
- Nonce: random per encryption, used by AES-256-GCM
- Ciphertext: AES-256-GCM encrypted zip archive

## File Sync Format
```
[magic: ENVBTLR\0 (8 bytes)][version: 1 byte][encrypted blob: variable]
```

## File Structure
```
~/.env-butler/
├── projects.json    # Project slugs, paths, sync state
└── config.json      # Supabase URL + service role key (mode 600)
```

## Supabase Schema
```sql
vault (
  id            uuid PRIMARY KEY,
  project_slug  text UNIQUE NOT NULL,
  encrypted_blob text NOT NULL,
  plaintext_hash text NOT NULL,
  metadata       jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
)
```

## Security Model
- Master Key: never stored, never transmitted — only held in memory during operation
- Argon2id: memory-hard KDF, resistant to GPU/ASIC attacks
- AES-256-GCM: authenticated encryption, tamper detection
- Supabase sees only encrypted blobs — zero-knowledge
- BIP39 recovery: deterministic key derivation from 24-word mnemonic
- `#![deny(unsafe_code)]` enforced at crate level
- Filesystem scoped to `~/.env-butler/**` + dialog-picked paths only
- Config files use permission 600 on Unix
