// Tests for diff-engine: variable-level diff between local and remote env maps.

import { describe, it, expect } from "vitest";
import { computeDiff } from "./diff-engine";

describe("computeDiff", () => {
  it("detects added keys (remote only)", () => {
    const local = { A: "1" };
    const remote = { A: "1", B: "2" };
    const diff = computeDiff(local, remote);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ key: "B", status: "added" });
  });

  it("detects deleted keys (local only)", () => {
    const local = { A: "1", B: "2" };
    const remote = { A: "1" };
    const diff = computeDiff(local, remote);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ key: "B", status: "deleted" });
  });

  it("detects changed values", () => {
    const local = { API_KEY: "old-value-12345" };
    const remote = { API_KEY: "new-value-67890" };
    const diff = computeDiff(local, remote);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ key: "API_KEY", status: "changed" });
  });

  it("excludes unchanged by default", () => {
    const local = { A: "same", B: "different" };
    const remote = { A: "same", B: "changed" };
    const diff = computeDiff(local, remote);
    expect(diff).toHaveLength(1);
    expect(diff[0].key).toBe("B");
  });

  it("includes unchanged when flag set", () => {
    const local = { A: "same", B: "different" };
    const remote = { A: "same", B: "changed" };
    const diff = computeDiff(local, remote, true);
    expect(diff).toHaveLength(2);
    expect(diff.find((d) => d.key === "A")?.status).toBe("unchanged");
  });

  it("sorts: deleted → changed → added → unchanged", () => {
    const local = { DEL: "x", CHG: "old", SAME: "s" };
    const remote = { CHG: "new", SAME: "s", ADD: "y" };
    const diff = computeDiff(local, remote, true);
    const statuses = diff.map((d) => d.status);
    expect(statuses).toEqual(["deleted", "changed", "added", "unchanged"]);
  });

  it("returns empty diff for identical maps", () => {
    const data = { A: "1", B: "2" };
    expect(computeDiff(data, data)).toEqual([]);
  });

  it("handles both empty maps", () => {
    expect(computeDiff({}, {})).toEqual([]);
  });

  it("masks values in output", () => {
    const local = { KEY: "super-long-secret-value" };
    const remote = { KEY: "another-long-secret-val" };
    const diff = computeDiff(local, remote);
    // Should show first 4 + last 4, not full value
    expect(diff[0].localMasked).not.toContain("secret");
    expect(diff[0].remoteMasked).not.toContain("secret");
  });
});
