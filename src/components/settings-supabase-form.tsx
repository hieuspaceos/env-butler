// Settings section: Supabase connection config (URL + service role key + anon key).

import { useRef } from "react";
import { Database } from "lucide-react";
import { saveSupabaseConfig } from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

interface SettingsSupabaseFormProps {
  initialUrl: string;
  initialKey: string;
  initialAnonKey: string;
  setError: (err: string | null) => void;
  setSaved: (saved: boolean) => void;
}

export default function SettingsSupabaseForm({
  initialUrl,
  initialKey,
  initialAnonKey,
  setError,
  setSaved,
}: SettingsSupabaseFormProps) {
  const urlRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const anonKeyRef = useRef<HTMLInputElement>(null);

  // Set initial values once refs are attached
  if (urlRef.current && !urlRef.current.value && initialUrl) urlRef.current.value = initialUrl;
  if (keyRef.current && !keyRef.current.value && initialKey) keyRef.current.value = initialKey;
  if (anonKeyRef.current && !anonKeyRef.current.value && initialAnonKey) anonKeyRef.current.value = initialAnonKey;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlRef.current?.value?.trim();
    const key = keyRef.current?.value?.trim();
    const anonKey = anonKeyRef.current?.value?.trim() || undefined;

    if (!url || !key) {
      setError("Both URL and Service Role Key are required");
      return;
    }

    try {
      setError(null);
      await saveSupabaseConfig(url, key, anonKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
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
          defaultValue={initialUrl}
          placeholder="https://your-project.supabase.co"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Service Role Key</label>
        <input
          ref={keyRef}
          type="password"
          defaultValue={initialKey}
          placeholder="eyJhbGciOi..."
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Anon Key <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          ref={anonKeyRef}
          type="password"
          defaultValue={initialAnonKey}
          placeholder="eyJhbGciOi..."
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Required for Team v2 member access. Find it in Supabase Dashboard &gt; Settings &gt; API &gt; anon key.
        </p>
      </div>

      <button
        type="submit"
        className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
      >
        Save Settings
      </button>
    </form>
  );
}
