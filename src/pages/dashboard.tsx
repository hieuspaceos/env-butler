// Main dashboard: project selector, status card, and sync/team sections.

import { useState, useRef } from "react";
import { useProjectState } from "@/hooks/use-project-state";
import ProjectStatusCard from "@/components/project-status-card";
import DashboardCloudSync, { type CloudSyncHandle } from "@/components/dashboard-cloud-sync";
import DashboardFileSync from "@/components/dashboard-file-sync";
import DashboardTeamSection from "@/components/dashboard-team-section";
import UpdateChecker from "@/components/update-checker";

interface DashboardProps {
  onSettings: () => void;
}

export default function Dashboard({ onSettings }: DashboardProps) {
  const { config, activeProject, scannedFiles, scan, refresh, setActiveSlug } = useProjectState();
  const projectSlugs = config ? Object.keys(config.projects) : [];
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cloudSyncRef = useRef<CloudSyncHandle>(null);

  const allowedCount = scannedFiles.filter((f) => !f.blocked).length;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
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

        {/* Update banner */}
        <UpdateChecker />

        {/* Status messages */}
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        {info && (
          <div className="p-3 rounded-md bg-green-500/10 text-green-400 text-sm">{info}</div>
        )}

        {/* Project status + push/pull triggers */}
        <ProjectStatusCard
          project={activeProject}
          fileCount={allowedCount}
          onPush={() => cloudSyncRef.current?.startPush()}
          onPull={() => cloudSyncRef.current?.startPull()}
          onSettings={onSettings}
        />

        {/* Cloud sync flows (push/pull key inputs, preview, diff) */}
        <DashboardCloudSync
          ref={cloudSyncRef}
          activeProject={activeProject}
          scan={scan}
          refresh={refresh}
          setError={setError}
          setInfo={setInfo}
        />

        {/* File sync + export/import */}
        <DashboardFileSync
          activeProject={activeProject}
          refresh={refresh}
          setError={setError}
          setInfo={setInfo}
        />

        {/* Team sharing */}
        <DashboardTeamSection
          activeProject={activeProject}
          refresh={refresh}
          setError={setError}
          setInfo={setInfo}
        />
      </div>
    </div>
  );
}
