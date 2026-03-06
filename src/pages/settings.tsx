// Settings: project management + global Supabase config.

import { useRef, useEffect, useState } from "react";
import { ArrowLeft, Database, CheckCircle2, FolderOpen, Trash2, Plus } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  saveSupabaseConfig,
  loadSupabaseConfig,
  loadProjects,
  saveProjectSlug,
  removeProject,
  type ProjectEntry,
} from "@/lib/tauri-commands";

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const urlRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const toErr = (e: unknown) =>
    e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);

  // Load existing data on mount
  useEffect(() => {
    loadSupabaseConfig()
      .then((config) => {
        if (urlRef.current) urlRef.current.value = config.supabase_url;
        if (keyRef.current) keyRef.current.value = config.supabase_service_role_key;
      })
      .catch(() => {});

    refreshProjects();
  }, []);

  const refreshProjects = async () => {
    try {
      const cfg = await loadProjects();
      setProjects(Object.values(cfg.projects));
    } catch {
      // No projects yet
    }
  };

  const handleSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlRef.current?.value?.trim();
    const key = keyRef.current?.value?.trim();

    if (!url || !key) {
      setError("Both URL and Service Role Key are required");
      return;
    }

    try {
      setError(null);
      await saveSupabaseConfig(url, key);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(toErr(err));
    }
  };

  const handleSelectFolder = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Select project folder" });
    if (selected) {
      const folderPath = selected as string;
      setNewPath(folderPath);
      const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || "";
      const autoSlug = folderName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
      if (!newSlug) setNewSlug(autoSlug);
    }
  };

  const handleAddProject = async () => {
    if (!newPath.trim() || !newSlug.trim()) return;
    try {
      setError(null);
      await saveProjectSlug(newPath.trim(), newSlug.trim());
      setNewPath("");
      setNewSlug("");
      setShowAddProject(false);
      await refreshProjects();
    } catch (err) {
      setError(toErr(err));
    }
  };

  const handleRemoveProject = async (slug: string) => {
    try {
      setError(null);
      await removeProject(slug);
      await refreshProjects();
    } catch (err) {
      setError(toErr(err));
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-md mx-auto space-y-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <h1 className="text-2xl font-bold">Settings</h1>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        {saved && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Settings saved
          </div>
        )}

        {/* Projects section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Projects</h2>
            </div>
            <button
              onClick={() => setShowAddProject(!showAddProject)}
              className="flex items-center gap-1 text-sm text-primary hover:opacity-80"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {/* Add project form */}
          {showAddProject && (
            <div className="space-y-3 p-4 rounded-md border border-border bg-muted/20">
              <button
                type="button"
                onClick={handleSelectFolder}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-left hover:bg-muted transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={newPath ? "text-foreground truncate" : "text-muted-foreground"}>
                  {newPath || "Click to select folder..."}
                </span>
              </button>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="project-slug"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddProject}
                  disabled={!newPath.trim() || !newSlug.trim()}
                  className="flex-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Add Project
                </button>
                <button
                  onClick={() => { setShowAddProject(false); setNewPath(""); setNewSlug(""); }}
                  className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Project list */}
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects configured</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.slug}
                  className="flex items-center justify-between p-3 rounded-md border border-border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium truncate">{p.slug}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.path}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveProject(p.slug)}
                    className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    title="Remove project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supabase section */}
        <form onSubmit={handleSaveSupabase} className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Supabase Connection</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Global config — shared across all projects
          </p>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Supabase URL</label>
            <input
              ref={urlRef}
              type="url"
              placeholder="https://your-project.supabase.co"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Service Role Key</label>
            <input
              ref={keyRef}
              type="password"
              placeholder="eyJhbGciOi..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
          >
            Save Settings
          </button>
        </form>
      </div>
    </div>
  );
}
