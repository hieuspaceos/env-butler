# Phase 05: GitHub Actions CI/CD

**Context:** [Plan](./plan.md) | [Brainstorm](../reports/brainstorm-260305-1344-env-butler-architecture.md)
**Blocked by:** Phase 01 (needs repo structure)
**Independent of:** Phases 02–04

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 4h

Create GitHub Actions workflow that builds universal macOS `.dmg` and Windows `.exe`, generates SHA-256 checksums, attaches everything to GitHub Releases, and documents the public build process in README as a trust/transparency signal.

## Key Insights

- "Radical Transparency" is a core brand value — public builds are the proof
- Universal macOS binary = `aarch64-apple-darwin` + `x86_64-apple-darwin` merged via `lipo`
- Tauri provides `tauri-action` for building; use it with `updaterJsonPreferNightly: false`
- No paid Apple Developer certificate → document the Gatekeeper bypass clearly
- SHA-256 checksums attached to release as `checksums.txt` — link directly in README

## Requirements

**Functional**
- Build triggers on: `push` to `v*` tag (e.g. `v0.1.0`)
- macOS runner: `macos-latest` (Apple Silicon available on `macos-14`)
- Windows runner: `windows-latest`
- Artifacts: `.dmg` (universal), `.exe` (x64), `checksums.txt`
- All artifacts attached to GitHub Release automatically

**Non-Functional**
- Build must be fully reproducible from public repo — no secret build steps
- `GITHUB_TOKEN` only — no external signing secrets needed
- Build logs publicly visible

## Architecture

```
.github/
└── workflows/
    └── release.yml
supabase/
└── migrations/
    └── 001_create_vault_table.sql
README.md   ← Security Transparency section added
```

## Related Code Files

**Create:**
- `.github/workflows/release.yml`
- `supabase/migrations/001_create_vault_table.sql`

**Update:**
- `README.md` — add Security Transparency section

## Implementation Steps

### Step 1: Create `.github/workflows/release.yml`
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-14          # Apple Silicon runner
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Install frontend deps
        run: npm ci

      - name: Build universal macOS app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: Env-Butler ${{ github.ref_name }}
          releaseBody: |
            See [CHANGELOG.md](https://github.com/${{ github.repository }}/blob/main/CHANGELOG.md)
            for what's new.

            **Verify your download:** Check `checksums.txt` attached to this release.
            SHA-256 hashes are generated in the public build log — link in Actions tab.
          releaseDraft: true
          prerelease: false
          args: --target universal-apple-darwin

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install frontend deps
        run: npm ci

      - name: Build Windows app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: Env-Butler ${{ github.ref_name }}
          releaseDraft: true
          prerelease: false

  checksums:
    needs: [build-macos, build-windows]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download release assets
        uses: robinraju/release-downloader@v1
        with:
          tag: ${{ github.ref_name }}
          fileName: '*.{dmg,exe,msi}'
          out-file-path: artifacts/

      - name: Generate SHA-256 checksums
        run: |
          cd artifacts
          sha256sum * > checksums.txt
          cat checksums.txt

      - name: Upload checksums to release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          files: artifacts/checksums.txt
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Step 2: Add `supabase/migrations/001_create_vault_table.sql`
```sql
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
CREATE TABLE IF NOT EXISTS vault (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_slug   TEXT NOT NULL UNIQUE,
  encrypted_blob TEXT NOT NULL,
  plaintext_hash TEXT NOT NULL,
  metadata       JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE vault ENABLE ROW LEVEL SECURITY;

-- Allow anon key full access (data is E2E encrypted — no plaintext ever stored)
CREATE POLICY "anon_full_access" ON vault
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vault_updated_at
  BEFORE UPDATE ON vault
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Step 3: Add Security Transparency section to `README.md`
````markdown
## Security Transparency

### How Our Builds Work

Env-Butler is built **publicly** on GitHub Actions — every binary you download was compiled
from the exact source code in this repository, on GitHub-hosted runners, in logs you can inspect.

**Verify your download:**
1. Go to [Actions](../../actions) → find the release build for your version
2. Open the build log → copy the SHA-256 hash for your file
3. Compare with `checksums.txt` attached to the [Release](../../releases)

On macOS:
```bash
shasum -a 256 Env-Butler_*.dmg
```
On Windows (PowerShell):
```powershell
Get-FileHash Env-Butler_*.exe -Algorithm SHA256
```

### Why No Apple/Microsoft Certificate?

Paid certificates cost $99–$299/year and require a legal entity. To keep Env-Butler
**100% open-source and free**, we don't use them. Instead, we offer full build transparency.

**macOS Gatekeeper bypass (safe):**
```bash
xattr -d com.apple.quarantine /Applications/Env\ Butler.app
```
Or: Right-click → Open → Open (first time only).

**Windows SmartScreen bypass:**
Click "More info" → "Run anyway" — SmartScreen warns on any unsigned app,
regardless of whether it's safe.
````

## Todo

- [ ] Create `.github/workflows/release.yml`
- [ ] Create `supabase/migrations/001_create_vault_table.sql`
- [ ] Add Security Transparency section to README
- [ ] Test workflow by pushing a `v0.0.1-alpha` tag to a private repo fork
- [ ] Verify `.dmg` universal binary contains both arm64 + x86_64 slices: `lipo -info *.dmg`
- [ ] Verify `checksums.txt` appears as release asset

## Success Criteria

- Pushing tag `v0.1.0` triggers both build jobs
- macOS `.dmg` is universal (passes `lipo -info`)
- `checksums.txt` attached to release with correct SHA-256 hashes
- Build logs are public — anyone can verify the hash in the log matches the release asset
- README Security Transparency section is clear and actionable

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `macos-14` runner unavailable | Fallback to `macos-latest`; check GitHub runner availability |
| `tauri-action` version compatibility | Pin to `tauri-apps/tauri-action@v0`, check release notes |
| Windows build fails (MSVC linker) | Add `windows-latest` with Visual Studio Build Tools pre-installed (default) |
| Checksums job races with asset upload | `needs: [build-macos, build-windows]` ensures sequential |

## Security Considerations

- Only `GITHUB_TOKEN` used — no external secrets, no signing keys in CI
- Build provenance: GitHub Actions generates SLSA provenance automatically for public repos
- Never add Supabase keys or Master Key to GitHub Secrets for CI — build must work without them

## Next Steps

→ Phase 06: Landing Page (fully independent)
