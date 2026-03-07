// First-run onboarding wizard: project slug → Master Key (BIP39 mnemonic) → Recovery Kit → Supabase config.
// The 24-word mnemonic IS the Master Key — same words always produce the same encryption key.

import { useState, useRef } from "react";
import { KeyRound, FolderOpen, Database, CheckCircle2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import RecoveryKitDisplay from "@/components/recovery-kit-display";
import { generateRecoveryKit, saveProjectSlug, saveSupabaseConfig } from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

interface OnboardingProps {
  onComplete: () => void;
}

type Step = "slug" | "master-key" | "recovery" | "supabase" | "done";

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>("slug");
  const [slug, setSlug] = useState("");
  const [projectPath, setProjectPath] = useState("");
  // Store mnemonic in ref to avoid exposure in React DevTools / fiber tree
  const mnemonicRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabaseUrlRef = useRef<HTMLInputElement>(null);
  const supabaseKeyRef = useRef<HTMLInputElement>(null);

  const handleSlugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !projectPath.trim()) return;

    try {
      setLoading(true);
      setError(null);
      await saveProjectSlug(projectPath, slug.trim());
      setStep("master-key");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMnemonic = async () => {
    try {
      setLoading(true);
      setError(null);
      const phrase = await generateRecoveryKit();
      mnemonicRef.current = phrase;
      setStep("recovery");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryConfirm = () => {
    setStep("supabase");
  };

  const handleSupabaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = supabaseUrlRef.current?.value?.trim();
    const key = supabaseKeyRef.current?.value?.trim();

    if (url && key) {
      try {
        setLoading(true);
        setError(null);
        await saveSupabaseConfig(url, key);
        setStep("done");
      } catch (err) {
        setError(toErrorMessage(err));
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    } else {
      setStep("done");
    }
  };

  const stepIndicators: { key: Step; icon: typeof KeyRound; label: string }[] = [
    { key: "slug", icon: FolderOpen, label: "Project" },
    { key: "master-key", icon: KeyRound, label: "Master Key" },
    { key: "recovery", icon: CheckCircle2, label: "Recovery" },
    { key: "supabase", icon: Database, label: "Supabase" },
  ];

  const currentIdx = stepIndicators.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Step indicators */}
        <div className="flex justify-center gap-6">
          {stepIndicators.map((s, i) => {
            const Icon = s.icon;
            const active = i <= currentIdx;
            return (
              <div key={s.key} className="flex flex-col items-center gap-1">
                <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground/40"}`} />
                <span className={`text-xs ${active ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Step: Project Slug */}
        {step === "slug" && (
          <form onSubmit={handleSlugSubmit} className="space-y-4">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold">Welcome to Env Butler</h1>
              <p className="text-muted-foreground mt-1">Set up your first project</p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Project Folder</label>
              <button
                type="button"
                onClick={async () => {
                  const selected = await open({ directory: true, multiple: false, title: "Select project folder" });
                  if (selected) {
                    const folderPath = selected as string;
                    setProjectPath(folderPath);
                    const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || "";
                    const autoSlug = folderName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
                    if (!slug) setSlug(autoSlug);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-left hover:bg-muted transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={projectPath ? "text-foreground truncate" : "text-muted-foreground"}>
                  {projectPath || "Click to select folder..."}
                </span>
              </button>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Project Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="my-saas-app"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for this project across all your machines
              </p>
            </div>
            <button
              type="submit"
              disabled={!slug.trim() || !projectPath.trim() || loading}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              Continue
            </button>
          </form>
        )}

        {/* Step: Master Key — generate BIP39 mnemonic */}
        {step === "master-key" && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold">Generate Your Master Key</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your Master Key is a 24-word mnemonic phrase. It encrypts all your .env files
                and can always recover your data.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300 space-y-2">
              <p className="font-semibold text-blue-200">How it works</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>We generate 24 random words (BIP39 standard)</li>
                <li>These words ARE your encryption key</li>
                <li>Same words always produce the same key</li>
                <li>You enter them when pushing or pulling</li>
              </ul>
            </div>
            <button
              onClick={handleGenerateMnemonic}
              disabled={loading}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate Master Key"}
            </button>
          </div>
        )}

        {/* Step: Recovery Kit — display and save mnemonic */}
        {step === "recovery" && mnemonicRef.current && (
          <RecoveryKitDisplay mnemonic={mnemonicRef.current} onConfirm={handleRecoveryConfirm} />
        )}

        {/* Step: Supabase Config */}
        {step === "supabase" && (
          <form onSubmit={handleSupabaseSubmit} className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold">Connect Supabase</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your self-hosted Supabase instance for encrypted vault storage
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Supabase URL</label>
              <input
                ref={supabaseUrlRef}
                type="url"
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Service Role Key</label>
              <input
                ref={supabaseKeyRef}
                type="password"
                placeholder="eyJhbGciOi..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              Complete Setup
            </button>
            <button
              type="button"
              onClick={() => setStep("done")}
              className="w-full px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm"
            >
              Skip for now
            </button>
          </form>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="text-center space-y-6">
            <CheckCircle2 className="w-16 h-16 mx-auto text-green-400" />
            <h2 className="text-xl font-bold">You're all set!</h2>
            <p className="text-muted-foreground">
              Env Butler is ready to securely sync your .env files.
            </p>
            <button
              onClick={onComplete}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
