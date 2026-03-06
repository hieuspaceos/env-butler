import { Lock, Eye, Zap, Users, Terminal } from "lucide-react";

const values = [
  {
    icon: Lock,
    title: "We can't see your keys. Period.",
    body: "Encryption happens on your machine with your Master Key. We store an encrypted blob we cannot read. AES-256-GCM + Argon2id.",
  },
  {
    icon: Users,
    title: "Team sharing. No auth server.",
    body: "Invite tokens let team members access shared vaults. Encrypted with a passphrase — share via Slack, AirDrop, or in person.",
  },
  {
    icon: Terminal,
    title: "CLI + GUI. CI/CD ready.",
    body: "Desktop app and terminal CLI share the same Rust core. Service tokens enable non-interactive pulls in GitHub Actions.",
  },
  {
    icon: Eye,
    title: "100% Open Source. Every binary is public.",
    body: "Every release is built on GitHub Actions — publicly. SHA-256 checksums let you verify your download matches the build log.",
  },
  {
    icon: Zap,
    title: "Built with Rust. Not Electron.",
    body: "Tauri + Rust backend. Native macOS/Windows performance. No 150MB runtime. No Chromium process eating your RAM.",
  },
];

export default function CoreValues() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 lg:grid-cols-5 gap-6">
        {values.map((v) => {
          const Icon = v.icon;
          return (
            <div
              key={v.title}
              className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4"
            >
              <Icon className="w-8 h-8 text-emerald-400" />
              <h3 className="text-lg font-semibold">{v.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{v.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
