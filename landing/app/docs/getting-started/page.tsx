import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Getting Started — Env Butler Docs",
  description:
    "Install Env Butler, set up Supabase, and sync your first .env files.",
};

export default function GettingStarted() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-3">Getting Started</h1>
        <p className="text-zinc-400">
          From download to first sync in under 5 minutes.
        </p>
      </div>

      {/* Step 1 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-mono flex items-center justify-center">
            1
          </span>
          Download &amp; Install
        </h2>
        <p className="text-zinc-400">
          Grab the latest release from{" "}
          <a
            href="https://github.com/hieuphan94/env-butler/releases/latest"
            className="text-emerald-400 hover:underline"
          >
            GitHub Releases
          </a>
          :
        </p>
        <ul className="list-disc pl-6 text-zinc-400 space-y-1">
          <li>
            <strong className="text-zinc-200">macOS</strong> — Universal{" "}
            <code>.dmg</code> (Apple Silicon + Intel)
          </li>
          <li>
            <strong className="text-zinc-200">Windows</strong> — x64{" "}
            <code>.exe</code> installer
          </li>
        </ul>
        <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-400 space-y-2">
          <p className="font-semibold text-zinc-300">
            First launch on macOS?
          </p>
          <p>
            Env Butler is unsigned (we keep it free instead of paying $99/yr for
            a certificate). Bypass Gatekeeper:
          </p>
          <code className="block p-2 rounded bg-zinc-950 font-mono text-xs">
            xattr -d com.apple.quarantine /Applications/Env\ Butler.app
          </code>
          <p>Or right-click the app &rarr; Open &rarr; Open.</p>
        </div>
      </section>

      {/* Step 2 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-mono flex items-center justify-center">
            2
          </span>
          Set Up Supabase
        </h2>
        <p className="text-zinc-400">
          Env Butler stores encrypted blobs in your own Supabase instance. You
          own the data — we never see it.
        </p>
        <ol className="list-decimal pl-6 text-zinc-400 space-y-2">
          <li>
            Create a free project at{" "}
            <a
              href="https://supabase.com"
              className="text-emerald-400 hover:underline"
            >
              supabase.com
            </a>
          </li>
          <li>Open the SQL Editor in your Supabase dashboard</li>
          <li>Run the migration below:</li>
        </ol>
        <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto">
{`CREATE TABLE IF NOT EXISTS vault (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_slug   TEXT NOT NULL UNIQUE,
  encrypted_blob TEXT NOT NULL,
  plaintext_hash TEXT NOT NULL,
  metadata       JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_for_anon" ON vault
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vault_updated_at
  BEFORE UPDATE ON vault
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();`}
        </pre>
        <ol start={4} className="list-decimal pl-6 text-zinc-400 space-y-2">
          <li>
            Copy your <strong className="text-zinc-200">Project URL</strong> and{" "}
            <strong className="text-zinc-200">anon key</strong> from Settings
            &rarr; API
          </li>
        </ol>
      </section>

      {/* Step 3 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-mono flex items-center justify-center">
            3
          </span>
          Configure Env Butler
        </h2>
        <ol className="list-decimal pl-6 text-zinc-400 space-y-2">
          <li>Open Env Butler and go to Settings</li>
          <li>Paste your Supabase URL and anon key</li>
          <li>
            Add a project — pick a folder and give it a slug (e.g.,{" "}
            <code>my-api</code>)
          </li>
          <li>
            Set your <strong className="text-zinc-200">Master Key</strong> — a
            strong passphrase you&apos;ll remember. This key never leaves your
            machine.
          </li>
          <li>
            Save your <strong className="text-zinc-200">Recovery Kit</strong>{" "}
            — a 24-word mnemonic that can regenerate your Master Key. Store it
            offline.
          </li>
        </ol>
      </section>

      {/* Step 4 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-mono flex items-center justify-center">
            4
          </span>
          Push &amp; Pull
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 space-y-2">
            <h3 className="font-semibold text-zinc-200">Push</h3>
            <p className="text-sm text-zinc-400">
              Scans your project for <code>.env*</code> files, shows a preview
              of what will be synced (file names, variable counts, sensitive key
              warnings), encrypts everything, and uploads to Supabase.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 space-y-2">
            <h3 className="font-semibold text-zinc-200">Pull</h3>
            <p className="text-sm text-zinc-400">
              Downloads encrypted data, checks for conflicts (hash comparison),
              decrypts, and writes files to your project — only after you
              approve.
            </p>
          </div>
        </div>
      </section>

      {/* Config files */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Where config lives</h2>
        <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300">
{`~/.env-butler/
  projects.json    # Your projects (slugs, paths, sync hashes)
  config.json      # Supabase URL + anon key`}
        </pre>
      </section>
    </div>
  );
}
