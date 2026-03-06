import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Architecture — Env Butler Docs",
  description:
    "How Env Butler works — Tauri + Rust backend, encryption pipeline, and data flow.",
};

export default function Architecture() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-3">Architecture</h1>
        <p className="text-zinc-400">
          Tauri v2 desktop app. All crypto runs in Rust — no secrets touch
          JavaScript.
        </p>
      </div>

      {/* Component overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">System Overview</h2>
        <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto">
{`┌──────────────────────────────────────────────┐
│                 React Frontend               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │Dashboard │ │Onboarding│ │   Settings   │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       └─────────────┼──────────────┘         │
│              invoke() IPC                    │
├──────────────────────────────────────────────┤
│                 Rust Backend                 │
│  ┌────────┐ ┌────────┐ ┌─────────────────┐  │
│  │ crypto │ │scanner │ │    recovery     │  │
│  │AES-256 │ │Surgical│ │   BIP39 24w     │  │
│  │Argon2id│ │Butler  │ │   mnemonic      │  │
│  └────────┘ └────────┘ └─────────────────┘  │
│  ┌────────┐ ┌────────┐ ┌─────────────────┐  │
│  │ vault  │ │  meta  │ │    supabase     │  │
│  │zip+hash│ │projects│ │   HTTP sync     │  │
│  └────────┘ └────────┘ └─────────────────┘  │
└──────────────────────────┬───────────────────┘
                           │ HTTPS
                  ┌────────▼────────┐
                  │    Supabase     │
                  │  (self-hosted)  │
                  │   vault table   │
                  └─────────────────┘`}
        </pre>
      </section>

      {/* Rust modules */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Rust Modules</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              name: "crypto",
              desc: "AES-256-GCM encryption + Argon2id key derivation. All encryption/decryption happens here.",
            },
            {
              name: "scanner",
              desc: "3-layer Surgical Butler — allowlist, content fingerprint, and push preview.",
            },
            {
              name: "vault",
              desc: "Zips .env files into an archive, computes SHA-256 hash for conflict detection.",
            },
            {
              name: "recovery",
              desc: "BIP39 mnemonic generation and Master Key derivation from 24-word phrase.",
            },
            {
              name: "meta",
              desc: "Project and config management — projects.json and config.json in ~/.env-butler/.",
            },
            {
              name: "supabase",
              desc: "HTTP client (reqwest + TLS) for uploading/downloading encrypted blobs.",
            },
          ].map((m) => (
            <div
              key={m.name}
              className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50"
            >
              <h3 className="font-mono text-emerald-400 text-sm mb-1">
                {m.name}
              </h3>
              <p className="text-sm text-zinc-400">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Push flow */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Push Flow</h2>
        <ol className="list-decimal pl-6 text-zinc-400 space-y-2">
          <li>
            <strong className="text-zinc-200">Scan</strong> — Scanner finds{" "}
            <code>.env*</code> files using allowlist, blocks SSH keys /
            certificates / binaries / files &gt; 50KB
          </li>
          <li>
            <strong className="text-zinc-200">Preview</strong> — Non-skippable
            modal shows every file, variable count, and sensitive key warnings
          </li>
          <li>
            <strong className="text-zinc-200">Package</strong> — Vault zips all
            allowed files and computes SHA-256 hash
          </li>
          <li>
            <strong className="text-zinc-200">Encrypt</strong> — Crypto module
            derives a key from your Master Key via Argon2id, encrypts the zip
            with AES-256-GCM
          </li>
          <li>
            <strong className="text-zinc-200">Upload</strong> — Supabase module
            upserts the encrypted blob + hash to your vault table
          </li>
        </ol>
      </section>

      {/* Pull flow */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Pull Flow</h2>
        <ol className="list-decimal pl-6 text-zinc-400 space-y-2">
          <li>
            <strong className="text-zinc-200">Fetch</strong> — Downloads
            encrypted blob + remote hash from Supabase
          </li>
          <li>
            <strong className="text-zinc-200">Compare</strong> — Computes local
            hash and compares with remote to detect conflicts
          </li>
          <li>
            <strong className="text-zinc-200">Resolve</strong> — Four states:{" "}
            <code>InSync</code>, <code>SafePull</code>,{" "}
            <code>PushReminder</code>, <code>Conflict</code>
          </li>
          <li>
            <strong className="text-zinc-200">Diff</strong> — On conflict:
            decrypts remote, parses both sides, shows variable-level masked diff
          </li>
          <li>
            <strong className="text-zinc-200">Write</strong> — User approves
            &rarr; files written to project directory
          </li>
        </ol>
      </section>

      {/* Tech stack */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Tech Stack</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="py-2 pr-4 text-zinc-300">Layer</th>
                <th className="py-2 text-zinc-300">Technology</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ["Desktop app", "Tauri v2 + Rust"],
                ["Frontend", "React + TypeScript + Tailwind CSS"],
                ["Encryption", "AES-256-GCM + Argon2id"],
                ["Recovery", "BIP39 (tiny-bip39)"],
                ["Storage", "Self-hosted Supabase (PostgreSQL)"],
                ["CI/CD", "GitHub Actions (public builds)"],
              ].map(([layer, tech]) => (
                <tr key={layer} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-medium text-zinc-200">
                    {layer}
                  </td>
                  <td className="py-2">{tech}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Supabase schema */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Supabase Schema</h2>
        <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto">
{`vault (
  id             UUID PRIMARY KEY
  project_slug   TEXT UNIQUE NOT NULL
  encrypted_blob TEXT NOT NULL       -- base64-encoded encrypted zip
  plaintext_hash TEXT NOT NULL       -- SHA-256 of unencrypted zip
  metadata       JSONB               -- reserved for future use
  created_at     TIMESTAMPTZ
  updated_at     TIMESTAMPTZ         -- auto-updated via trigger
)`}
        </pre>
        <p className="text-sm text-zinc-400">
          Row Level Security is enabled. The default policy allows all
          operations for the anon key — suitable for single-user or team with a
          shared key.
        </p>
      </section>
    </div>
  );
}
