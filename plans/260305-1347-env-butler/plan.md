---
title: "Env-Butler: Secure .env Sync Tool"
description: "Zero-knowledge encrypted .env sync via Tauri + Rust + Supabase with Surgical Butler safety system"
status: pending
priority: P0
effort: 40h
issue: ~
branch: main
tags: [tauri, rust, react, supabase, crypto, zero-knowledge]
created: 2026-03-05
---

# Env-Butler Implementation Plan

## Overview

Desktop app (Tauri + Rust + React) that syncs encrypted `.env.*` files across machines via Supabase. Zero-knowledge: Master Key never stored or transmitted. "Surgical Butler" safety system prevents accidental sync of SSH keys or certificates.

**Context:** [Brainstorm Report](../reports/brainstorm-260305-1344-env-butler-architecture.md)

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Scaffold Tauri Project | Pending | 3h | [phase-01](./phase-01-scaffold-tauri-project.md) |
| 2 | Rust Crypto + Surgical Butler | Pending | 10h | [phase-02-rust-crypto-and-surgical-butler.md](./phase-02-rust-crypto-and-surgical-butler.md) |
| 3 | React Frontend Dashboard | Pending | 8h | [phase-03](./phase-03-react-frontend-dashboard.md) |
| 4 | Supabase Vault Sync + Conflict Diff | Pending | 8h | [phase-04](./phase-04-supabase-vault-sync.md) |
| 5 | GitHub Actions CI/CD | Pending | 4h | [phase-05](./phase-05-github-actions-cicd.md) |
| 6 | Landing Page | Pending | 7h | [phase-06](./phase-06-landing-page.md) |

## Key Architecture Decisions

- **Encryption**: AES-256-GCM + Argon2id. Blob format: `[salt 16B][nonce 12B][ciphertext]`
- **Recovery**: BIP39 24-word mnemonic (tiny-bip39 Rust crate) — "same standard as Bitcoin wallets"
- **Safety**: 3-layer Surgical Butler (allowlist → fingerprint → push preview modal)
- **Conflict**: hash-based detection, variable-level masked diff view
- **Identity**: user-assigned project slug (not folder path), stored in `~/.env-butler/projects.json`
- **Team v1**: shared vault password. Per-user envelope encryption deferred to v2.
- **Storage**: self-hosted Supabase only. No HSpace managed service.

## Dependencies

- Phase 2 must complete before Phase 3 (frontend calls Tauri commands)
- Phase 4 requires Phase 2 (crypto) and Phase 3 (UI components)
- Phase 5 is independent — can start after Phase 1
- Phase 6 is fully independent
