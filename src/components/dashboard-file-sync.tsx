// File sync section: Export/Import .envbutler files + folder-based sync (Google Drive/iCloud/Dropbox).

import { useState, useRef, useCallback, useEffect } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import MasterKeyInput from "@/components/master-key-input";
import {
  exportVault,
  importVault,
  folderPush,
  folderPull,
  loadSupabaseConfig,
  type ProjectEntry,
} from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

type View = "idle" | "export-key" | "exporting" | "import-key" | "importing" | "import-preview"
  | "file-push-key" | "file-pushing" | "file-pull-key" | "file-pulling" | "file-pull-preview";

interface Props {
  activeProject: ProjectEntry | null;
  refresh: () => Promise<void>;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
}

export default function DashboardFileSync({ activeProject, refresh, setError, setInfo }: Props) {
  const [view, setView] = useState<View>("idle");
  const [importedFiles, setImportedFiles] = useState<Record<string, string>>({});
  const [filePullFiles, setFilePullFiles] = useState<Record<string, string>>({});
  const [syncFolder, setSyncFolder] = useState<string | null>(null);
  const importFileRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    loadSupabaseConfig().then((c) => setSyncFolder(c.sync_folder)).catch(() => {});
  }, []);

  const handleCancel = useCallback(() => {
    importFileRef.current = null; setImportedFiles({}); setFilePullFiles({}); setView("idle");
  }, []);

  // -- Export --
  const handleExportWithKey = useCallback(async (password: string) => {
    if (!activeProject) return;
    try {
      setView("exporting"); setError(null); setInfo(null);
      const bytes = await exportVault(activeProject.path, password);
      const filePath = await save({
        title: "Save Encrypted Vault",
        defaultPath: `${activeProject.slug}.envbutler`,
        filters: [{ name: "Env Butler Vault", extensions: ["envbutler"] }],
      });
      if (filePath) { await writeFile(filePath, new Uint8Array(bytes)); setInfo(`Exported to ${filePath}`); }
      setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, setError, setInfo]);

  // -- Import --
  const handleImportSelect = useCallback(async () => {
    try {
      setError(null); setInfo(null);
      const filePath = await open({
        title: "Select .envbutler File",
        filters: [{ name: "Env Butler Vault", extensions: ["envbutler"] }],
        multiple: false,
      });
      if (!filePath) return;
      importFileRef.current = await readFile(filePath as string);
      setView("import-key");
    } catch (e) { setError(toErrorMessage(e)); }
  }, [setError, setInfo]);

  const handleImportWithKey = useCallback(async (password: string) => {
    if (!activeProject || !importFileRef.current) return;
    try {
      setView("importing"); setError(null);
      const files = await importVault(Array.from(importFileRef.current), password);
      importFileRef.current = null; setImportedFiles(files); setView("import-preview");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, setError]);

  const handleImportConfirm = useCallback(async () => {
    if (!activeProject) return;
    try {
      setView("importing");
      const projectDir = activeProject.path;
      for (const [filename, content] of Object.entries(importedFiles)) {
        if (filename.includes("..") || filename.startsWith("/")) continue;
        await writeFile(`${projectDir}/${filename}`, new TextEncoder().encode(content));
      }
      setInfo(`Imported ${Object.keys(importedFiles).length} files`);
      setImportedFiles({}); await refresh(); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, importedFiles, refresh, setError, setInfo]);

  // -- Folder sync --
  const handleFilePushWithKey = useCallback(async (password: string) => {
    if (!activeProject) return;
    try {
      setView("file-pushing"); setError(null); setInfo(null);
      const dest = await folderPush(activeProject.slug, activeProject.path, password);
      setInfo(`Synced to ${dest}`); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, setError, setInfo]);

  const handleFilePullWithKey = useCallback(async (password: string) => {
    if (!activeProject) return;
    try {
      setView("file-pulling"); setError(null); setInfo(null);
      const files = await folderPull(activeProject.slug, password);
      setFilePullFiles(files); setView("file-pull-preview");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, setError, setInfo]);

  const handleFilePullConfirm = useCallback(async () => {
    if (!activeProject) return;
    try {
      setView("file-pulling");
      const projectDir = activeProject.path;
      for (const [filename, content] of Object.entries(filePullFiles)) {
        if (filename.includes("..") || filename.startsWith("/")) continue;
        await writeFile(`${projectDir}/${filename}`, new TextEncoder().encode(content));
      }
      setInfo(`Pulled ${Object.keys(filePullFiles).length} files from sync folder`);
      setFilePullFiles({}); await refresh(); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, filePullFiles, refresh, setError, setInfo]);

  // Helper: file preview list
  const FilePreview = ({ files, title, onConfirm }: { files: Record<string, string>; title: string; onConfirm: () => void }) => (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="space-y-2">
        {Object.entries(files).map(([name, content]) => (
          <div key={name} className="p-3 rounded-md bg-muted/30 border border-border">
            <p className="font-mono text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length} variables</p>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={onConfirm} className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 text-sm">Write Files</button>
        <button onClick={handleCancel} className="flex-1 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
      </div>
    </div>
  );

  return (
    <>
      {/* Folder sync buttons */}
      {view === "idle" && activeProject && syncFolder && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">File Sync: {syncFolder}</p>
          <div className="flex gap-3">
            <button onClick={() => setView("file-push-key")} className="flex-1 px-4 py-2 rounded-md border border-primary/50 text-sm hover:bg-primary/10 text-primary">File Push</button>
            <button onClick={() => setView("file-pull-key")} className="flex-1 px-4 py-2 rounded-md border border-primary/50 text-sm hover:bg-primary/10 text-primary">File Pull</button>
          </div>
        </div>
      )}

      {/* Export / Import buttons */}
      {view === "idle" && activeProject && (
        <div className="flex gap-3">
          <button onClick={() => setView("export-key")} className="flex-1 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted text-muted-foreground">Export File</button>
          <button onClick={handleImportSelect} className="flex-1 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted text-muted-foreground">Import File</button>
        </div>
      )}

      {/* Key input views */}
      {(view === "file-push-key" || view === "file-pull-key" || view === "export-key" || view === "import-key") && (
        <div className="rounded-lg border border-border p-6">
          <MasterKeyInput
            label={{
              "file-push-key": "Enter Master Key to encrypt & sync",
              "file-pull-key": "Enter Master Key to decrypt from sync folder",
              "export-key": "Enter Master Key to export",
              "import-key": "Enter Master Key to decrypt import",
            }[view]!}
            onSubmit={{
              "file-push-key": handleFilePushWithKey,
              "file-pull-key": handleFilePullWithKey,
              "export-key": handleExportWithKey,
              "import-key": handleImportWithKey,
            }[view]!}
            submitText={{
              "file-push-key": "Push to Sync Folder",
              "file-pull-key": "Pull from Sync Folder",
              "export-key": "Export Encrypted File",
              "import-key": "Decrypt & Preview",
            }[view]!}
          />
          <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
        </div>
      )}

      {/* Loading states */}
      {(view === "exporting" || view === "importing" || view === "file-pushing" || view === "file-pulling") && (
        <div className="text-center py-8 text-muted-foreground">
          {view === "exporting" && "Encrypting and exporting..."}
          {view === "importing" && "Decrypting imported file..."}
          {view === "file-pushing" && "Encrypting and syncing to folder..."}
          {view === "file-pulling" && "Reading and decrypting from folder..."}
        </div>
      )}

      {/* Preview views */}
      {view === "import-preview" && <FilePreview files={importedFiles} title="Import Preview" onConfirm={handleImportConfirm} />}
      {view === "file-pull-preview" && <FilePreview files={filePullFiles} title="Pull Preview (from sync folder)" onConfirm={handleFilePullConfirm} />}
    </>
  );
}
