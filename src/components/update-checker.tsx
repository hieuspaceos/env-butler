// Auto-update checker: checks for new versions on mount and shows install banner.

import { useState, useEffect, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X, Loader2 } from "lucide-react";
import { toErrorMessage } from "@/lib/error-utils";

export default function UpdateChecker() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateObj, setUpdateObj] = useState<Awaited<ReturnType<typeof check>> | null>(null);

  useEffect(() => {
    const doCheck = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateVersion(update.version);
          setUpdateObj(update);
        }
      } catch {
        // Silently fail — user doesn't need to know update check failed
      }
    };
    doCheck();
  }, []);

  const handleInstall = useCallback(async () => {
    if (!updateObj) return;
    try {
      setInstalling(true);
      setError(null);
      await updateObj.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setError(toErrorMessage(e));
      setInstalling(false);
    }
  }, [updateObj]);

  if (!updateVersion || dismissed) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-md text-sm">
      <Download className="w-4 h-4 text-blue-400 shrink-0" />
      <span className="flex-1 text-blue-300">
        v{updateVersion} available
        {error && <span className="text-destructive ml-2">— {error}</span>}
      </span>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
      >
        {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Update"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
