// Settings: Supabase connection config with save/load.

import { useRef, useEffect, useState } from "react";
import { ArrowLeft, Database, CheckCircle2 } from "lucide-react";
import { saveSupabaseConfig, loadSupabaseConfig } from "@/lib/tauri-commands";

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const urlRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSupabaseConfig()
      .then((config) => {
        if (urlRef.current) urlRef.current.value = config.supabase_url;
        if (keyRef.current) keyRef.current.value = config.supabase_anon_key;
      })
      .catch(() => {
        // Not configured yet — leave inputs empty
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlRef.current?.value?.trim();
    const key = keyRef.current?.value?.trim();

    if (!url || !key) {
      setError("Both URL and Anon Key are required");
      return;
    }

    try {
      setError(null);
      await saveSupabaseConfig(url, key);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
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

        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Supabase Connection</h2>
            </div>

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
              <label className="block text-sm font-medium">Anon Key</label>
              <input
                ref={keyRef}
                type="password"
                placeholder="eyJhbGciOi..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            </div>
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
