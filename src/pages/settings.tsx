// Settings: project management + sync folder + Supabase config.

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { loadSupabaseConfig, loadProjects, type ProjectEntry } from "@/lib/tauri-commands";
import SettingsProjectList from "@/components/settings-project-list";
import SettingsSyncFolder from "@/components/settings-sync-folder";
import SettingsSupabaseForm from "@/components/settings-supabase-form";

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [syncFolder, setSyncFolder] = useState<string | null>(null);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");

  useEffect(() => {
    loadSupabaseConfig()
      .then((config) => {
        setSupabaseUrl(config.supabase_url);
        setSupabaseKey(config.supabase_service_role_key);
        setSyncFolder(config.sync_folder);
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

        <SettingsProjectList projects={projects} onRefresh={refreshProjects} setError={setError} />
        <SettingsSyncFolder syncFolder={syncFolder} setSyncFolder={setSyncFolder} setError={setError} setSaved={setSaved} />
        <SettingsSupabaseForm initialUrl={supabaseUrl} initialKey={supabaseKey} setError={setError} setSaved={setSaved} />
      </div>
    </div>
  );
}
