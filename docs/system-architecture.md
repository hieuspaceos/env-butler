# System Architecture

## Overview
Tauri v2 desktop app with Rust backend and React frontend. All crypto operations in Rust. Frontend is purely UI — no secrets touch JavaScript.

## Component Diagram

```
┌──────────────────────────────────────────────┐
│                 React Frontend               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │Dashboard │ │Onboarding│ │   Settings   │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       └─────────────┼──────────────┘         │
│              invoke() IPC                    │
├──────────────────────────────────────────────┤
│                 Rust Backend                 │
│  ┌────────┐ ┌────────┐ ┌─────────────────┐  │
│  │ crypto │ │scanner │ │    recovery     │  │
│  │AES-256 │ │Surgical│ │   BIP39 24w     │  │
│  │Argon2id│ │Butler  │ │   mnemonic      │  │
│  └────────┘ └────────┘ └─────────────────┘  │
│  ┌────────┐ ┌────────┐ ┌─────────────────┐  │
│  │ vault  │ │  meta  │ │    supabase     │  │
│  │zip+hash│ │projects│ │   HTTP sync     │  │
│  │        │ │config  │ │   reqwest+tls   │  │
│  └────────┘ └────────┘ └────────┬────────┘  │
└──────────────────────────────────┼───────────┘
                                   │ HTTPS
                          ┌────────▼────────┐
                          │    Supabase     │
                          │  (self-hosted)  │
                          │   vault table   │
                          └─────────────────┘
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

## Encryption Format
```
[salt: 16 bytes][nonce: 12 bytes][ciphertext: variable]
```
- Salt: random per encryption, used by Argon2id to derive key
- Nonce: random per encryption, used by AES-256-GCM
- Ciphertext: AES-256-GCM encrypted zip archive

## File Structure
```
~/.env-butler/
├── projects.json    # Project slugs, paths, sync state
└── config.json      # Supabase URL + service role key
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
