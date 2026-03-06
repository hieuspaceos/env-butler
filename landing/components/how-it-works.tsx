import { Search, Lock, Cloud } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Scan",
    desc: "Butler detects .env.* files and blocks SSH keys, certificates, and binary files automatically.",
  },
  {
    icon: Lock,
    title: "Encrypt",
    desc: "AES-256-GCM encrypts everything on your machine. Your Master Key never leaves.",
  },
  {
    icon: Cloud,
    title: "Sync",
    desc: "Push to your Supabase, drop into Google Drive / iCloud / Dropbox, or export a portable .envbutler file. Your data, your choice.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 px-6 border-t border-zinc-800">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Icon className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="text-xs font-mono text-zinc-500">
                  Step {i + 1}
                </div>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-sm text-zinc-400">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
