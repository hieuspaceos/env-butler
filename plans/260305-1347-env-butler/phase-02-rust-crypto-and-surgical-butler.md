# Phase 02: Rust Crypto + Surgical Butler

**Context:** [Plan](./plan.md) | [Brainstorm](../reports/brainstorm-260305-1344-env-butler-architecture.md)
**Blocked by:** Phase 01

## Overview
- **Priority:** P0 — core security engine
- **Status:** Pending
- **Effort:** 10h

Implement all Rust backend modules: AES-256-GCM encryption, Argon2id key derivation, BIP39 recovery kit, 3-layer Surgical Butler file scanner, project vault (zip/unzip), and metadata manager. These are the security foundations everything else builds on.

## Key Insights

- Salt must travel WITH the encrypted blob (`[salt][nonce][ciphertext]`) — never derived from project slug
- Argon2id params: memory=65536 (64MB), iterations=3, parallelism=1 (Argon2id default)
- Master Key NEVER written to disk, logs, or Tauri state — only held in memory during operation
- Layer 2 fingerprint must run BEFORE zip, so we can block individual files with clear error messages
- BIP39 mnemonic IS the recovery key — user prints/writes it offline

## Requirements

**Functional**
- `crypto.rs`: encrypt/decrypt bytes with AES-256-GCM
- `crypto.rs`: Argon2id key derivation from password string
- `recovery.rs`: generate 24-word BIP39 mnemonic, derive key from mnemonic
- `scanner.rs`: Layer 1 allowlist filter, Layer 2 content fingerprint
- `vault.rs`: collect allowed files, zip in-memory, produce manifest
- `meta.rs`: read/write `~/.env-butler/projects.json`
- All functions exposed as Tauri commands

**Non-Functional**
- No blocking calls on async Tauri command handlers — use `spawn_blocking` for CPU-heavy crypto
- All errors return typed `AppError` (thiserror), never panic in commands
- Zero secrets in log output

## Architecture

### Encryption Blob Format
```
Bytes:  [0..16]   Argon2 salt   (random, 16 bytes)
        [16..28]  AES-GCM nonce (random, 12 bytes)
        [28..]    Ciphertext
```

### Argon2id Parameters
```rust
Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::new(65536, 3, 1, None))
```

### Project Metadata (`~/.env-butler/projects.json`)
```json
{
  "projects": {
    "my-saas": {
      "slug": "my-saas",
      "path": "/Users/hieu/projects/my-saas",
      "last_sync_hash": "abc123...",
      "last_sync_at": "2026-03-05T07:00:00Z"
    }
  }
}
```

### Surgical Butler — Layer 1 Allowlist
```rust
const ALLOWED_FILENAMES: &[&str] = &[
    ".env", ".env.local",
    ".env.development", ".env.development.local",
    ".env.test", ".env.test.local",
    ".env.production", ".env.production.local",
    ".env.staging",
];
```
Custom additions stored per-project in `projects.json`.

### Surgical Butler — Layer 2 Fingerprint Rules
```rust
// Block patterns (content scan)
const BLOCK_CONTENT_PATTERNS: &[&str] = &[
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
    "-----BEGIN PRIVATE KEY-----",       // PKCS#8
    "-----BEGIN DSA PRIVATE KEY-----",
];

const WARN_CONTENT_PATTERNS: &[&str] = &[
    "-----BEGIN CERTIFICATE-----",
];

// Block filename substrings
const BLOCK_FILENAME_SUBSTRINGS: &[&str] = &[
    "id_rsa", "id_ed25519", "id_dsa", "id_ecdsa",
    ".pem", ".p12", ".pfx", ".key", ".crt",
];

// Size limit
const MAX_FILE_SIZE_BYTES: u64 = 50 * 1024; // 50KB
```

### Push Manifest (returned to frontend for Layer 3 preview)
```rust
pub struct FileManifestEntry {
    pub filename: String,
    pub size_bytes: u64,
    pub var_count: usize,        // count of KEY=VALUE lines
    pub has_sensitive_keys: bool, // contains STRIPE_, SECRET_, PRIVATE_KEY patterns
}
```

## Related Code Files

**Create/Implement:**
- `src-tauri/src/crypto.rs`
- `src-tauri/src/recovery.rs`
- `src-tauri/src/scanner.rs`
- `src-tauri/src/vault.rs`
- `src-tauri/src/meta.rs`
- `src-tauri/src/error.rs` (AppError enum)
- `src-tauri/src/lib.rs` (register all commands)

## Implementation Steps

### Step 1: Error types (`error.rs`)
```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("Blocked: {0}")]
    SecurityBlock(String),
    #[error("Crypto error: {0}")]
    Crypto(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Supabase error: {0}")]
    Supabase(String),
}
// Implement From<std::io::Error>, From<anyhow::Error>
```

### Step 2: `crypto.rs`
```rust
// derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32]>
//   → Argon2id hash of password with given salt
// encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>>
//   → generate 12B nonce → AES-256-GCM encrypt → return [salt not here][nonce][ct]
//   NOTE: caller prepends salt before calling encrypt
// decrypt(blob: &[u8], password: &str) -> Result<Vec<u8>>
//   → slice blob: salt=blob[0..16], nonce=blob[16..28], ct=blob[28..]
//   → derive_key(password, salt) → AES-256-GCM decrypt
```

### Step 3: `recovery.rs`
```rust
// generate_mnemonic() -> String
//   → Mnemonic::generate(MnemonicType::Words24) → phrase string
// mnemonic_to_password(mnemonic: &str) -> String
//   → normalize mnemonic (lowercase, trim) → use as password string
//   → caller passes to derive_key() just like a regular Master Key
```

### Step 4: `scanner.rs` (Surgical Butler)
```rust
// scan_project(project_path: &str) -> Result<Vec<ScannedFile>>
//   Layer 1: filter dir contents against ALLOWED_FILENAMES list
//   Layer 2: for each allowed file:
//     - check filename substrings → SecurityBlock
//     - check file size → SecurityBlock
//     - detect binary (null bytes in first 512 bytes) → SecurityBlock
//     - scan content for BLOCK_CONTENT_PATTERNS → SecurityBlock
//     - scan content for WARN_CONTENT_PATTERNS → warn flag (not block)
//   Returns: Vec<ScannedFile { path, filename, size, var_count, warnings, blocked }>

// count_env_vars(content: &str) -> usize
//   → count non-empty, non-comment lines containing '='

// detect_sensitive_key_names(content: &str) -> bool
//   → any line key matches: STRIPE_, SECRET_, PRIVATE_KEY, API_KEY, TOKEN, PASSWORD
```

### Step 5: `vault.rs`
```rust
// create_vault_zip(files: &[ScannedFile]) -> Result<Vec<u8>>
//   → zip all files in-memory using zip crate → return bytes
// extract_vault_zip(zip_bytes: &[u8]) -> Result<HashMap<String, String>>
//   → unzip → return filename → content map
// compute_plaintext_hash(zip_bytes: &[u8]) -> String
//   → SHA-256 hex of plaintext zip (before encryption)
//   → used for conflict detection
```

### Step 6: `meta.rs`
```rust
// meta_dir() -> PathBuf → dirs::home_dir() / ".env-butler"
// load_projects() -> Result<ProjectsConfig>
// save_projects(config: &ProjectsConfig) -> Result<()>
// update_sync_state(slug: &str, hash: &str) -> Result<()>
// get_sync_state(slug: &str) -> Option<SyncState>
```

### Step 7: Register Tauri commands in `lib.rs`
```rust
#[tauri::command]
async fn cmd_scan_project(path: String) -> Result<Vec<ScannedFile>, AppError>

#[tauri::command]
async fn cmd_encrypt_and_prepare(path: String, password: String) -> Result<EncryptedPayload, AppError>

#[tauri::command]
async fn cmd_decrypt_vault(blob_hex: String, password: String) -> Result<DecryptedManifest, AppError>

#[tauri::command]
async fn cmd_generate_recovery_kit() -> Result<String, AppError>  // returns mnemonic phrase

#[tauri::command]
async fn cmd_load_projects() -> Result<ProjectsConfig, AppError>

#[tauri::command]
async fn cmd_save_project_slug(path: String, slug: String) -> Result<(), AppError>
```

### Step 8: Verify
```bash
cd src-tauri && cargo test
cargo clippy -- -D warnings
```

## Todo

- [ ] Implement `error.rs` with AppError enum
- [ ] Implement `crypto.rs` — Argon2id + AES-256-GCM
- [ ] Implement `recovery.rs` — BIP39 mnemonic generate + derive
- [ ] Implement `scanner.rs` — Layer 1 allowlist + Layer 2 fingerprint
- [ ] Implement `vault.rs` — zip/unzip + SHA-256 hash
- [ ] Implement `meta.rs` — projects.json read/write
- [ ] Register all Tauri commands in `lib.rs`
- [ ] Write unit tests for crypto round-trip (encrypt → decrypt = original)
- [ ] Write unit tests for scanner blocking SSH key content
- [ ] `cargo test` passes, `cargo clippy` clean

## Success Criteria

- `cargo test` passes: crypto round-trip, scanner blocks, mnemonic → key derivation
- `cargo clippy -- -D warnings` clean
- Master Key never appears in any log, error message, or serialized struct
- Scanner correctly blocks a file containing `-----BEGIN OPENSSH PRIVATE KEY-----`
- Scanner correctly allows `.env.local` with normal KEY=VALUE content

## Risk Assessment

| Risk | Mitigation |
|---|---|
| AES-GCM nonce reuse (catastrophic) | Generate fresh random nonce per encrypt call via `rand::rngs::OsRng` |
| Argon2 params too slow on low-end HW | Test on M4 Mac mini; 64MB/3 iterations ~200ms acceptable |
| tiny-bip39 API differences | Read docs; `Mnemonic::generate_in(Language::English, MnemonicType::Words24)` |
| zip crate memory for large vaults | Env files < 50KB each, total vault < 500KB — not a concern |

## Security Considerations

- Use `zeroize` crate to wipe key bytes from memory after use (add `zeroize = "1"` to Cargo.toml)
- Never log password, key bytes, or plaintext content
- `OsRng` for all randomness — never `thread_rng()` for crypto material
- Clippy `#[deny(unsafe_code)]` in all crypto modules

## Next Steps

→ Phase 03: React frontend — dashboard, push preview modal, recovery kit onboarding
