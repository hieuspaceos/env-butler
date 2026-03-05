# Phase 04: Supabase Vault Sync + Conflict Diff

**Context:** [Plan](./plan.md) | [Brainstorm](../reports/brainstorm-260305-1344-env-butler-architecture.md)
**Blocked by:** Phase 02 + Phase 03

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 8h

Implement Supabase push/pull in `supabase.rs`, connect frontend Push/Pull actions to the full sync flow, implement hash-based conflict detection, and wire the variable-level diff view into the pull conflict resolution UI.

## Key Insights

- Conflict detection is **hash-based, not timestamp-based** — timestamps lie across timezones
- `plaintext_hash` in Supabase = SHA-256 of plaintext zip (before encryption) — safe to store unencrypted
- Pull must NEVER overwrite local files without user approval when a true conflict exists
- Supabase anon key is stored in `~/.env-butler/config.json` (not in app binary or env)
- RLS (Row Level Security) must be enabled from day one — rows filtered by `project_slug`

## Requirements

**Functional**
- `supabase.rs`: push encrypted blob to `vault` table
- `supabase.rs`: pull encrypted blob from `vault` table by project slug
- Conflict detection: compare `plaintext_hash` (remote) vs local computed hash vs `last_sync_hash`
- On true conflict: surface diff view in frontend, offer 3 choices (Keep Local / Use Remote / Merge manually)
- Store Supabase config (URL + anon key) in `~/.env-butler/config.json`
- Tauri commands for push, pull, check-conflict

**Non-Functional**
- HTTP via `reqwest` with rustls (no OpenSSL dependency)
- Supabase config read from disk at command invocation — never hardcoded
- Request timeout: 30s

## Architecture

### Supabase `vault` Table Schema
```sql
CREATE TABLE vault (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_slug TEXT NOT NULL UNIQUE,
  encrypted_blob TEXT NOT NULL,           -- hex-encoded [salt][nonce][ciphertext]
  plaintext_hash TEXT NOT NULL,           -- SHA-256 of plaintext zip (conflict detection)
  metadata    JSONB,                       -- { files: [{name, size, var_count}], pushed_at }
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: only allow reads/writes matching project_slug from anon key
ALTER TABLE vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_for_anon" ON vault
  USING (true) WITH CHECK (true);         -- anon key = trusted; tighten if multi-user
```

### Conflict State Machine
```
PULL REQUESTED
  ├── remote_hash = vault.plaintext_hash
  ├── local_hash  = SHA-256(current local .env.* files zipped)
  ├── last_hash   = meta.get_sync_state(slug).last_sync_hash
  │
  ├── local_hash == remote_hash     → "Already in sync" ✓
  ├── local_hash == last_hash       → "Remote updated, safe to pull" → pull & apply
  ├── remote_hash == last_hash      → "Local ahead, push reminder" (no overwrite)
  └── else                          → "TRUE CONFLICT" → show DiffView → user decides
```

### Supabase Config (`~/.env-butler/config.json`)
```json
{
  "supabase_url": "https://xxxx.supabase.co",
  "supabase_anon_key": "eyJ..."
}
```

### Push Flow (end-to-end)
```
1. cmd_scan_project(path)          → manifest (Layer 1 + 2 check)
2. [Frontend] PushPreviewModal     → user confirms (Layer 3)
3. cmd_encrypt_and_prepare(path, password)
   → scan → zip → compute plaintext_hash → encrypt → return { blob_hex, hash, metadata }
4. cmd_push_to_supabase(slug, blob_hex, hash, metadata)
   → POST to Supabase /rest/v1/vault (upsert by project_slug)
5. cmd_update_sync_state(slug, hash)
   → write to ~/.env-butler/projects.json
```

### Pull Flow (end-to-end)
```
1. cmd_pull_from_supabase(slug)
   → GET from Supabase → { blob_hex, plaintext_hash, metadata }
2. cmd_check_conflict(slug, remote_hash)
   → compute local_hash, compare with last_hash
   → return: 'in_sync' | 'safe_pull' | 'push_reminder' | 'conflict'
3a. If 'safe_pull':
    → cmd_decrypt_and_apply(blob_hex, password, project_path)
    → unzip → write files → update sync state
3b. If 'conflict':
    → cmd_decrypt_for_diff(blob_hex, password)
    → return remote KV map (masked in frontend)
    → [Frontend] DiffView → user picks Keep Local / Use Remote
    → apply choice → update sync state
```

## Related Code Files

**Create/Implement:**
- `src-tauri/src/supabase.rs` — HTTP client (push/pull/check)
- Update `src-tauri/src/meta.rs` — add `load_config()` / `save_config()`
- Update `src-tauri/src/lib.rs` — register new commands
- Update `src/pages/dashboard.tsx` — wire Push/Pull buttons to full flow
- Update `src/lib/tauri-commands.ts` — add push/pull/conflict commands

## Implementation Steps

### Step 1: Extend `meta.rs` for config
```rust
pub struct SupabaseConfig {
    pub supabase_url: String,
    pub supabase_anon_key: String,
}
// load_config() -> Result<SupabaseConfig>
// save_config(config: &SupabaseConfig) -> Result<()>
// Path: ~/.env-butler/config.json
```

### Step 2: Implement `supabase.rs`
```rust
// push_vault(config, slug, blob_hex, plaintext_hash, metadata) -> Result<()>
//   POST /rest/v1/vault with Prefer: resolution=merge-duplicates (upsert)
//   Headers: apikey, Authorization: Bearer, Content-Type: application/json

// pull_vault(config, slug) -> Result<VaultRecord>
//   GET /rest/v1/vault?project_slug=eq.{slug}&select=*
//   Return: VaultRecord { blob_hex, plaintext_hash, metadata, updated_at }

// VaultRecord uses serde::Deserialize
```

### Step 3: New Tauri commands in `lib.rs`
```rust
#[tauri::command]
async fn cmd_push_to_supabase(slug: String, blob_hex: String, hash: String, metadata: serde_json::Value) -> Result<(), AppError>

#[tauri::command]
async fn cmd_pull_from_supabase(slug: String) -> Result<VaultRecord, AppError>

#[tauri::command]
async fn cmd_check_conflict(slug: String, remote_hash: String) -> Result<ConflictStatus, AppError>
// ConflictStatus: "in_sync" | "safe_pull" | "push_reminder" | "conflict"

#[tauri::command]
async fn cmd_decrypt_and_apply(blob_hex: String, password: String, project_path: String) -> Result<Vec<String>, AppError>
// Returns list of written filenames

#[tauri::command]
async fn cmd_decrypt_for_diff(blob_hex: String, password: String) -> Result<HashMap<String, String>, AppError>
// Returns filename → content map for diff view

#[tauri::command]
async fn cmd_save_supabase_config(url: String, anon_key: String) -> Result<(), AppError>

#[tauri::command]
async fn cmd_load_supabase_config() -> Result<SupabaseConfig, AppError>
```

### Step 4: Wire Push button in `dashboard.tsx`
```ts
async function handlePush() {
  const manifest = await scanProject(projectPath)
  // → open PushPreviewModal
  // → on confirm: call encryptAndPrepare(path, masterKeyRef.current.value)
  // → call pushToSupabase(slug, blob, hash, metadata)
  // → update UI: "Last synced just now"
}
```

### Step 5: Wire Pull button in `dashboard.tsx`
```ts
async function handlePull() {
  const record = await pullFromSupabase(slug)
  const status = await checkConflict(slug, record.plaintext_hash)
  if (status === 'safe_pull') {
    await decryptAndApply(record.blob_hex, password, projectPath)
  } else if (status === 'conflict') {
    const remoteKV = await decryptForDiff(record.blob_hex, password)
    // → open DiffView modal → user picks Keep Local / Use Remote
  }
}
```

### Step 6: Supabase setup SQL
Write `supabase/migrations/001_create_vault_table.sql` with schema + RLS from Architecture section above. Document in README: "Run this migration in your Supabase SQL editor."

## Todo

- [ ] Extend `meta.rs` with config load/save
- [ ] Implement `supabase.rs` (push + pull via reqwest)
- [ ] Add conflict detection logic in `supabase.rs` or `vault.rs`
- [ ] Register all new Tauri commands
- [ ] Wire Push flow in `dashboard.tsx`
- [ ] Wire Pull flow with conflict branching in `dashboard.tsx`
- [ ] Add Supabase config form in `settings.tsx`
- [ ] Write `supabase/migrations/001_create_vault_table.sql`
- [ ] Manual integration test: push from machine A, pull on machine A (same session)

## Success Criteria

- Push: encrypted blob appears in Supabase `vault` table with correct `plaintext_hash`
- Pull (no conflict): files written to disk, `last_sync_hash` updated in `projects.json`
- Pull (conflict): DiffView opens, local files NOT overwritten until user confirms
- `cmd_check_conflict` correctly returns `'in_sync'` when hashes match
- Supabase config never hardcoded — always loaded from `~/.env-butler/config.json`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| reqwest + rustls build issues on macOS | Test with `cargo build --target aarch64-apple-darwin` |
| Supabase upsert silently fails | Check HTTP 201/200 response status, surface error to frontend |
| Conflict false positive (hash mismatch after safe pull) | Always update `last_sync_hash` immediately after successful apply |
| Large blob timeout | 30s timeout is generous for < 500KB blobs; log size in metadata |

## Security Considerations

- Supabase anon key in `config.json`: document to users this is read-only; enable RLS
- `blob_hex` in transit: HTTPS (Supabase enforces TLS) — no additional transport encryption needed
- `plaintext_hash` is safe to store unencrypted — SHA-256 of plaintext reveals nothing about content
- Never store `password`/Master Key in Supabase metadata or anywhere outside active command call

## Next Steps

→ Phase 05: GitHub Actions CI/CD (independent, can start after Phase 01)
