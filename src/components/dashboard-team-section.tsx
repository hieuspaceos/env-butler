// Team sharing section: v2 envelope encryption flows + v1 legacy fallback.
// Owner: invite members, view/revoke list, migrate vault to v2.
// Member: join via invite, activate with temp passphrase.

import { useState, useRef, useCallback, useEffect } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import MasterKeyInput from "@/components/master-key-input";
import DashboardTeamMembersList from "@/components/dashboard-team-members-list";
import {
  teamGenerateInvite,
  teamJoin,
  teamInviteV2,
  teamJoinV2,
  teamApproveMember,
  teamActivateMembership,
  teamListMembers,
  vaultMigrateV2,
  type ProjectEntry,
  type VaultMember,
} from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

type View =
  | "idle"
  // v2 owner flows
  | "v2-invite-form" | "v2-generating" | "v2-members" | "v2-approve-form" | "v2-migrate-form"
  // v2 member flows
  | "v2-join-select" | "v2-joining" | "v2-join-done" | "v2-activate-form" | "v2-activating"
  // v1 legacy flows
  | "v1-invite-form" | "v1-generating" | "v1-join-select" | "v1-join-key" | "v1-joining";

interface Props {
  activeProject: ProjectEntry | null;
  refresh: () => Promise<void>;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
}

export default function DashboardTeamSection({ activeProject, refresh, setError, setInfo }: Props) {
  const [view, setView] = useState<View>("idle");
  // v2 state
  const [inviteName, setInviteName] = useState("");
  const [members, setMembers] = useState<VaultMember[]>([]);
  const [approvingMemberId, setApprovingMemberId] = useState("");
  const [tempPassphrase, setTempPassphrase] = useState("");
  const [joinResult, setJoinResult] = useState<{ vault_slug: string; created_by: string } | null>(null);
  // v1 state
  const [v1InviteName, setV1InviteName] = useState("");
  const [v1Passphrase, setV1Passphrase] = useState("");
  const joinFileRef = useRef<Uint8Array | null>(null);

  const reset = useCallback(() => {
    joinFileRef.current = null;
    setInviteName(""); setV1InviteName(""); setV1Passphrase("");
    setTempPassphrase(""); setApprovingMemberId("");
    setJoinResult(null); setView("idle");
    setError(null); setInfo(null);
  }, [setError, setInfo]);

  const loadMembers = useCallback(async () => {
    if (!activeProject) return;
    try {
      const list = await teamListMembers(activeProject.slug);
      setMembers(list);
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }, [activeProject, setError]);

  useEffect(() => {
    if (view === "v2-members") loadMembers();
  }, [view, loadMembers]);

  // -- v2 Owner: generate invite --
  const handleV2Invite = useCallback(async () => {
    if (!activeProject) return;
    try {
      setView("v2-generating"); setError(null);
      const result = await teamInviteV2(activeProject.slug, inviteName.trim() || "owner");
      const filePath = await save({
        title: "Save v2 Invite Token",
        defaultPath: `${activeProject.slug}-v2.envbutler-team`,
        filters: [{ name: "Env Butler Team Token", extensions: ["envbutler-team"] }],
      });
      if (filePath) {
        await writeFile(filePath, new Uint8Array(result.token_bytes));
        setInfo(`v2 Invite saved to ${filePath}. Share this file with your teammate (no passphrase needed).`);
      }
      setInviteName(""); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, inviteName, setError, setInfo]);

  // -- v2 Owner: approve member --
  const handleApprove = useCallback(async (ownerMnemonic: string) => {
    if (!activeProject) return;
    if (!approvingMemberId.trim() || !tempPassphrase.trim()) {
      setError("Member ID and temp passphrase are required"); return;
    }
    try {
      setError(null);
      await teamApproveMember(activeProject.slug, approvingMemberId.trim(), ownerMnemonic, tempPassphrase.trim());
      setInfo(`Member approved. Share the temp passphrase with them so they can activate.`);
      setApprovingMemberId(""); setTempPassphrase("");
      await loadMembers();
      setView("v2-members");
    } catch (e) { setError(toErrorMessage(e)); }
  }, [activeProject, approvingMemberId, tempPassphrase, setError, setInfo, loadMembers]);

  // -- v2 Owner: migrate vault --
  const handleMigrate = useCallback(async (ownerMnemonic: string) => {
    if (!activeProject) return;
    try {
      setError(null);
      const result = await vaultMigrateV2(activeProject.slug, ownerMnemonic);
      setInfo(`Migrated to v2! Owner member ID: ${result.owner_member_id.slice(0, 16)}...`);
      setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, setError, setInfo]);

  // -- v2 Member: join via invite file --
  const handleV2JoinSelect = useCallback(async () => {
    try {
      setError(null);
      const filePath = await open({
        title: "Select .envbutler-team File",
        filters: [{ name: "Env Butler Team Token", extensions: ["envbutler-team"] }],
        multiple: false,
      });
      if (!filePath) return;
      joinFileRef.current = await readFile(filePath as string);
      setView("v2-joining");
    } catch (e) { setError(toErrorMessage(e)); }
  }, [setError]);

  const handleV2JoinSubmit = useCallback(async (memberPassphrase: string) => {
    if (!activeProject || !joinFileRef.current) return;
    try {
      setError(null);
      const result = await teamJoinV2(Array.from(joinFileRef.current), memberPassphrase, activeProject.path);
      joinFileRef.current = null;
      setJoinResult({ vault_slug: result.vault_slug, created_by: result.created_by });
      await refresh();
      setView("v2-join-done");
    } catch (e) { joinFileRef.current = null; setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, refresh, setError]);

  // -- v2 Member: activate with temp passphrase --
  const handleActivate = useCallback(async (memberPassphrase: string) => {
    if (!activeProject || !tempPassphrase.trim()) {
      setError("Temp passphrase is required"); return;
    }
    try {
      setView("v2-activating"); setError(null);
      await teamActivateMembership(activeProject.slug, tempPassphrase.trim(), memberPassphrase);
      setInfo("Membership activated! You can now push/pull with your personal passphrase.");
      setTempPassphrase(""); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, tempPassphrase, setError, setInfo]);

  // -- v1 Legacy: generate invite --
  const handleV1Invite = useCallback(async (masterKey: string) => {
    if (!activeProject) return;
    if (!v1Passphrase.trim()) { setError("Passphrase is required"); return; }
    try {
      setView("v1-generating"); setError(null);
      const bytes = await teamGenerateInvite(activeProject.slug, masterKey, v1Passphrase.trim(), v1InviteName.trim() || "anonymous");
      const filePath = await save({
        title: "Save Team Invite Token",
        defaultPath: `${activeProject.slug}.envbutler-team`,
        filters: [{ name: "Env Butler Team Token", extensions: ["envbutler-team"] }],
      });
      if (filePath) {
        await writeFile(filePath, new Uint8Array(bytes));
        setInfo(`Legacy invite saved to ${filePath}. Share file + passphrase with teammate.`);
      }
      setV1InviteName(""); setV1Passphrase(""); setView("idle");
    } catch (e) { setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, v1InviteName, v1Passphrase, setError, setInfo]);

  // -- v1 Legacy: join --
  const handleV1JoinSelect = useCallback(async () => {
    try {
      setError(null);
      const filePath = await open({ title: "Select .envbutler-team File", filters: [{ name: "Env Butler Team Token", extensions: ["envbutler-team"] }], multiple: false });
      if (!filePath) return;
      joinFileRef.current = await readFile(filePath as string);
      setView("v1-join-key");
    } catch (e) { setError(toErrorMessage(e)); }
  }, [setError]);

  const handleV1JoinSubmit = useCallback(async (passphrase: string) => {
    if (!activeProject || !joinFileRef.current) return;
    try {
      setView("v1-joining"); setError(null);
      await teamJoin(Array.from(joinFileRef.current), passphrase, activeProject.path);
      joinFileRef.current = null;
      await refresh();
      setInfo("Joined team project (legacy). You can now push/pull.");
      setView("idle");
    } catch (e) { joinFileRef.current = null; setError(toErrorMessage(e)); setView("idle"); }
  }, [activeProject, refresh, setError, setInfo]);

  if (!activeProject) return null;

  const inputCls = "w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const btnAmber = "flex-1 px-4 py-2 rounded-md border border-amber-500/50 text-sm hover:bg-amber-500/10 text-amber-400";
  const btnMuted = "w-full px-4 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted text-sm";

  return (
    <>
      {/* Idle: show all action buttons */}
      {view === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium">Team Sharing</p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground/70">v2 (Envelope Encryption)</p>
            <div className="flex gap-3">
              <button onClick={() => setView("v2-invite-form")} className={btnAmber}>Invite Member</button>
              <button onClick={handleV2JoinSelect} className={btnAmber}>Join via Invite</button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setView("v2-members"); }} className={btnAmber}>View Members</button>
              <button onClick={() => setView("v2-activate-form")} className={btnAmber}>Activate</button>
            </div>
            <button onClick={() => setView("v2-migrate-form")} className="w-full px-4 py-2 rounded-md border border-blue-500/50 text-sm hover:bg-blue-500/10 text-blue-400">
              Migrate Vault to v2
            </button>
          </div>
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
              Legacy (v1) — expand
            </summary>
            <div className="mt-2 flex gap-3">
              <button onClick={() => setView("v1-invite-form")} className="flex-1 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted text-muted-foreground">
                Invite (Legacy)
              </button>
              <button onClick={handleV1JoinSelect} className="flex-1 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted text-muted-foreground">
                Join (Legacy)
              </button>
            </div>
          </details>
        </div>
      )}

      {/* v2 Invite form */}
      {view === "v2-invite-form" && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h3 className="font-semibold">Invite Member (v2)</h3>
          <p className="text-xs text-muted-foreground">
            Generates a token file with a one-time code. No master key or passphrase shared — member registers their own key.
          </p>
          <div>
            <label className="text-sm text-muted-foreground">Your name (optional)</label>
            <input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="e.g. Alice" className={inputCls} />
          </div>
          <button onClick={handleV2Invite} className="w-full px-4 py-2 rounded-md bg-amber-500 text-black font-medium hover:opacity-90 text-sm">
            Generate & Save Token
          </button>
          <button onClick={reset} className={btnMuted}>Cancel</button>
        </div>
      )}

      {/* v2 Members list */}
      {view === "v2-members" && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Active Members</h3>
            <button onClick={loadMembers} className="text-xs text-muted-foreground hover:text-foreground">Refresh</button>
          </div>
          <DashboardTeamMembersList
            members={members}
            vaultSlug={activeProject.slug}
            onRefresh={loadMembers}
            setError={setError}
            setInfo={setInfo}
          />
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Approve pending member</p>
            <input type="text" value={approvingMemberId} onChange={(e) => setApprovingMemberId(e.target.value)} placeholder="Member ID (hex hash)" className={inputCls} />
            <input type="password" value={tempPassphrase} onChange={(e) => setTempPassphrase(e.target.value)} placeholder="Temp passphrase (share with member)" className={`${inputCls} mt-2`} />
            <button onClick={() => setView("v2-approve-form")} disabled={!approvingMemberId.trim() || !tempPassphrase.trim()} className="mt-2 w-full px-4 py-2 rounded-md bg-amber-500 text-black font-medium hover:opacity-90 text-sm disabled:opacity-50">
              Approve Member
            </button>
          </div>
          <button onClick={reset} className={btnMuted}>Done</button>
        </div>
      )}

      {/* v2 Approve: enter owner mnemonic */}
      {view === "v2-approve-form" && (
        <div className="rounded-lg border border-border p-6 space-y-3">
          <h3 className="font-semibold">Approve Member</h3>
          <p className="text-xs text-muted-foreground">Enter your mnemonic to unwrap the vault key and re-wrap it for the member.</p>
          <MasterKeyInput label="Your Mnemonic (Master Key)" onSubmit={handleApprove} submitText="Approve" />
          <button onClick={() => setView("v2-members")} className={btnMuted}>Cancel</button>
        </div>
      )}

      {/* v2 Migrate */}
      {view === "v2-migrate-form" && (
        <div className="rounded-lg border border-border p-6 space-y-3">
          <h3 className="font-semibold">Migrate Vault to v2</h3>
          <p className="text-xs text-muted-foreground">Re-encrypts the vault using envelope encryption. You become the first owner member.</p>
          <p className="text-xs text-amber-400/80">A backup of the v1 blob will be returned. Save it in case you need to roll back.</p>
          <MasterKeyInput label="Your Mnemonic (current Master Key)" onSubmit={handleMigrate} submitText="Migrate to v2" />
          <button onClick={reset} className={btnMuted}>Cancel</button>
        </div>
      )}

      {/* v2 Member: join — enter passphrase */}
      {view === "v2-joining" && (
        <div className="rounded-lg border border-border p-6 space-y-3">
          <h3 className="font-semibold">Join Team (v2)</h3>
          <p className="text-xs text-muted-foreground">Enter a personal passphrase. This will be your key to decrypt vault data after owner approves.</p>
          <MasterKeyInput label="Your personal passphrase" onSubmit={handleV2JoinSubmit} submitText="Join Project" />
          <button onClick={reset} className={btnMuted}>Cancel</button>
        </div>
      )}

      {/* v2 Member: join done */}
      {view === "v2-join-done" && joinResult && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <h3 className="font-semibold text-green-400">Invite Consumed</h3>
          <p className="text-sm"><span className="text-muted-foreground">Project:</span> {joinResult.vault_slug}</p>
          <p className="text-sm"><span className="text-muted-foreground">Invited by:</span> {joinResult.created_by}</p>
          <p className="text-xs text-muted-foreground">
            Status: pending approval. Wait for the owner to approve you, then use "Activate" with the temp passphrase they share.
          </p>
          <button onClick={reset} className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 text-sm">Done</button>
        </div>
      )}

      {/* v2 Member: activate */}
      {view === "v2-activate-form" && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h3 className="font-semibold">Activate Membership</h3>
          <p className="text-xs text-muted-foreground">Enter the temp passphrase the owner shared with you, plus your personal passphrase.</p>
          <div>
            <label className="text-sm text-muted-foreground">Temp passphrase (from owner)</label>
            <input type="password" value={tempPassphrase} onChange={(e) => setTempPassphrase(e.target.value)} placeholder="Temp passphrase" className={inputCls} />
          </div>
          <MasterKeyInput label="Your personal passphrase" onSubmit={handleActivate} submitText="Activate" />
          <button onClick={reset} className={btnMuted}>Cancel</button>
        </div>
      )}

      {/* Loading states */}
      {(view === "v2-generating" || view === "v2-activating" || view === "v1-generating" || view === "v1-joining") && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {view === "v2-generating" && "Generating v2 invite token..."}
          {view === "v2-activating" && "Activating membership..."}
          {view === "v1-generating" && "Generating legacy invite token..."}
          {view === "v1-joining" && "Joining project..."}
        </div>
      )}

      {/* v1 Legacy: invite form */}
      {view === "v1-invite-form" && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h3 className="font-semibold">Generate Invite (Legacy v1)</h3>
          <p className="text-xs text-amber-400/80">Legacy: includes Supabase credentials in token. Use v2 for new invites.</p>
          <div>
            <label className="text-sm text-muted-foreground">Your name (optional)</label>
            <input type="text" value={v1InviteName} onChange={(e) => setV1InviteName(e.target.value)} placeholder="e.g. Alice" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Passphrase (share separately)</label>
            <input type="password" value={v1Passphrase} onChange={(e) => setV1Passphrase(e.target.value)} placeholder="Strong passphrase" className={inputCls} />
          </div>
          <MasterKeyInput label="Master Key" onSubmit={handleV1Invite} submitText="Generate & Save Token" />
          <button onClick={reset} className={btnMuted}>Cancel</button>
        </div>
      )}

      {/* v1 Legacy: join — passphrase input */}
      {view === "v1-join-key" && (
        <div className="rounded-lg border border-border p-6 space-y-3">
          <h3 className="font-semibold">Join (Legacy v1)</h3>
          <MasterKeyInput label="Invite passphrase" onSubmit={handleV1JoinSubmit} submitText="Join Project" />
          <button onClick={reset} className={btnMuted}>Cancel</button>
        </div>
      )}
    </>
  );
}
