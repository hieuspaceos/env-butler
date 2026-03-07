// Team v2 members list: show active members, support revoke.

import { useState, useCallback } from "react";
import { teamRevokeMember, type VaultMember } from "@/lib/tauri-commands";
import { toErrorMessage } from "@/lib/error-utils";

interface Props {
  members: VaultMember[];
  vaultSlug: string;
  onRefresh: () => Promise<void>;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
}

export default function DashboardTeamMembersList({ members, vaultSlug, onRefresh, setError, setInfo }: Props) {
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleRevoke = useCallback(async (memberId: string) => {
    if (!confirm(`Revoke member ${memberId.slice(0, 12)}...? They will lose access.`)) return;
    try {
      setRevoking(memberId);
      setError(null);
      await teamRevokeMember(vaultSlug, memberId);
      setInfo("Member revoked.");
      await onRefresh();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setRevoking(null);
    }
  }, [vaultSlug, onRefresh, setError, setInfo]);

  if (members.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No active members yet.</p>;
  }

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <div key={m.member_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${m.role === "owner" ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"}`}>
                {m.role}
              </span>
              {m.created_by && (
                <span className="text-xs text-muted-foreground truncate">invited by {m.created_by.slice(0, 8)}...</span>
              )}
            </div>
            <p className="font-mono text-xs text-muted-foreground truncate">{m.member_id.slice(0, 16)}...</p>
          </div>
          {m.role !== "owner" && (
            <button
              onClick={() => handleRevoke(m.member_id)}
              disabled={revoking === m.member_id}
              className="ml-3 shrink-0 px-2 py-1 text-xs rounded border border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {revoking === m.member_id ? "Revoking..." : "Revoke"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
