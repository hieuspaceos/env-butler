"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionProps {
  title: string;
  children: React.ReactNode;
}

function Accordion({ title, children }: AccordionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left font-medium hover:bg-zinc-900/50 transition"
      >
        {title}
        <ChevronDown
          className={`w-5 h-5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-zinc-400 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function BypassGuide() {
  return (
    <section className="py-20 px-6 border-t border-zinc-800">
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold text-center">
          First Launch: Platform Guides
        </h2>
        <p className="text-center text-zinc-400 text-sm">
          No paid certificate — we keep Env Butler free and open-source instead.
        </p>

        <div className="space-y-3">
          <Accordion title="macOS: Bypass Gatekeeper">
            <p>Option A (Terminal):</p>
            <code className="block p-2 rounded bg-zinc-900 font-mono text-xs">
              xattr -d com.apple.quarantine /Applications/Env\ Butler.app
            </code>
            <p>Option B: Right-click the app → Open → Open.</p>
            <p className="text-zinc-500">
              Gatekeeper requires a $99/yr Apple certificate. We keep Env Butler
              free and open-source instead. Verify our build on GitHub Actions
              before bypassing.
            </p>
          </Accordion>

          <Accordion title="Windows: Bypass SmartScreen">
            <p>
              Click &quot;More info&quot; → &quot;Run anyway&quot;.
            </p>
            <p className="text-zinc-500">
              SmartScreen warns on ALL unsigned apps — it does not indicate
              malware. Verify our SHA-256 hash before running.
            </p>
          </Accordion>
        </div>
      </div>
    </section>
  );
}
