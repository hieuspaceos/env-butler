import { Shield, Download, BookOpen } from "lucide-react";

const trustBadges = ["AES-256-GCM", "Argon2id", "BIP39 Recovery", "Open Source"];

export default function Hero() {
  return (
    <section className="py-24 px-6 text-center">
      <div className="max-w-3xl mx-auto space-y-8">
        <Shield className="w-16 h-16 mx-auto text-emerald-400" />
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
          Your .env files.
          <br />
          <span className="text-emerald-400">Synced. Encrypted. Yours.</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          Zero-knowledge encryption powered by Rust. Recovery backed by the
          Bitcoin wallet standard. Built for developers managing dozens of API
          keys.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="https://github.com/hieuphan94/env-butler/releases/latest"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400 transition"
          >
            <Download className="w-5 h-5" />
            Download for macOS
          </a>
          <a
            href="https://github.com/hieuphan94/env-butler/releases/latest"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-zinc-700 text-zinc-100 font-semibold hover:bg-zinc-800 transition"
          >
            <Download className="w-5 h-5" />
            Download for Windows
          </a>
          <a
            href="/docs/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-zinc-700 text-zinc-100 font-semibold hover:bg-zinc-800 transition"
          >
            <BookOpen className="w-5 h-5" />
            Read the Docs
          </a>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-4">
          {trustBadges.map((badge) => (
            <span
              key={badge}
              className="px-3 py-1 rounded-full text-xs font-mono border border-zinc-700 text-zinc-400"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
