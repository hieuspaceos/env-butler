# Code Standards

## Rust
- **Edition**: 2021, MSRV 1.77.2
- **Workspace**: `crates/core` (shared lib), `crates/cli` (binary), `src-tauri` (Tauri app)
- **Naming**: snake_case for files, functions, variables
- **Modules**: One concern per file (crypto, scanner, vault, meta, recovery, supabase, file_sync, team, ci_token, error)
- **Error handling**: `AppError` enum with thiserror, serializes as plain string for frontend
- **Safety**: `#![deny(unsafe_code)]` at crate level
- **Dependencies**: Minimal — no OpenSSL (uses rustls), no tokio runtime (Tauri provides async)
- **Tests**: Unit tests in each module via `#[cfg(test)]`, 38 tests in core

## TypeScript/React (src/)
- **Naming**: kebab-case files, PascalCase components, camelCase functions/variables
- **State**: React hooks (useState, useCallback, useRef) — no external state library
- **Tauri IPC**: All invoke calls wrapped in `src/lib/tauri-commands.ts`
- **Error handling**: `toErrorMessage()` from `lib/error-utils.ts` for Tauri errors
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Components**: Functional components only, no class components
- **Modularization**: Pages are composition shells (<100 lines), logic in focused components
- **Testing**: Vitest + React Testing Library + jsdom, tests co-located as `*.test.ts(x)`

## Project Structure
```
src/
├── components/          # Reusable UI components
│   ├── dashboard-*.tsx  # Dashboard sub-components
│   ├── settings-*.tsx   # Settings sub-components
│   └── *.tsx            # Shared components
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and Tauri command wrappers
│   └── *.test.ts        # Co-located unit tests
├── pages/               # Full page views (composition shells)
├── app.tsx              # Root app with page routing
└── main.tsx             # Entry point

crates/
├── core/src/            # Shared Rust library (all business logic)
└── cli/src/             # CLI binary (Clap commands → core)

src-tauri/
├── src/
│   ├── lib.rs           # Tauri commands → delegates to core
│   └── main.rs          # Entry point
└── capabilities/        # Tauri permission config
```

## Commit Messages
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- No AI references
- Body explains "why", not "what"

## File Size
- Target: under 200 lines per code file
- Split large files into focused modules
- Pages are composition shells, logic in sub-components
