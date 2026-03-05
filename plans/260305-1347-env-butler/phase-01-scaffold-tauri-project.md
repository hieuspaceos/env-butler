# Phase 01: Scaffold Tauri Project

**Context:** [Plan](./plan.md) | [Brainstorm](../reports/brainstorm-260305-1344-env-butler-architecture.md)

## Overview
- **Priority:** P0 — all other phases blocked on this
- **Status:** Pending
- **Effort:** 3h

Set up the full Tauri + React + TypeScript project with Tailwind CSS and shadcn/ui. Configure Cargo.toml with all required Rust dependencies. Initialize `~/.env-butler/` metadata structure.

## Requirements

**Functional**
- Tauri v2 app bootstrapped with React + TypeScript template
- Tailwind CSS v3 configured
- shadcn/ui initialized with dark theme as default
- Rust dependencies declared in Cargo.toml
- App opens to dashboard (empty state for now)

**Non-Functional**
- Apple Silicon (aarch64-apple-darwin) as primary build target
- Universal macOS binary capability (`universal-apple-darwin`)
- No Electron, no NSIS installer quirks

## Architecture

```
env-butler/                         ← repo root (current CWD)
├── src/                            ← React frontend
│   ├── components/
│   │   └── ui/                     ← shadcn/ui components
│   ├── pages/
│   │   └── dashboard.tsx
│   ├── lib/
│   │   └── tauri-commands.ts       ← typed wrappers for invoke()
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 ← Tauri app entry
│   │   ├── lib.rs                  ← command registrations
│   │   ├── crypto.rs               ← AES-256-GCM + Argon2id (Phase 2)
│   │   ├── scanner.rs              ← Surgical Butler layers (Phase 2)
│   │   ├── vault.rs                ← zip/unzip env files (Phase 2)
│   │   ├── supabase.rs             ← HTTP push/pull (Phase 4)
│   │   ├── meta.rs                 ← ~/.env-butler/ read/write (Phase 2)
│   │   └── recovery.rs             ← BIP39 mnemonic (Phase 2)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tailwind.config.ts
└── vite.config.ts
```

## Related Code Files

**Create:**
- All files listed in Architecture above (stubs in Phase 1, implemented in later phases)
- `src-tauri/Cargo.toml` with full dependency list
- `src-tauri/tauri.conf.json` with fs/shell allowlist
- `tailwind.config.ts`
- `components.json` (shadcn/ui config)

## Implementation Steps

1. **Bootstrap Tauri app** in current directory:
   ```bash
   npm create tauri-app@latest . -- --template react-ts --manager npm --force
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   npm install class-variance-authority clsx tailwind-merge lucide-react
   npx shadcn@latest init
   ```
   shadcn config: `style=default`, `baseColor=slate`, `cssVariables=yes`

3. **Update `Cargo.toml`** with Rust dependencies:
   ```toml
   [dependencies]
   tauri = { version = "2", features = [] }
   serde = { version = "1", features = ["derive"] }
   serde_json = "1"
   tokio = { version = "1", features = ["full"] }

   # Crypto
   aes-gcm = "0.10"
   argon2 = "0.5"
   rand = "0.8"
   sha2 = "0.10"
   hex = "0.4"

   # Recovery
   tiny-bip39 = "1.0"

   # File handling
   zip = "0.6"

   # HTTP (Supabase)
   reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }

   # Utilities
   dirs = "5.0"
   anyhow = "1.0"
   thiserror = "1.0"
   chrono = { version = "0.4", features = ["serde"] }
   ```

4. **Configure `tauri.conf.json`** allowlist:
   ```json
   {
     "app": {
       "windows": [{ "title": "Env Butler", "width": 900, "height": 650, "resizable": false }]
     },
     "plugins": {
       "fs": { "scope": ["$HOME/.env-butler/**", "$APPDATA/.env-butler/**"] },
       "shell": { "open": true }
     }
   }
   ```

5. **Create stub Rust modules** (`crypto.rs`, `scanner.rs`, `vault.rs`, `supabase.rs`, `meta.rs`, `recovery.rs`) — empty files with module declarations in `lib.rs`

6. **Set dark mode** as Tailwind default in `tailwind.config.ts`:
   ```ts
   darkMode: 'class'
   ```
   Add `dark` class to `<html>` in `index.html`

7. **Verify build:**
   ```bash
   npm run tauri dev
   ```
   App should open to blank React page with no compile errors.

8. **Initialize metadata dir** placeholder: `~/.env-butler/` (created at runtime by `meta.rs`)

## Todo

- [ ] Bootstrap Tauri project with React-TS template
- [ ] Install and configure Tailwind CSS
- [ ] Initialize shadcn/ui with dark theme
- [ ] Configure Cargo.toml with all dependencies
- [ ] Configure tauri.conf.json fs/shell allowlist
- [ ] Create stub Rust module files
- [ ] Verify `npm run tauri dev` builds without errors

## Success Criteria

- `npm run tauri dev` launches a dark-mode React app inside Tauri window
- `cargo check` passes with no errors in `src-tauri/`
- All module stubs declared in `lib.rs`
- No Electron, no CRA — pure Vite + Tauri

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Tauri v2 API breaking changes | Pin `tauri = "2.x"` exact minor |
| shadcn/ui CLI interactive prompts | Pass all flags non-interactively |
| Cargo dependency resolution conflicts | Check crates.io for compatible version matrix |

## Security Considerations

- `tauri.conf.json` fs scope must be minimal — only `~/.env-butler/**`, NOT project dirs (those are read via Rust commands, not Tauri fs plugin)
- Never expose raw file system access to frontend JS

## Next Steps

→ Phase 02: Implement Rust crypto engine and Surgical Butler scanner
