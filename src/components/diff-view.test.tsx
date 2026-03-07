// Tests for DiffView: table rendering, empty state, action buttons.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiffView from "./diff-view";
import type { DiffEntry } from "@/lib/diff-engine";

const mockEntries: DiffEntry[] = [
  { key: "DB_HOST", status: "changed", localMasked: "loc•••", remoteMasked: "rem•••" },
  { key: "API_KEY", status: "added", localMasked: "(not present)", remoteMasked: "sk-•••" },
  { key: "OLD_VAR", status: "deleted", localMasked: "val•••", remoteMasked: "(removed)" },
];

describe("DiffView", () => {
  it("renders empty state when no entries", () => {
    render(<DiffView entries={[]} onAcceptRemote={vi.fn()} onKeepLocal={vi.fn()} />);
    expect(screen.getByText("No differences found.")).toBeInTheDocument();
  });

  it("renders table with all diff entries", () => {
    render(<DiffView entries={mockEntries} onAcceptRemote={vi.fn()} onKeepLocal={vi.fn()} />);

    expect(screen.getByText("DB_HOST")).toBeInTheDocument();
    expect(screen.getByText("API_KEY")).toBeInTheDocument();
    expect(screen.getByText("OLD_VAR")).toBeInTheDocument();
  });

  it("renders status badges", () => {
    render(<DiffView entries={mockEntries} onAcceptRemote={vi.fn()} onKeepLocal={vi.fn()} />);

    expect(screen.getByText("CHANGED")).toBeInTheDocument();
    expect(screen.getByText("ADDED")).toBeInTheDocument();
    expect(screen.getByText("DELETED")).toBeInTheDocument();
  });

  it("renders masked values", () => {
    render(<DiffView entries={mockEntries} onAcceptRemote={vi.fn()} onKeepLocal={vi.fn()} />);

    expect(screen.getByText("(not present)")).toBeInTheDocument();
    expect(screen.getByText("(removed)")).toBeInTheDocument();
  });

  it("calls onAcceptRemote when Accept Remote clicked", async () => {
    const user = userEvent.setup();
    const onAcceptRemote = vi.fn();
    render(<DiffView entries={mockEntries} onAcceptRemote={onAcceptRemote} onKeepLocal={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Accept Remote" }));
    expect(onAcceptRemote).toHaveBeenCalledOnce();
  });

  it("calls onKeepLocal when Keep Local clicked", async () => {
    const user = userEvent.setup();
    const onKeepLocal = vi.fn();
    render(<DiffView entries={mockEntries} onAcceptRemote={vi.fn()} onKeepLocal={onKeepLocal} />);

    await user.click(screen.getByRole("button", { name: "Keep Local" }));
    expect(onKeepLocal).toHaveBeenCalledOnce();
  });

  it("renders header and description", () => {
    render(<DiffView entries={mockEntries} onAcceptRemote={vi.fn()} onKeepLocal={vi.fn()} />);

    expect(screen.getByText("Conflict: Variable-Level Diff")).toBeInTheDocument();
    expect(screen.getByText(/Both local and remote have changed/)).toBeInTheDocument();
  });
});
