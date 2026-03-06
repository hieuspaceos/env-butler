# Development Roadmap

## Phase 1: Core App (Complete)
- [x] Tauri v2 scaffold with React + TypeScript + Tailwind
- [x] Rust crypto engine (AES-256-GCM, Argon2id, BIP39)
- [x] Surgical Butler 3-layer safety scanner
- [x] React frontend (dashboard, onboarding, settings)
- [x] Supabase vault sync with hash-based conflict detection
- [x] GitHub Actions CI/CD (macOS + Windows)
- [x] Next.js landing page

## Phase 2: UX Polish (Complete)
- [x] Native folder picker (tauri-plugin-dialog)
- [x] Auto-populate project slug from folder name
- [x] Recovery kit file save (replace broken window.print)
- [x] Project management in Settings (add/remove/list)
- [x] Multi-project switcher on dashboard
- [x] Readable error messages (fix JSON serialization)
- [x] Informational tone for sensitive key warnings

## Phase 3: Production Readiness (Planned)
- [ ] End-to-end Supabase sync testing
- [ ] Landing page deployment (Vercel)
- [ ] Project documentation
- [ ] Remove dead code (unused SecurityBlock variant)
- [ ] Gitignore housekeeping (.claude/, .opencode/, etc.)

## Phase 4: Future (Backlog)
- [ ] Per-user envelope encryption (team v2)
- [ ] CLI companion tool
- [ ] Auto-sync on file change (file watcher)
- [ ] Multiple Supabase instances per project
- [ ] Linux builds
