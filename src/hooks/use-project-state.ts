// Active project state management hook.
// Tracks current project, scan results, and loading states.

import { useState, useEffect, useCallback } from "react";
import {
  loadProjects,
  scanProject,
  type ProjectEntry,
  type ProjectsConfig,
  type ScannedFile,
} from "@/lib/tauri-commands";

interface ProjectState {
  config: ProjectsConfig | null;
  activeProject: ProjectEntry | null;
  scannedFiles: ScannedFile[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setActiveSlug: (slug: string) => void;
  scan: (path: string) => Promise<ScannedFile[]>;
}

export function useProjectState(): ProjectState {
  const [config, setConfig] = useState<ProjectsConfig | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const cfg = await loadProjects();
      setConfig(cfg);

      // Auto-select first project if none active
      if (!activeSlug) {
        const slugs = Object.keys(cfg.projects);
        if (slugs.length > 0) {
          setActiveSlug(slugs[0]);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeSlug]);

  const scan = useCallback(async (path: string): Promise<ScannedFile[]> => {
    const files = await scanProject(path);
    setScannedFiles(files);
    return files;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeProject = config?.projects[activeSlug ?? ""] ?? null;

  return {
    config,
    activeProject,
    scannedFiles,
    loading,
    error,
    refresh,
    setActiveSlug,
    scan,
  };
}
