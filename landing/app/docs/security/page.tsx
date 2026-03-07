import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security — Env Butler Docs",
  description:
    "Env Butler's zero-knowledge encryption, Surgical Butler safety, and threat model.",
};

export default function Security() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-3">Security</h1>
        <p className="text-zinc-400">
          How Env Butler protects your secrets — and what it explicitly does not
          do.
        </p>
      </div>

      {/* Zero-knowledge */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Zero-Knowledge Model</h2>
        <p className="text-zinc-400">
          Your Master Key never leaves your machine. It is never stored on disk,
          never transmitted over the network, and only held in memory during
          encryption/decryption. Supabase stores only encrypted blobs it cannot
          read.
        </p>
        <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2 text-sm text-zinc-400">
          <p className="font-semibold text-zinc-300">What this means:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              If someone accesses your Supabase database, they get encrypted
              blobs — useless without your Master Key
            </li>
            <li>
              If you lose your Master Key, nobody can recover your data — not
              even us (use your Recovery Kit)
            </li>
            <li>
              There is no &quot;forgot password&quot; flow. Your 24-word
              Recovery Kit is your only backup.
            </li>
          </ul>
        </div>
      </section>

      {/* Encryption format */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Encryption</h2>
        <p className="text-zinc-400">
          Every push produces a fresh encrypted blob with unique salt and nonce:
        </p>
        <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300">
{`[salt: 16 bytes] [nonce: 12 bytes] [ciphertext: variable]

Salt    → random per encryption, fed to Argon2id for key derivation
Nonce   → random per encryption, used by AES-256-GCM
Cipher  → AES-256-GCM encrypted zip archive`}
        </pre>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <h3 className="font-semibold text-zinc-200 mb-1">AES-256-GCM</h3>
            <p className="text-sm text-zinc-400">
              Authenticated encryption — any tampering with the ciphertext is
              detected on decryption. 256-bit key, widely trusted by
              governments and security standards.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <h3 className="font-semibold text-zinc-200 mb-1">Argon2id</h3>
            <p className="text-sm text-zinc-400">
              Memory-hard key derivation function. Resistant to GPU and ASIC
              brute-force attacks. Winner of the Password Hashing Competition.
            </p>
          </div>
        </div>
      </section>

      {/* Surgical Butler */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Surgical Butler: 3-Layer Safety</h2>
        <p className="text-zinc-400">
          Prevents you from accidentally syncing files that should never be in a
          vault.
        </p>
        <div className="space-y-3">
          {[
            {
              layer: "Layer 1 — Allowlist",
              desc: "Only scans files matching .env, .env.local, .env.development, .env.production, .env.staging, and similar patterns. Everything else is ignored.",
            },
            {
              layer: "Layer 2 — Content Fingerprint",
              desc: "Inspects file contents. Blocks SSH private keys, certificates, binary files, and any file larger than 50KB. Files with embedded private keys in values (e.g., PRIVATE_KEY=\"...\") are allowed with a warning.",
            },
            {
              layer: "Layer 3 — Push Preview",
              desc: "Non-skippable modal before every push. Shows every file that will be synced, variable counts, and highlights potentially sensitive keys. You must explicitly confirm.",
            },
          ].map((l) => (
            <div
              key={l.layer}
              className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50"
            >
              <h3 className="font-semibold text-emerald-400 text-sm mb-1">
                {l.layer}
              </h3>
              <p className="text-sm text-zinc-400">{l.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BIP39 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">BIP39 Mnemonic as Master Key</h2>
        <p className="text-zinc-400">
          Your Master Key is a 24-word mnemonic generated using the{" "}
          <a
            href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki"
            className="text-emerald-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            BIP39 standard
          </a>{" "}
          — the same standard used by Bitcoin and Ethereum wallets. The mnemonic
          IS the key — there is no separate password.
        </p>
        <ul className="list-disc pl-6 text-zinc-400 space-y-1 text-sm">
          <li>
            Deterministic — the same 24 words always produce the same encryption key
          </li>
          <li>
            Save it offline (printed paper, password manager, safe deposit box)
          </li>
          <li>
            Never share it — anyone with your 24 words has full access to your vault
          </li>
          <li>
            Enter your mnemonic when pushing or pulling — it is never stored on disk
          </li>
        </ul>
      </section>

      {/* Build verification */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Build Verification</h2>
        <p className="text-zinc-400">
          Every release is built on GitHub Actions — publicly. No local builds,
          no mystery binaries.
        </p>
        <ol className="list-decimal pl-6 text-zinc-400 space-y-2 text-sm">
          <li>
            Go to{" "}
            <a
              href="https://github.com/hieuspaceos/env-butler/actions"
              className="text-emerald-400 hover:underline"
            >
              Actions
            </a>{" "}
            and find the release build for your version
          </li>
          <li>Open the build log and find the SHA-256 hash for your file</li>
          <li>
            Compare with <code>checksums.txt</code> on the{" "}
            <a
              href="https://github.com/hieuspaceos/env-butler/releases"
              className="text-emerald-400 hover:underline"
            >
              Release page
            </a>
          </li>
        </ol>
        <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300">
{`# macOS
shasum -a 256 Env-Butler_*.dmg

# Windows (PowerShell)
Get-FileHash Env-Butler_*.exe -Algorithm SHA256`}
        </pre>
      </section>

      {/* Team v2 envelope encryption */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Team v2: Envelope Encryption</h2>
        <p className="text-zinc-400">
          Team sharing uses per-user envelope encryption — each member has their
          own passphrase and the Vault Key is wrapped individually per member.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <h3 className="font-semibold text-zinc-200 mb-1">Envelope Keys</h3>
            <p className="text-sm text-zinc-400">
              A random 256-bit Vault Key encrypts your .env data. That key is
              then wrapped (encrypted) separately with each member&apos;s own
              passphrase — no shared secret exists across the team.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <h3 className="font-semibold text-zinc-200 mb-1">Member-Scoped RLS</h3>
            <p className="text-sm text-zinc-400">
              Members authenticate with Supabase anon key + Row Level Security
              policies scoped to their member ID. No service_role key is shared
              with team members.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <h3 className="font-semibold text-zinc-200 mb-1">Secure Invite Flow</h3>
            <p className="text-sm text-zinc-400">
              v2 invite tokens contain no secrets — only a URL and one-time
              code. Members register their own key during join. Owner approves
              before access is granted.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <h3 className="font-semibold text-zinc-200 mb-1">Individual Revocation</h3>
            <p className="text-sm text-zinc-400">
              Removing a member invalidates only their wrapped key copy. The
              Vault Key itself does not change — other members are unaffected.
            </p>
          </div>
        </div>
      </section>

      {/* Threat model */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Threat Model</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="py-2 pr-4 text-zinc-300">Threat</th>
                <th className="py-2 text-zinc-300">Mitigation</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                [
                  "Supabase breach",
                  "Attacker gets encrypted blobs — unusable without Master Key",
                ],
                [
                  "Master Key theft",
                  "Key is never stored on disk. 24-word mnemonic entered only when needed.",
                ],
                [
                  "Brute-force",
                  "Argon2id makes each guess expensive (memory + CPU bound)",
                ],
                [
                  "Ciphertext tampering",
                  "AES-256-GCM detects any modification on decryption",
                ],
                [
                  "Accidental secret sync",
                  "Surgical Butler blocks SSH keys, certs, binaries before upload",
                ],
                [
                  "Malicious binary",
                  "All builds are public on GitHub Actions with SHA-256 checksums",
                ],
                [
                  "Shared team secret leaks",
                  "Envelope encryption — no single secret shared across team members",
                ],
                [
                  "Member compromise",
                  "Revoke individual member without rotating keys for the whole team",
                ],
              ].map(([threat, mitigation]) => (
                <tr key={threat} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-medium text-zinc-200">
                    {threat}
                  </td>
                  <td className="py-2">{mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
