// Settings section: project list with add/remove functionality.

import { useState } from "react";
import { FolderOpen, Trash2, Plus } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  saveProjectSlug,
  removeProject,
  type ProjectEntry,
} from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

interface SettingsProjectListProps {
  projects: ProjectEntry[];
  onRefresh: () => void;
  setError: (err: string | null) => void;
}

export default function SettingsProjectList({ projects, onRefresh, setError }: SettingsProjectListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newSlug, setNewSlug] = useState("");

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

  const handleAdd = async () => {
    if (!newPath.trim() || !newSlug.trim()) return;
    try {
      setError(null);
      await saveProjectSlug(newPath.trim(), newSlug.trim());
      setNewPath("");
      setNewSlug("");
      setShowAdd(false);
      onRefresh();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  const handleRemove = async (slug: string) => {
    try {
      setError(null);
      await removeProject(slug);
      onRefresh();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Projects</h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-sm text-primary hover:opacity-80"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Add project form */}
      {showAdd && (
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
              onClick={handleAdd}
              disabled={!newPath.trim() || !newSlug.trim()}
              className="flex-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Add Project
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewPath(""); setNewSlug(""); }}
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
                onClick={() => handleRemove(p.slug)}
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
  );
}
