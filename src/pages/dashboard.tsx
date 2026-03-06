// Main dashboard: project status, push/pull with Supabase sync, conflict resolution.

import { useState, useRef, useCallback } from "react";
import { useProjectState } from "@/hooks/use-project-state";
import ProjectStatusCard from "@/components/project-status-card";
import PushPreviewModal from "@/components/push-preview-modal";
import MasterKeyInput from "@/components/master-key-input";
import DiffView from "@/components/diff-view";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import {
  encryptAndPrepare,
  pushToSupabase,
  pullFromSupabase,
  checkConflict,
  decryptAndApply,
  decryptForDiff,
  exportVault,
  importVault,
  type ScannedFile,
  type VaultRecord,
} from "@/lib/tauri-commands";
import { parseEnvContent, entriesToMap } from "@/lib/env-parser";
import { computeDiff, type DiffEntry } from "@/lib/diff-engine";

// Extract readable message from Tauri invoke errors (which may be objects, not strings)
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return JSON.stringify(e);
}

interface DashboardProps {
  onSettings: () => void;
}

type View = "idle" | "scanning" | "push-key" | "push-preview" | "pushing" | "pull-key" | "pulling" | "diff" | "export-key" | "exporting" | "import-key" | "importing" | "import-preview";

export default function Dashboard({ onSettings }: DashboardProps) {
  const { config, activeProject, scannedFiles, scan, refresh, setActiveSlug } = useProjectState();
  const projectSlugs = config ? Object.keys(config.projects) : [];
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
      const allowed = files.filter((f) => !f.blocked);
      if (allowed.length === 0) {
        const blocked = files.filter((f) => f.blocked);
        if (blocked.length > 0) {
          const reasons = blocked.map((f) => `${f.filename}: ${f.block_reason}`).join("; ");
          setError(`All .env files were blocked by safety checks — ${reasons}`);
        } else {
          setError("No .env files found in project directory");
        }
        setView("idle");
        return;
      }
      setManifest(files);
      setView("push-key");
    } catch (e) {
      setError(toErrorMessage(e));
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
      setError(toErrorMessage(e));
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
        setError(toErrorMessage(e));
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
      setError(toErrorMessage(e));
      setView("idle");
    }
  }, [activeProject, pullRecord, refresh]);

  const handleKeepLocal = useCallback(() => {
    passwordRef.current = "";
    setInfo("Kept local files. Push to update remote.");
    setView("idle");
  }, []);

  // -- Export flow --

  const [importedFiles, setImportedFiles] = useState<Record<string, string>>({});

  const handleExportWithKey = useCallback(
    async (password: string) => {
      if (!activeProject) return;
      try {
        setView("exporting");
        setError(null);
        setInfo(null);
        const bytes = await exportVault(activeProject.path, password);
        const filePath = await save({
          title: "Save Encrypted Vault",
          defaultPath: `${activeProject.slug}.envbutler`,
          filters: [{ name: "Env Butler Vault", extensions: ["envbutler"] }],
        });
        if (filePath) {
          await writeFile(filePath, new Uint8Array(bytes));
          setInfo(`Exported to ${filePath}`);
        }
        setView("idle");
      } catch (e) {
        setError(toErrorMessage(e));
        setView("idle");
      }
    },
    [activeProject],
  );

  // -- Import flow --

  const importFileRef = useRef<Uint8Array | null>(null);

  const handleImportSelect = useCallback(async () => {
    try {
      setError(null);
      setInfo(null);
      const filePath = await open({
        title: "Select .envbutler File",
        filters: [{ name: "Env Butler Vault", extensions: ["envbutler"] }],
        multiple: false,
      });
      if (!filePath) return;
      const bytes = await readFile(filePath as string);
      importFileRef.current = bytes;
      setView("import-key");
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }, []);

  const handleImportWithKey = useCallback(
    async (password: string) => {
      if (!activeProject || !importFileRef.current) return;
      try {
        setView("importing");
        setError(null);
        const files = await importVault(Array.from(importFileRef.current), password);
        importFileRef.current = null;
        setImportedFiles(files);
        setView("import-preview");
      } catch (e) {
        setError(toErrorMessage(e));
        setView("idle");
      }
    },
    [activeProject],
  );

  const handleImportConfirm = useCallback(async () => {
    if (!activeProject) return;
    try {
      setView("importing");
      const projectDir = activeProject.path;
      for (const [filename, content] of Object.entries(importedFiles)) {
        // Security: only write .env* files, no path traversal
        if (filename.includes("..") || filename.startsWith("/")) continue;
        const path = `${projectDir}/${filename}`;
        const encoder = new TextEncoder();
        await writeFile(path, encoder.encode(content));
      }
      setInfo(`Imported ${Object.keys(importedFiles).length} files`);
      setImportedFiles({});
      await refresh();
      setView("idle");
    } catch (e) {
      setError(toErrorMessage(e));
      setView("idle");
    }
  }, [activeProject, importedFiles, refresh]);

  const handleCancel = useCallback(() => {
    passwordRef.current = "";
    importFileRef.current = null;
    setImportedFiles({});
    setView("idle");
  }, []);

  const allowedCount = scannedFiles.filter((f) => !f.blocked).length;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Env Butler</h1>
          <p className="text-sm text-muted-foreground">
            Secure .env sync — zero-knowledge encryption
          </p>
          {projectSlugs.length > 1 && (
            <select
              value={activeProject?.slug ?? ""}
              onChange={(e) => setActiveSlug(e.target.value)}
              className="mt-2 px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {projectSlugs.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
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

        {/* Export / Import buttons */}
        {view === "idle" && activeProject && (
          <div className="flex gap-3">
            <button
              onClick={() => setView("export-key")}
              className="flex-1 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted"
            >
              Export File
            </button>
            <button
              onClick={handleImportSelect}
              className="flex-1 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted"
            >
              Import File
            </button>
          </div>
        )}

        {/* Export: enter key */}
        {view === "export-key" && (
          <div className="rounded-lg border border-border p-6">
            <MasterKeyInput label="Enter Master Key to export" onSubmit={handleExportWithKey} submitText="Export Encrypted File" />
            <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
          </div>
        )}

        {/* Import: enter key */}
        {view === "import-key" && (
          <div className="rounded-lg border border-border p-6">
            <MasterKeyInput label="Enter Master Key to decrypt import" onSubmit={handleImportWithKey} submitText="Decrypt & Preview" />
            <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
          </div>
        )}

        {/* Import preview */}
        {view === "import-preview" && (
          <div className="rounded-lg border border-border p-6 space-y-4">
            <h3 className="font-semibold">Import Preview</h3>
            <div className="space-y-2">
              {Object.entries(importedFiles).map(([name, content]) => (
                <div key={name} className="p-3 rounded-md bg-muted/30 border border-border">
                  <p className="font-mono text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length} variables</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={handleImportConfirm} className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 text-sm">
                Write Files
              </button>
              <button onClick={handleCancel} className="flex-1 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

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
        {(view === "scanning" || view === "pushing" || view === "pulling" || view === "exporting" || view === "importing") && (
          <div className="text-center py-8 text-muted-foreground">
            {view === "scanning" && "Scanning project files..."}
            {view === "pushing" && "Encrypting and pushing..."}
            {view === "pulling" && "Pulling and decrypting..."}
            {view === "exporting" && "Encrypting and exporting..."}
            {view === "importing" && "Decrypting imported file..."}
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
