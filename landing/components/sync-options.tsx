import { Cloud, FolderSync, FileDown } from "lucide-react";

const options = [
  {
    icon: Cloud,
    title: "Cloud Database",
    desc: "Push encrypted blobs to your own Supabase instance. Full control, real-time sync across devices.",
    badge: "Supabase",
  },
  {
    icon: FolderSync,
    title: "Folder-Based Sync",
    desc: "Point to any cloud-synced folder. Push writes encrypted files there — Google Drive, iCloud, or Dropbox handles the rest.",
    badge: "Zero Config",
  },
  {
    icon: FileDown,
    title: "Portable File",
    desc: "Export a .envbutler file and move it however you want — USB, AirDrop, email. Import on any machine with one click.",
    badge: "Offline",
  },
];

export default function SyncOptions() {
  return (
    <section className="py-20 px-6 border-t border-zinc-800">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">
          Sync Your Way
        </h2>
        <p className="text-center text-zinc-400 mb-12">
          No vendor lock-in. Pick the sync method that fits your workflow.
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <div
                key={opt.title}
                className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-7 h-7 text-emerald-400" />
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-zinc-700 text-zinc-400">
                    {opt.badge}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">{opt.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {opt.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
