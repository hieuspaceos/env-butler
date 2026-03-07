// Settings section: cloud sync folder picker (Google Drive, iCloud, Dropbox).

import { Cloud, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { saveSyncFolder } from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

interface SettingsSyncFolderProps {
  syncFolder: string | null;
  setSyncFolder: (folder: string | null) => void;
  setError: (err: string | null) => void;
  setSaved: (saved: boolean) => void;
}

export default function SettingsSyncFolder({ syncFolder, setSyncFolder, setError, setSaved }: SettingsSyncFolderProps) {
  const handleSelect = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Select sync folder" });
    if (selected) {
      const folder = selected as string;
      try {
        await saveSyncFolder(folder);
        setSyncFolder(folder);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(toErrorMessage(err));
      }
    }
  };

  const handleClear = async () => {
    try {
      await saveSyncFolder(null);
      setSyncFolder(null);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Cloud className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Sync Folder</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Point to a cloud-synced folder (Google Drive, iCloud, Dropbox) for automatic file-based sync — no Supabase needed.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSelect}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-left hover:bg-muted transition-colors"
        >
          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className={syncFolder ? "text-foreground truncate text-sm" : "text-muted-foreground text-sm"}>
            {syncFolder || "Click to select folder..."}
          </span>
        </button>
        {syncFolder && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-sm"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
