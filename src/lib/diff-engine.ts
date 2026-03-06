// Compute variable-level diff between local and remote .env key-value maps.

import { maskValue } from "./env-parser";

export type DiffStatus = "added" | "changed" | "deleted" | "unchanged";

export interface DiffEntry {
  key: string;
  status: DiffStatus;
  localMasked: string;
  remoteMasked: string;
}

/** Compute diff between local and remote KV maps. Returns only changed entries by default. */
export function computeDiff(
  local: Record<string, string>,
  remote: Record<string, string>,
  includeUnchanged = false,
): DiffEntry[] {
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const entries: DiffEntry[] = [];

  for (const key of allKeys) {
    const inLocal = key in local;
    const inRemote = key in remote;

    if (inLocal && inRemote) {
      const status = local[key] === remote[key] ? "unchanged" : "changed";
      if (status === "unchanged" && !includeUnchanged) continue;
      entries.push({
        key,
        status,
        localMasked: maskValue(local[key]),
        remoteMasked: maskValue(remote[key]),
      });
    } else if (inRemote && !inLocal) {
      entries.push({
        key,
        status: "added",
        localMasked: "(not present)",
        remoteMasked: maskValue(remote[key]),
      });
    } else {
      entries.push({
        key,
        status: "deleted",
        localMasked: maskValue(local[key]),
        remoteMasked: "(removed)",
      });
    }
  }

  // Sort: deleted first, then changed, then added
  const order: Record<DiffStatus, number> = { deleted: 0, changed: 1, added: 2, unchanged: 3 };
  entries.sort((a, b) => order[a.status] - order[b.status]);

  return entries;
}
