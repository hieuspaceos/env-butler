// Main dashboard: project status, push/pull with Supabase sync, conflict resolution.

import { useState, useRef, useCallback } from "react";
import { useProjectState } from "@/hooks/use-project-state";
import ProjectStatusCard from "@/components/project-status-card";
import PushPreviewModal from "@/components/push-preview-modal";
import MasterKeyInput from "@/components/master-key-input";
import DiffView from "@/components/diff-view";
import {
  encryptAndPrepare,
  pushToSupabase,
  pullFromSupabase,
  checkConflict,
  decryptAndApply,
  decryptForDiff,
  type ScannedFile,
  type VaultRecord,
} from "@/lib/tauri-commands";
import { parseEnvContent, entriesToMap } from "@/lib/env-parser";
import { computeDiff, type DiffEntry } from "@/lib/diff-engine";

interface DashboardProps {
  onSettings: () => void;
}

type View = "idle" | "scanning" | "push-key" | "push-preview" | "pushing" | "pull-key" | "pulling" | "diff";

export default function Dashboard({ onSettings }: DashboardProps) {
  const { activeProject, scannedFiles, scan, refresh } = useProjectState();
  const [view, setView] = useState<View>("idle");
  const [manifest, setManifest] = useState<ScannedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [pullRecord, setPullRecord] = useState<VaultRecord | null>(null);

  const passwordRef = useRef("");

  // -- Push flow --

  const handlePush = useCallback(async () => {
    if (!activeProject) return;
    try {
      setError(null);
      setInfo(null);
      setView("scanning");
      const files = await scan(activeProject.path);
      if (files.filter((f) => !f.blocked).length === 0) {
        setError("No .env files found in project directory");
        setView("idle");
        return;
      }
      setManifest(files);
      setView("push-key");
    } catch (e) {
      setError(String(e));
      setView("idle");
    }
  }, [activeProject, scan]);

  const handlePushWithKey = useCallback((password: string) => {
    passwordRef.current = password;
    setView("push-preview");
  }, []);

  const handlePushConfirm = useCallback(async () => {
    if (!activeProject) return;
    try {
      setView("pushing");
      setError(null);
      const payload = await encryptAndPrepare(activeProject.path, passwordRef.current);

      // Build metadata for Supabase
      const meta = {
        files: payload.manifest
          .filter((f) => !f.blocked)
          .map((f) => ({ name: f.filename, size: f.size_bytes, vars: f.var_count })),
        pushed_at: new Date().toISOString(),
      };

      await pushToSupabase(activeProject.slug, payload.blob_hex, payload.plaintext_hash, meta);
      passwordRef.current = "";
      setInfo(`Pushed ${meta.files.length} files successfully`);
      await refresh();
      setView("idle");
    } catch (e) {
      setError(String(e));
      setView("idle");
    } finally {
      passwordRef.current = "";
    }
  }, [activeProject, refresh]);

  // -- Pull flow --

  const handlePullWithKey = useCallback(
    async (password: string) => {
      if (!activeProject) return;
      passwordRef.current = password;
      try {
        setView("pulling");
        setError(null);
        setInfo(null);

        // 1. Pull from Supabase
        const record = await pullFromSupabase(activeProject.slug);
        setPullRecord(record);

        // 2. Compute local hash by scanning + zipping
        const files = await scan(activeProject.path);
        const localFiles = files.filter((f) => !f.blocked);

        // If no local files, safe to pull directly
        if (localFiles.length === 0) {
          const written = await decryptAndApply(
            record.encrypted_blob,
            password,
            activeProject.path,
            activeProject.slug,
          );
          passwordRef.current = "";
          setInfo(`Pulled ${written.length} files`);
          await refresh();
          setView("idle");
          return;
        }

        // 3. Encrypt locally to get hash for comparison
        const localPayload = await encryptAndPrepare(activeProject.path, password);

        // 4. Check conflict
        const status = await checkConflict(
          activeProject.slug,
          record.plaintext_hash,
          localPayload.plaintext_hash,
        );

        if (status === "InSync") {
          passwordRef.current = "";
          setInfo("Already in sync — no changes needed");
          setView("idle");
        } else if (status === "SafePull") {
          const written = await decryptAndApply(
            record.encrypted_blob,
            password,
            activeProject.path,
            activeProject.slug,
          );
          passwordRef.current = "";
          setInfo(`Pulled ${written.length} files`);
          await refresh();
          setView("idle");
        } else if (status === "PushReminder") {
          passwordRef.current = "";
          setInfo("Local is ahead of remote. Consider pushing your changes.");
          setView("idle");
        } else {
          // True conflict — show diff
          const remoteFiles = await decryptForDiff(record.encrypted_blob, password);

          // Parse all local .env files into a merged KV map
          const localKV: Record<string, string> = {};
          for (const file of localFiles) {
            try {
              const content = await fetch(`file://${file.path}`).then((r) => r.text());
              const entries = parseEnvContent(content);
              Object.assign(localKV, entriesToMap(entries));
            } catch {
              // File read via Tauri not available here; use scan data
            }
          }

          // Parse remote files into KV map
          const remoteKV: Record<string, string> = {};
          for (const content of Object.values(remoteFiles)) {
            Object.assign(remoteKV, entriesToMap(parseEnvContent(content)));
          }

          setDiffEntries(computeDiff(localKV, remoteKV));
          setView("diff");
        }
      } catch (e) {
        setError(String(e));
        passwordRef.current = "";
        setView("idle");
      }
    },
    [activeProject, scan, refresh],
  );

  const handleAcceptRemote = useCallback(async () => {
    if (!activeProject || !pullRecord) return;
    try {
      setView("pulling");
      const written = await decryptAndApply(
        pullRecord.encrypted_blob,
        passwordRef.current,
        activeProject.path,
        activeProject.slug,
      );
      passwordRef.current = "";
      setInfo(`Applied remote: ${written.length} files written`);
      await refresh();
      setView("idle");
    } catch (e) {
      setError(String(e));
      setView("idle");
    }
  }, [activeProject, pullRecord, refresh]);

  const handleKeepLocal = useCallback(() => {
    passwordRef.current = "";
    setInfo("Kept local files. Push to update remote.");
    setView("idle");
  }, []);

  const handleCancel = useCallback(() => {
    passwordRef.current = "";
    setView("idle");
  }, []);

  const allowedCount = scannedFiles.filter((f) => !f.blocked).length;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Env Butler</h1>
          <p className="text-sm text-muted-foreground">
            Secure .env sync — zero-knowledge encryption
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        {info && (
          <div className="p-3 rounded-md bg-green-500/10 text-green-400 text-sm">{info}</div>
        )}

        <ProjectStatusCard
          project={activeProject}
          fileCount={allowedCount}
          onPush={handlePush}
          onPull={() => setView("pull-key")}
          onSettings={onSettings}
        />

        {/* Push: enter key */}
        {view === "push-key" && (
          <div className="rounded-lg border border-border p-6">
            <MasterKeyInput label="Enter Master Key to encrypt" onSubmit={handlePushWithKey} submitText="Continue to Preview" />
            <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
          </div>
        )}

        {/* Pull: enter key */}
        {view === "pull-key" && (
          <div className="rounded-lg border border-border p-6">
            <MasterKeyInput label="Enter Master Key to decrypt" onSubmit={handlePullWithKey} submitText="Pull & Decrypt" />
            <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
          </div>
        )}

        {/* Loading */}
        {(view === "scanning" || view === "pushing" || view === "pulling") && (
          <div className="text-center py-8 text-muted-foreground">
            {view === "scanning" && "Scanning project files..."}
            {view === "pushing" && "Encrypting and pushing..."}
            {view === "pulling" && "Pulling and decrypting..."}
          </div>
        )}

        {/* Push preview modal */}
        {view === "push-preview" && (
          <PushPreviewModal manifest={manifest} onConfirm={handlePushConfirm} onCancel={handleCancel} />
        )}

        {/* Conflict diff view */}
        {view === "diff" && (
          <div className="rounded-lg border border-border p-6">
            <DiffView entries={diffEntries} onAcceptRemote={handleAcceptRemote} onKeepLocal={handleKeepLocal} />
          </div>
        )}
      </div>
    </div>
  );
}
