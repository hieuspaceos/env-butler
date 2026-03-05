# Phase 06: Landing Page

**Context:** [Plan](./plan.md) | [Brainstorm](../reports/brainstorm-260305-1344-env-butler-architecture.md)
**Independent of all other phases** — can build in parallel with Phases 2–5

## Overview
- **Priority:** P2
- **Status:** Pending
- **Effort:** 7h

Build a dark-mode marketing landing page (Next.js static export) communicating Env-Butler's three core values: Zero-Knowledge, Radical Transparency, Lean Performance. Includes Gatekeeper/SmartScreen bypass guide, download section, and "AI-Developer First" positioning.

## Key Insights

- This is a **static site** — use `next export` or `output: 'export'` in `next.config.ts`. No SSR needed.
- Deploy target: **Cloudflare Pages** (free, global CDN, zero config)
- All copy must earn trust with technical specifics — no vague "enterprise-grade security" claims
- "AI-Developer First" angle: managing 30+ API keys across Claude, OpenAI, Supabase, Stripe etc. in one click
- BIP39 / Bitcoin wallet recovery standard is a strong trust hook on the landing page

## Requirements

**Functional**
- Hero section with tagline + download CTA
- 3 core value sections (Zero-Knowledge, Radical Transparency, Lean Performance)
- "How it works" — 3-step visual (Scan → Encrypt → Sync)
- Download section with platform badges (macOS / Windows) + checksum verification guide
- Gatekeeper/SmartScreen bypass guide (expandable/accordion)
- Footer: GitHub link, open-source badge

**Non-Functional**
- Dark mode only (no light mode toggle needed for v1)
- Next.js `output: 'export'` — pure static HTML/CSS/JS
- Tailwind CSS — no custom CSS
- Mobile responsive
- Page load < 2s (no large images, use SVG/CSS art)

## Architecture

```
landing/                          ← separate Next.js project in repo root
├── app/
│   ├── layout.tsx                ← dark html root, metadata
│   ├── page.tsx                  ← main landing page (single page)
│   └── globals.css               ← Tailwind base
├── components/
│   ├── hero.tsx
│   ├── core-values.tsx
│   ├── how-it-works.tsx
│   ├── download-section.tsx
│   ├── bypass-guide.tsx          ← accordion: macOS + Windows bypass
│   └── footer.tsx
├── public/
│   └── icon.svg                  ← Butler icon (minimal, SVG)
├── next.config.ts                ← output: 'export', basePath if needed
├── package.json
└── tailwind.config.ts
```

## Related Code Files

**Create:**
- All files listed in Architecture above

## Implementation Steps

### Step 1: Bootstrap Next.js project
```bash
cd landing
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias '@/*'
```

### Step 2: Configure static export in `next.config.ts`
```ts
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },  // required for static export
}
export default config
```

### Step 3: `app/layout.tsx` — dark root
```tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  )
}
// metadata: title="Env Butler — Zero-Knowledge .env Sync", description, OG tags
```

### Step 4: `hero.tsx`
```tsx
// Tagline: "Your .env files. Synced. Encrypted. Yours."
// Subheading: "Zero-knowledge encryption powered by Rust.
//              Recovery backed by the Bitcoin wallet standard.
//              Built for developers managing dozens of API keys."
// CTAs: [Download for macOS] [Download for Windows]
// Trust badge row: "AES-256-GCM" | "Argon2id" | "BIP39 Recovery" | "Open Source"
// Visual: terminal-style code block showing masked env vars
```

### Step 5: `core-values.tsx` — 3 cards
```tsx
// Card 1 — Zero-Knowledge
//   Icon: lock
//   Title: "We can't see your keys. Period."
//   Body: "Encryption happens on your machine with your Master Key.
//          We store an encrypted blob we cannot read. AES-256-GCM + Argon2id."

// Card 2 — Radical Transparency
//   Icon: github (or eye)
//   Title: "100% Open Source. Every binary is public."
//   Body: "Every release is built on GitHub Actions — publicly.
//          SHA-256 checksums let you verify your download matches the build log."

// Card 3 — Lean Performance
//   Icon: bolt/zap
//   Title: "Built with Rust. Not Electron."
//   Body: "Tauri + Rust backend. Native macOS/Windows performance.
//          No 150MB runtime. No Chromium process eating your RAM."
```

### Step 6: `how-it-works.tsx` — 3-step visual
```tsx
// Step 1: "Scan" — Butler detects .env.* files, blocks SSH keys automatically
// Step 2: "Encrypt" — AES-256-GCM on your machine, key never leaves
// Step 3: "Sync" — Encrypted blob goes to YOUR Supabase. We're just the tool.
// Visual: horizontal step connector on desktop, vertical on mobile
```

### Step 7: `download-section.tsx`
```tsx
// Platform badges: Apple + Windows SVG icons
// Links: GitHub Releases latest (hardcoded or fetched from GitHub API at build time)
// Verify section:
//   macOS: shasum -a 256 Env-Butler_*.dmg
//   Windows: Get-FileHash Env-Butler_*.exe -Algorithm SHA256
//   "Compare with checksums.txt on the release page"
```

### Step 8: `bypass-guide.tsx` — accordion
```tsx
// Two accordion items:
// "macOS: Bypass Gatekeeper" →
//   Option A: xattr -d com.apple.quarantine /Applications/Env\ Butler.app
//   Option B: Right-click → Open → Open
//   Explanation: "macOS Gatekeeper requires a $99/yr Apple certificate.
//                 We keep Env-Butler free and open-source instead.
//                 Verify our build on GitHub Actions before bypassing."

// "Windows: Bypass SmartScreen" →
//   "Click 'More info' → 'Run anyway'
//    SmartScreen warns on ALL unsigned apps — it doesn't indicate malware.
//    Verify our SHA-256 hash before running."
```

### Step 9: `footer.tsx`
```tsx
// GitHub link + star badge
// "Built with Tauri + Rust + React"
// "Zero-knowledge. Zero drama."
// MIT License badge
```

### Step 10: Deploy to Cloudflare Pages
```bash
# In Cloudflare Pages dashboard:
# Build command: cd landing && npm run build
# Output dir: landing/out
# Framework preset: Next.js (Static HTML Export)
```
Document deployment steps in `landing/README.md`.

## Todo

- [ ] Bootstrap Next.js project in `landing/`
- [ ] Configure `output: 'export'` in next.config.ts
- [ ] Build `hero.tsx` with trust badge row
- [ ] Build `core-values.tsx` (3-card layout)
- [ ] Build `how-it-works.tsx` (3-step visual)
- [ ] Build `download-section.tsx` with checksum guide
- [ ] Build `bypass-guide.tsx` (accordion, both platforms)
- [ ] Build `footer.tsx`
- [ ] Assemble `page.tsx`
- [ ] Mobile responsive check (375px, 768px, 1280px)
- [ ] Run `npm run build` — confirm static export succeeds with no errors
- [ ] Deploy to Cloudflare Pages

## Success Criteria

- `npm run build` produces `landing/out/` with no Next.js errors
- Page loads < 2s (Lighthouse check)
- Core values copy uses technical specifics — no vague marketing language
- Bypass guide is accurate and includes verification step before bypassing
- Mobile layout renders correctly at 375px

## Risk Assessment

| Risk | Mitigation |
|---|---|
| GitHub API rate limit at build time | Cache release URL or hardcode until CI fetches latest |
| Cloudflare Pages Next.js static export quirks | Test `output: 'export'` locally first with `npx serve out` |
| Copy too technical, alienates non-developers | Target IS developers — technical specifics ARE the trust signal |

## Security Considerations

- No analytics, no tracking scripts — privacy matches brand values
- No cookies, no localStorage — pure static HTML
- CSP header via `_headers` file in `public/`: `default-src 'self'`
- Download links point directly to GitHub Releases — no intermediary redirect

## Next Steps

→ All phases complete. Ship v0.1.0 alpha.
