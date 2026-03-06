// Project status card showing sync state, last sync time, and file summary.

import { FolderSync, Clock, FileText } from "lucide-react";
import type { ProjectEntry } from "@/lib/tauri-commands";

interface ProjectStatusCardProps {
  project: ProjectEntry | null;
  fileCount?: number;
  onPush: () => void;
  onPull: () => void;
  onSettings: () => void;
}

type SyncStatus = "synced" | "out-of-sync" | "conflict" | "not-configured";

const statusConfig: Record<SyncStatus, { bg: string; text: string; label: string }> = {
  synced: { bg: "bg-green-500/20", text: "text-green-400", label: "In Sync" },
  "out-of-sync": { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Out of Sync" },
  conflict: { bg: "bg-red-500/20", text: "text-red-400", label: "Conflict" },
  "not-configured": { bg: "bg-muted", text: "text-muted-foreground", label: "Not Configured" },
};

export default function ProjectStatusCard({
  project,
  fileCount = 0,
  onPush,
  onPull,
  onSettings,
}: ProjectStatusCardProps) {
  const status: SyncStatus = project ? "out-of-sync" : "not-configured";
  const config = statusConfig[status];

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      {/* Header with status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderSync className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {project?.slug ?? "No project"}
            </h2>
            <p className="text-sm text-muted-foreground truncate max-w-xs">
              {project?.path ?? "Configure a project to start syncing"}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full ${config.bg} ${config.text}`}>
          {config.label}
        </span>
      </div>

      {/* Info row */}
      {project && (
        <div className="flex gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            {fileCount} .env files
          </div>
          {project.last_sync_at && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Last sync: {new Date(project.last_sync_at).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onPush}
          disabled={!project}
          className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Push
        </button>
        <button
          onClick={onPull}
          disabled={!project}
          className="flex-1 px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Pull
        </button>
        <button
          onClick={onSettings}
          className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
