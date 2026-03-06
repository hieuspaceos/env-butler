# Code Standards

## Rust (src-tauri/)
- **Edition**: 2021, MSRV 1.77.2
- **Naming**: snake_case for files, functions, variables
- **Modules**: One concern per file (crypto, scanner, vault, meta, recovery, supabase, error)
- **Error handling**: `AppError` enum with thiserror, serializes as plain string for frontend
- **Safety**: `#![deny(unsafe_code)]` in all modules
- **Dependencies**: Minimal — no OpenSSL (uses rustls), no tokio runtime (Tauri provides async)
- **Tests**: Unit tests in each module via `#[cfg(test)]`

## TypeScript/React (src/)
- **Naming**: kebab-case files, PascalCase components, camelCase functions/variables
- **State**: React hooks (useState, useCallback, useRef) — no external state library
- **Tauri IPC**: All invoke calls wrapped in `src/lib/tauri-commands.ts`
- **Error handling**: Extract readable message from Tauri errors (may be objects, not strings)
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Components**: Functional components only, no class components

## Project Structure
```
src/
├── components/          # Reusable UI components
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and Tauri command wrappers
├── pages/               # Full page views (dashboard, onboarding, settings)
├── app.tsx              # Root app with page routing
└── main.tsx             # Entry point

src-tauri/
├── src/
│   ├── lib.rs           # Tauri commands and app setup
│   ├── main.rs          # Entry point
│   ├── crypto.rs        # AES-256-GCM + Argon2id
│   ├── scanner.rs       # Surgical Butler file scanning
│   ├── vault.rs         # Zip + hash operations
│   ├── meta.rs          # Project config management
│   ├── recovery.rs      # BIP39 mnemonic generation
│   ├── supabase.rs      # HTTP sync with Supabase
│   └── error.rs         # AppError enum
├── capabilities/        # Tauri permission config
└── Cargo.toml
```

## Commit Messages
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- No AI references
- Body explains "why", not "what"

## File Size
- Target: under 200 lines per code file
- Split large files into focused modules
