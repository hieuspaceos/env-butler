// Variable-level masked diff view for pull conflicts.
// Shows KEY | LOCAL | REMOTE | STATUS with color-coded badges.
// Values are always masked — never shows raw secrets.

import type { DiffEntry } from "@/lib/diff-engine";

interface DiffViewProps {
  entries: DiffEntry[];
  onAcceptRemote: () => void;
  onKeepLocal: () => void;
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  added: { bg: "bg-green-500/20", text: "text-green-400", label: "ADDED" },
  changed: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "CHANGED" },
  deleted: { bg: "bg-red-500/20", text: "text-red-400", label: "DELETED" },
  unchanged: { bg: "bg-muted", text: "text-muted-foreground", label: "SAME" },
};

export default function DiffView({ entries, onAcceptRemote, onKeepLocal }: DiffViewProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">No differences found.</div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Conflict: Variable-Level Diff</h3>
      <p className="text-sm text-muted-foreground">
        Both local and remote have changed since last sync. Review differences below.
      </p>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-3 py-2 font-medium">Key</th>
              <th className="text-left px-3 py-2 font-medium">Local</th>
              <th className="text-left px-3 py-2 font-medium">Remote</th>
              <th className="text-center px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const style = statusStyles[entry.status];
              return (
                <tr key={entry.key} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{entry.key}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {entry.localMasked}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {entry.remoteMasked}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onKeepLocal}
          className="flex-1 px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted"
        >
          Keep Local
        </button>
        <button
          onClick={onAcceptRemote}
          className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
        >
          Accept Remote
        </button>
      </div>
    </div>
  );
}
