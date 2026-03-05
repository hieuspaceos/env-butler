# Phase 03: React Frontend Dashboard

**Context:** [Plan](./plan.md) | [Brainstorm](../reports/brainstorm-260305-1344-env-butler-architecture.md)
**Blocked by:** Phase 02

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 8h

Build all React UI: dark-mode dashboard, onboarding wizard (Master Key + BIP39 Recovery Kit), Surgical Butler push preview modal, and the variable-level masked diff view for pull conflicts.

## Key Insights

- Push Preview modal (Layer 3) must be non-skippable — no keyboard shortcut to bypass, confirm button only enabled after user reads manifest
- Diff view parses KEY=VALUE pairs, masks values > 8 chars to `first4...last4`
- Master Key input: never stored in React state longer than needed, cleared after command invoke
- "Butler-style" UI: clean, minimal, professional — think Vercel dashboard, not a settings panel

## Requirements

**Functional**
- Dashboard: auto-detect current project folder, show sync status badge
- Onboarding: Master Key setup + BIP39 Recovery Kit display (first-run only)
- Push flow: scan → push preview modal → confirm → encrypt → upload
- Pull flow: download → conflict check → diff view (if conflict) → decrypt → write files
- Settings: Supabase URL + anon key configuration, project slug assignment
- Project list: switch between tracked projects

**Non-Functional**
- Dark mode by default (Tailwind `dark` class on `<html>`)
- shadcn/ui components throughout — no custom CSS except Tailwind utilities
- All Tauri command calls typed via `src/lib/tauri-commands.ts`
- No sensitive values in React DevTools (use `useRef` not `useState` for Master Key input)

## Architecture

```
src/
├── components/
│   ├── ui/                          ← shadcn/ui (Button, Badge, Dialog, etc.)
│   ├── push-preview-modal.tsx       ← Layer 3 non-skippable manifest modal
│   ├── diff-view.tsx                ← Variable-level masked diff
│   ├── recovery-kit-display.tsx     ← BIP39 mnemonic reveal + print
│   ├── project-status-card.tsx      ← Sync status, last sync time, file list
│   └── master-key-input.tsx         ← Secure password input (no state leak)
├── pages/
│   ├── dashboard.tsx                ← Main view
│   ├── onboarding.tsx               ← First-run wizard
│   └── settings.tsx                 ← Supabase config + project slug
├── lib/
│   ├── tauri-commands.ts            ← Typed invoke() wrappers
│   ├── env-parser.ts                ← Parse .env content → KeyValue[]
│   └── diff-engine.ts              ← Compute Added/Changed/Deleted between two KV sets
├── hooks/
│   └── use-project-state.ts         ← Active project, sync status, manifest
├── App.tsx
└── main.tsx
```

## Related Code Files

**Create:**
- All files listed in Architecture above
- `src/lib/tauri-commands.ts` — must match Tauri command signatures exactly

## Implementation Steps

### Step 1: Typed Tauri command wrappers (`tauri-commands.ts`)
```ts
import { invoke } from '@tauri-apps/api/core'

export interface FileManifestEntry {
  filename: string
  size_bytes: number
  var_count: number
  has_sensitive_keys: boolean
  warnings: string[]
}

export const scanProject = (path: string) =>
  invoke<FileManifestEntry[]>('cmd_scan_project', { path })

export const encryptAndPrepare = (path: string, password: string) =>
  invoke<EncryptedPayload>('cmd_encrypt_and_prepare', { path, password })

export const decryptVault = (blobHex: string, password: string) =>
  invoke<DecryptedManifest>('cmd_decrypt_vault', { blobHex, password })

export const generateRecoveryKit = () =>
  invoke<string>('cmd_generate_recovery_kit')

export const loadProjects = () =>
  invoke<ProjectsConfig>('cmd_load_projects')

export const saveProjectSlug = (path: string, slug: string) =>
  invoke<void>('cmd_save_project_slug', { path, slug })
```

### Step 2: Env parser + diff engine

`env-parser.ts`:
```ts
// parseEnvContent(content: string): Record<string, string>
// → split lines, skip comments (#) and empty lines
// → split on first '=' → { KEY: value }

// maskValue(value: string): string
// → if value.length <= 8: return '••••••••'
// → else: return `${value.slice(0,4)}...${value.slice(-4)}`
```

`diff-engine.ts`:
```ts
// computeDiff(local: KVMap, remote: KVMap): DiffResult[]
// DiffResult: { key, status: 'added'|'changed'|'deleted'|'unchanged', localMasked, remoteMasked }
// → only return changed/added/deleted entries (skip unchanged)
```

### Step 3: `master-key-input.tsx`
- `<input type="password">` using `useRef`, NOT `useState`
- On submit: read `ref.current.value`, invoke Tauri command, immediately clear ref value
- Never pass password to any React context or state manager

### Step 4: `push-preview-modal.tsx` (Layer 3 — non-skippable)
```tsx
// Props: manifest: FileManifestEntry[], onConfirm, onCancel
// State: hasScrolled (confirm button disabled until user scrolls full list)
// Layout:
//   Title: "About to encrypt and push"
//   Scrollable manifest list: filename + var count + size + sensitive badge
//   Warning banner if any has_sensitive_keys = true
//   [Cancel] [Push Securely →] (disabled until scrolled)
```

### Step 5: `diff-view.tsx` (variable-level masked)
```tsx
// Props: diffEntries: DiffResult[]
// Renders table: KEY | LOCAL VALUE | REMOTE VALUE | STATUS
// Status badges: green "ADDED", yellow "CHANGED", red "DELETED"
// Values: always masked via maskValue()
// No raw file content shown
```

### Step 6: `recovery-kit-display.tsx`
```tsx
// Props: mnemonic: string (24 words)
// Layout: 4-column grid of numbered words (1-24)
// "Bitcoin wallet standard" subtitle
// [Print / Save as PDF] button → window.print() with print stylesheet
// Checkbox: "I have saved my Recovery Kit" → enables Continue button
```

### Step 7: `dashboard.tsx`
```tsx
// On mount: detect window.__TAURI_INTERNALS__ → get current dir via shell or env
// Show: ProjectStatusCard (project name, slug, last sync, files)
// Sync status badge: "In Sync" (green) | "Out of Sync" (yellow) | "Conflict" (red) | "Not configured" (gray)
// Actions: [Push] [Pull] [Settings]
```

### Step 8: `onboarding.tsx` (first-run wizard)
```
Step 1: Welcome + enter project slug
Step 2: Set Master Key (MasterKeyInput × 2 for confirmation)
Step 3: Recovery Kit — generateRecoveryKit() → RecoveryKitDisplay
Step 4: Configure Supabase URL + anon key
Step 5: Done → redirect to dashboard
```

## Todo

- [ ] Create `tauri-commands.ts` with all typed invoke wrappers
- [ ] Implement `env-parser.ts` (parse + mask)
- [ ] Implement `diff-engine.ts` (Added/Changed/Deleted)
- [ ] Build `master-key-input.tsx` (useRef, no state leak)
- [ ] Build `push-preview-modal.tsx` (non-skippable, scroll-gated confirm)
- [ ] Build `diff-view.tsx` (masked variable table)
- [ ] Build `recovery-kit-display.tsx` (24-word grid + print)
- [ ] Build `project-status-card.tsx` (status badge, file list)
- [ ] Build `dashboard.tsx` (main view with Push/Pull actions)
- [ ] Build `onboarding.tsx` (5-step wizard)
- [ ] Build `settings.tsx` (Supabase config)

## Success Criteria

- Push preview modal cannot be confirmed without scrolling the full manifest
- Master Key value never appears in React DevTools state
- Diff view shows `sk_li...abcd` never raw secret values
- Recovery Kit displays 24 words in a printable 4-column grid
- Dashboard correctly shows "Not configured" for a fresh project
- All Tauri command calls are typed — no raw `invoke<any>()`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Master Key leaks into React state | Use `useRef`, test with DevTools inspection |
| Push confirm button bypassable | Disable via CSS `pointer-events:none` + state guard, test keyboard nav |
| Diff view shows raw secrets | Unit test `maskValue()` with short/long values |
| Window current-dir detection unreliable | Use Tauri `path` plugin or pass via app launch args |

## Security Considerations

- Master Key: `useRef` only, clear immediately after invoke, never in state/context/localStorage
- No `console.log` of any env values or passwords in production build
- Tauri CSP: restrict to `default-src 'self'` in `tauri.conf.json`

## Next Steps

→ Phase 04: Supabase push/pull integration + conflict detection
