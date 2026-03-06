# Project Overview — Env Butler

## Purpose
Secure `.env` file sync tool for developers. Encrypts environment variables with zero-knowledge encryption and syncs across machines via self-hosted Supabase.

## Problem
Developers manually copy `.env` files between machines — insecure, error-prone, no version tracking. Existing solutions either store secrets in plaintext or require expensive managed services.

## Solution
Desktop app (Tauri + Rust) that:
- Scans project folders for `.env*` files
- Encrypts with AES-256-GCM + Argon2id (Master Key never stored/transmitted)
- Syncs encrypted blobs to self-hosted Supabase
- Detects conflicts with hash-based comparison and variable-level diff

## Key Differentiators
- **Zero-knowledge**: Master Key stays on device, only encrypted data leaves
- **Surgical Butler**: 3-layer safety prevents syncing SSH keys, certs, or binaries
- **BIP39 Recovery**: 24-word mnemonic (Bitcoin wallet standard) for key recovery
- **Self-hosted**: Your Supabase instance, no vendor lock-in
- **Open source**: Public GitHub Actions builds with SHA-256 verification

## Target Users
Solo developers and small teams needing secure cross-machine `.env` sync without managed services.

## Tech Stack
| Layer | Technology |
|---|---|
| Desktop | Tauri v2 + Rust |
| Frontend | React + TypeScript + Tailwind CSS |
| Encryption | AES-256-GCM + Argon2id |
| Recovery | BIP39 (tiny-bip39) |
| Storage | Self-hosted Supabase (PostgreSQL) |
| CI/CD | GitHub Actions |
| Landing | Next.js (static export) |
