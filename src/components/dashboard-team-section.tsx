// Team sharing section: Generate invite tokens and join via .envbutler-team files.

import { useState, useRef, useCallback } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import MasterKeyInput from "@/components/master-key-input";
import {
  teamGenerateInvite,
  teamJoin,
  type ProjectEntry,
  type InvitePayload,
} from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

type View = "idle" | "invite-form" | "generating" | "join-select" | "join-key" | "joining" | "join-success";

interface Props {
  activeProject: ProjectEntry | null;
  refresh: () => Promise<void>;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
}

export default function DashboardTeamSection({ activeProject, refresh, setError, setInfo }: Props) {
  const [view, setView] = useState<View>("idle");
  const [inviteName, setInviteName] = useState("");
  const [invitePassphrase, setInvitePassphrase] = useState("");
  const [joinResult, setJoinResult] = useState<InvitePayload | null>(null);
  const joinFileRef = useRef<Uint8Array | null>(null);

  const handleCancel = useCallback(() => {
    joinFileRef.current = null;
    setInviteName(""); setInvitePassphrase("");
    setJoinResult(null); setView("idle");
  }, []);

  // -- Generate invite --
  const handleGenerateInvite = useCallback(async (masterKey: string) => {
    if (!activeProject) return;
    if (!invitePassphrase.trim()) { setError("Passphrase is required"); return; }
    try {
      setView("generating"); setError(null); setInfo(null);
      const bytes = await teamGenerateInvite(
        activeProject.slug, masterKey, invitePassphrase.trim(), inviteName.trim() || "anonymous",
      );
      const filePath = await save({
        title: "Save Team Invite Token",
        defaultPath: `${activeProject.slug}.envbutler-team`,
        filters: [{ name: "Env Butler Team Token", extensions: ["envbutler-team"] }],
      });
      if (filePath) {
        await writeFile(filePath, new Uint8Array(bytes));
        setInfo(`Invite token saved to ${filePath}. Share it + passphrase with your teammate.`);
      }
      setInviteName(""); setInvitePassphrase(""); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, inviteName, invitePassphrase, setError, setInfo]);

  // -- Join via invite --
  const handleJoinSelect = useCallback(async () => {
    try {
      setError(null); setInfo(null);
      const filePath = await open({
        title: "Select .envbutler-team File",
        filters: [{ name: "Env Butler Team Token", extensions: ["envbutler-team"] }],
        multiple: false,
      });
      if (!filePath) return;
      joinFileRef.current = await readFile(filePath as string);
      setView("join-key");
    } catch (e) { setError(toErrorMessage(e)); }
  }, [setError, setInfo]);

  const handleJoinWithPassphrase = useCallback(async (passphrase: string) => {
    if (!activeProject || !joinFileRef.current) return;
    try {
      setView("joining"); setError(null);
      const payload = await teamJoin(Array.from(joinFileRef.current), passphrase, activeProject.path);
      joinFileRef.current = null;
      setJoinResult(payload);
      await refresh();
      setView("join-success");
    } catch (e) { joinFileRef.current = null; setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, refresh, setError]);

  if (!activeProject) return null;

  return (
    <>
      {/* Team buttons */}
      {view === "idle" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Team Sharing</p>
          <div className="flex gap-3">
            <button
              onClick={() => setView("invite-form")}
              className="flex-1 px-4 py-2 rounded-md border border-amber-500/50 text-sm hover:bg-amber-500/10 text-amber-400"
            >
              Invite Teammate
            </button>
            <button
              onClick={handleJoinSelect}
              className="flex-1 px-4 py-2 rounded-md border border-amber-500/50 text-sm hover:bg-amber-500/10 text-amber-400"
            >
              Join via Invite
            </button>
          </div>
        </div>
      )}

      {/* Invite form: name + passphrase + master key */}
      {view === "invite-form" && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h3 className="font-semibold">Generate Team Invite</h3>
          <p className="text-xs text-muted-foreground">
            Creates an encrypted token file. Share it + the passphrase with your teammate.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Your name (optional)</label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Alice"
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Passphrase (share separately)</label>
              <input
                type="password"
                value={invitePassphrase}
                onChange={(e) => setInvitePassphrase(e.target.value)}
                placeholder="Strong passphrase for this invite"
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <MasterKeyInput label="Master Key (encrypts the invite)" onSubmit={handleGenerateInvite} submitText="Generate & Save Token" />
          <button onClick={handleCancel} className="w-full px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
        </div>
      )}

      {/* Join: enter passphrase */}
      {view === "join-key" && (
        <div className="rounded-lg border border-border p-6">
          <MasterKeyInput label="Enter the invite passphrase" onSubmit={handleJoinWithPassphrase} submitText="Join Project" />
          <button onClick={handleCancel} className="w-full mt-3 px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm">Cancel</button>
        </div>
      )}

      {/* Loading */}
      {(view === "generating" || view === "joining") && (
        <div className="text-center py-8 text-muted-foreground">
          {view === "generating" && "Generating encrypted invite token..."}
          {view === "joining" && "Decrypting invite and joining project..."}
        </div>
      )}

      {/* Join success */}
      {view === "join-success" && joinResult && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <h3 className="font-semibold text-green-400">Joined Successfully</h3>
          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Project:</span> {joinResult.vault_slug}</p>
            <p><span className="text-muted-foreground">Invited by:</span> {joinResult.created_by}</p>
            <p><span className="text-muted-foreground">Permissions:</span> {joinResult.permissions}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Config saved. You can now Push/Pull this project.
          </p>
          <button onClick={handleCancel} className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 text-sm">Done</button>
        </div>
      )}
    </>
  );
}
