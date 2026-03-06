// First-run onboarding wizard: project slug → Master Key → Recovery Kit → Supabase config.

import { useState, useRef } from "react";
import { KeyRound, FolderOpen, Database, CheckCircle2 } from "lucide-react";
import RecoveryKitDisplay from "@/components/recovery-kit-display";
import { generateRecoveryKit, saveProjectSlug } from "@/lib/tauri-commands";

interface OnboardingProps {
  onComplete: () => void;
}

type Step = "slug" | "master-key" | "recovery" | "supabase" | "done";

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>("slug");
  const [slug, setSlug] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const masterKeyRef = useRef<HTMLInputElement>(null);
  const confirmKeyRef = useRef<HTMLInputElement>(null);
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
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMasterKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = masterKeyRef.current?.value;
    const confirm = confirmKeyRef.current?.value;

    if (!key || !confirm) return;
    if (key !== confirm) {
      setError("Master Keys do not match");
      return;
    }
    if (key.length < 8) {
      setError("Master Key must be at least 8 characters");
      return;
    }

    // Clear inputs immediately
    if (masterKeyRef.current) masterKeyRef.current.value = "";
    if (confirmKeyRef.current) confirmKeyRef.current.value = "";

    try {
      setLoading(true);
      setError(null);
      const phrase = await generateRecoveryKit();
      setMnemonic(phrase);
      setStep("recovery");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryConfirm = () => {
    setStep("supabase");
  };

  const handleSupabaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Supabase config will be used in Phase 4
    // For now just proceed
    setStep("done");
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
              <label className="block text-sm font-medium">Project Path</label>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/Users/you/projects/my-app"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
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

        {/* Step: Master Key */}
        {step === "master-key" && (
          <form onSubmit={handleMasterKeySubmit} className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold">Set Your Master Key</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This password encrypts all your .env files. It is never stored or transmitted.
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Master Key</label>
              <input
                ref={masterKeyRef}
                type="password"
                autoComplete="off"
                data-1p-ignore
                placeholder="Enter Master Key (min 8 chars)"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Confirm Master Key</label>
              <input
                ref={confirmKeyRef}
                type="password"
                autoComplete="off"
                data-1p-ignore
                placeholder="Re-enter Master Key"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Generating Recovery Kit..." : "Continue"}
            </button>
          </form>
        )}

        {/* Step: Recovery Kit */}
        {step === "recovery" && mnemonic && (
          <RecoveryKitDisplay mnemonic={mnemonic} onConfirm={handleRecoveryConfirm} />
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
              <label className="block text-sm font-medium">Anon Key</label>
              <input
                ref={supabaseKeyRef}
                type="password"
                placeholder="eyJhbGciOi..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
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
