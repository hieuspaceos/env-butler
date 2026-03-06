import type { Metadata } from "next";
import Link from "next/link";
import { Rocket, Layers, Shield, HelpCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Docs — Env Butler",
  description:
    "Documentation for Env Butler — setup, architecture, security model, and FAQ.",
};

const sections = [
  {
    href: "/docs/getting-started/",
    icon: Rocket,
    title: "Getting Started",
    desc: "Download, set up Supabase, configure your first project, and push your first sync.",
  },
  {
    href: "/docs/architecture/",
    icon: Layers,
    title: "Architecture",
    desc: "How Env Butler works under the hood — Tauri + Rust backend, encryption pipeline, data flow.",
  },
  {
    href: "/docs/security/",
    icon: Shield,
    title: "Security",
    desc: "Zero-knowledge model, encryption format, Surgical Butler safety layers, and threat model.",
  },
  {
    href: "/docs/faq/",
    icon: HelpCircle,
    title: "FAQ",
    desc: "Common questions about Master Keys, recovery, Supabase, team usage, and more.",
  },
];

export default function DocsOverview() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-3">Documentation</h1>
        <p className="text-zinc-400">
          Everything you need to set up, understand, and trust Env Butler.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-emerald-500/30 transition space-y-3 no-underline"
            >
              <Icon className="w-6 h-6 text-emerald-400" />
              <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-emerald-400 transition">
                {s.title}
              </h2>
              <p className="text-sm text-zinc-400">{s.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
