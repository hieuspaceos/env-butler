// Cloud sync section: Push/Pull .env files to Supabase with conflict resolution.

import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import MasterKeyInput from "@/components/master-key-input";
import PushPreviewModal from "@/components/push-preview-modal";
import DiffView from "@/components/diff-view";
import {
  encryptAndPrepare,
  pushToSupabase,
  pullFromSupabase,
  readEnvContents,
  checkConflict,
  decryptAndApply,
  decryptForDiff,
  type ScannedFile,
  type ProjectEntry,
  type VaultRecord,
} from "@/lib/tauri-commands";
import { parseEnvContent, entriesToMap } from "@/lib/env-parser";
import { computeDiff, type DiffEntry } from "@/lib/diff-engine";
import { toErrorMessage } from "@/lib/error-utils";

type View = "idle" | "scanning" | "push-key" | "push-preview" | "pushing" | "pull-key" | "pulling" | "diff";

interface Props {
  activeProject: ProjectEntry | null;
  scan: (path: string) => Promise<ScannedFile[]>;
  refresh: () => Promise<void>;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
}

export interface CloudSyncHandle {
  startPush: () => void;
  startPull: () => void;
  isIdle: () => boolean;
}

export default forwardRef<CloudSyncHandle, Props>(function DashboardCloudSync(
  { activeProject, scan, refresh, setError, setInfo },
  ref,
) {
  const [view, setView] = useState<View>("idle");
  const [manifest, setManifest] = useState<ScannedFile[]>([]);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [pullRecord, setPullRecord] = useState<VaultRecord | null>(null);
  const passwordRef = useRef("");

  useImperativeHandle(ref, () => ({
    startPush: () => handlePush(),
    startPull: () => setView("pull-key"),
    isIdle: () => view === "idle",
  }));

  const handlePush = useCallback(async () => {
    if (!activeProject) return;
    try {
      setError(null); setInfo(null); setView("scanning");
      const files = await scan(activeProject.path);
      const allowed = files.filter((f) => !f.blocked);
      if (allowed.length === 0) {
        const blocked = files.filter((f) => f.blocked);
        setError(blocked.length > 0
          ? `All .env files blocked — ${blocked.map((f) => `${f.filename}: ${f.block_reason}`).join("; ")}`
          : "No .env files found in project directory");
        setView("idle"); return;
      }
      setManifest(files); setView("push-key");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, scan, setError, setInfo]);

  const handlePushConfirm = useCallback(async () => {
    if (!activeProject) return;
    try {
      setView("pushing"); setError(null);
      const payload = await encryptAndPrepare(activeProject.path, passwordRef.current);
      const meta = {
        files: payload.manifest.filter((f) => !f.blocked)
          .map((f) => ({ name: f.filename, size: f.size_bytes, vars: f.var_count })),
        pushed_at: new Date().toISOString(),
      };
      await pushToSupabase(activeProject.slug, payload.blob_hex, payload.plaintext_hash, meta);
      passwordRef.current = "";
      setInfo(`Pushed ${meta.files.length} files successfully`);
      await refresh(); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
    finally { passwordRef.current = ""; }
  }, [activeProject, refresh, setError, setInfo]);

  const handlePullWithKey = useCallback(async (password: string) => {
    if (!activeProject) return;
    passwordRef.current = password;
    try {
      setView("pulling"); setError(null); setInfo(null);
      const record = await pullFromSupabase(activeProject.slug);
      setPullRecord(record);
      const files = await scan(activeProject.path);
      const localFiles = files.filter((f) => !f.blocked);

      // No local files — safe to pull directly
      if (localFiles.length === 0) {
        const written = await decryptAndApply(record.encrypted_blob, password, activeProject.path, activeProject.slug);
        passwordRef.current = ""; setInfo(`Pulled ${written.length} files`);
        await refresh(); setView("idle"); return;
      }

      const localPayload = await encryptAndPrepare(activeProject.path, password);
      const status = await checkConflict(activeProject.slug, record.plaintext_hash, localPayload.plaintext_hash);

      if (status === "InSync") {
        passwordRef.current = ""; setInfo("Already in sync"); setView("idle");
      } else if (status === "SafePull") {
        const written = await decryptAndApply(record.encrypted_blob, password, activeProject.path, activeProject.slug);
        passwordRef.current = ""; setInfo(`Pulled ${written.length} files`); await refresh(); setView("idle");
      } else if (status === "PushReminder") {
        passwordRef.current = ""; setInfo("Local is ahead of remote. Consider pushing."); setView("idle");
      } else {
        // Conflict — show diff
        const remoteFiles = await decryptForDiff(record.encrypted_blob, password);
        const localContents = await readEnvContents(activeProject.path);
        const localKV: Record<string, string> = {};
        for (const content of Object.values(localContents)) Object.assign(localKV, entriesToMap(parseEnvContent(content)));
        const remoteKV: Record<string, string> = {};
        for (const content of Object.values(remoteFiles)) Object.assign(remoteKV, entriesToMap(parseEnvContent(content)));
        setDiffEntries(computeDiff(localKV, remoteKV)); setView("diff");
      }
    } catch (e) { setError(toErrorMessage(e)); passwordRef.current = ""; setView("idle"); }
  }, [activeProject, scan, refresh, setError, setInfo]);

  const handleAcceptRemote = useCallback(async () => {
    if (!activeProject || !pullRecord) return;
    try {
      setView("pulling");
      const written = await decryptAndApply(pullRecord.encrypted_blob, passwordRef.current, activeProject.path, activeProject.slug);
      passwordRef.current = ""; setInfo(`Applied remote: ${written.length} files`); await refresh(); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, pullRecord, refresh, setError, setInfo]);

  const handleCancel = useCallback(() => { passwordRef.current = ""; setView("idle"); }, []);

  if (view === "idle") return null;

  return (
    <>
      {view === "push-key" && (
        <div className="rounded-lg border border-border p-6">
          <MasterKeyInput label="Enter Master Key to encrypt" onSubmit={(p) => { passwordRef.current = p; setView("push-preview"); }} submitText="Continue to Preview" />
          <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
        </div>
      )}
      {view === "pull-key" && (
        <div className="rounded-lg border border-border p-6">
          <MasterKeyInput label="Enter Master Key to decrypt" onSubmit={handlePullWithKey} submitText="Pull & Decrypt" />
          <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
        </div>
      )}
      {(view === "scanning" || view === "pushing" || view === "pulling") && (
        <div className="text-center py-8 text-muted-foreground">
          {view === "scanning" && "Scanning project files..."}
          {view === "pushing" && "Encrypting and pushing..."}
          {view === "pulling" && "Pulling and decrypting..."}
        </div>
      )}
      {view === "push-preview" && <PushPreviewModal manifest={manifest} onConfirm={handlePushConfirm} onCancel={handleCancel} />}
      {view === "diff" && (
        <div className="rounded-lg border border-border p-6">
          <DiffView entries={diffEntries} onAcceptRemote={handleAcceptRemote} onKeepLocal={() => { passwordRef.current = ""; setInfo("Kept local files. Push to update remote."); setView("idle"); }} />
        </div>
      )}
    </>
  );
});
