"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItemProps {
  question: string;
  children: React.ReactNode;
}

function FaqItem({ question, children }: FaqItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left font-medium hover:bg-zinc-900/50 transition"
      >
        {question}
        <ChevronDown
          className={`w-5 h-5 text-zinc-500 shrink-0 ml-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-zinc-400 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-3">FAQ</h1>
        <p className="text-zinc-400">Common questions about Env Butler.</p>
      </div>

      <div className="space-y-3">
        <FaqItem question="What happens if I forget my Master Key?">
          <p>
            Use your 24-word Recovery Kit to regenerate it. If you&apos;ve lost
            both your Master Key and Recovery Kit, your encrypted data is
            permanently unrecoverable. There is no &quot;forgot password&quot;
            flow — that&apos;s the trade-off of zero-knowledge encryption.
          </p>
        </FaqItem>

        <FaqItem question="Is my Master Key stored anywhere?">
          <p>
            No. Your Master Key is only held in memory while Env Butler is
            running. It is never written to disk and never sent over the
            network.
          </p>
        </FaqItem>

        <FaqItem question="Can I use Env Butler with a team?">
          <p>
            Yes. Share the same Supabase credentials and Master Key with your
            team. Everyone with the key can push and pull. The current version
            uses a shared-key model — multi-user access control is planned for a
            future release.
          </p>
        </FaqItem>

        <FaqItem question="What files does Env Butler sync?">
          <p>
            Only files matching the allowlist:{" "}
            <code>.env</code>, <code>.env.local</code>,{" "}
            <code>.env.development</code>, <code>.env.production</code>,{" "}
            <code>.env.staging</code>, and similar <code>.env.*</code> patterns.
            Everything else is ignored. SSH keys, certificates, binary files,
            and files over 50KB are blocked even if they match.
          </p>
        </FaqItem>

        <FaqItem question="Do I need to self-host Supabase?">
          <p>
            No — you can use the free tier at{" "}
            <a
              href="https://supabase.com"
              className="text-emerald-400 hover:underline"
            >
              supabase.com
            </a>
            . &quot;Self-hosted&quot; means you own the Supabase project — Env
            Butler never runs its own backend. You can also self-host Supabase
            on your own infrastructure if you prefer.
          </p>
        </FaqItem>

        <FaqItem question="What happens during a conflict?">
          <p>
            Env Butler compares SHA-256 hashes of your local and remote data.
            When they diverge, it decrypts both sides and shows a
            variable-level diff with values masked. You choose whether to accept
            the remote version or keep your local files.
          </p>
        </FaqItem>

        <FaqItem question="Why is the app unsigned?">
          <p>
            Apple and Microsoft code-signing certificates cost $99–$299/year and
            require a legal entity. To keep Env Butler 100% free and
            open-source, we skip the certificate and instead provide full build
            transparency — every binary is built publicly on GitHub Actions with
            SHA-256 checksums you can verify.
          </p>
        </FaqItem>

        <FaqItem question="How do I verify my download?">
          <p>
            Check the SHA-256 hash of your downloaded file against the{" "}
            <code>checksums.txt</code> attached to the release:
          </p>
          <pre className="p-3 rounded bg-zinc-900 font-mono text-xs overflow-x-auto">
{`# macOS
shasum -a 256 Env-Butler_*.dmg

# Windows (PowerShell)
Get-FileHash Env-Butler_*.exe -Algorithm SHA256`}
          </pre>
        </FaqItem>

        <FaqItem question="Can I manage multiple projects?">
          <p>
            Yes. Add multiple projects in Settings, each with its own slug and
            folder path. Switch between them on the dashboard. Each project
            syncs independently to the vault table keyed by its slug.
          </p>
        </FaqItem>

        <FaqItem question="Is Env Butler open source?">
          <p>
            Yes — MIT licensed. Source code, build pipeline, and release
            artifacts are all on{" "}
            <a
              href="https://github.com/hieuphan94/env-butler"
              className="text-emerald-400 hover:underline"
            >
              GitHub
            </a>
            .
          </p>
        </FaqItem>
      </div>
    </div>
  );
}
