// Tests for ProjectStatusCard: status display, actions, null project state.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectStatusCard from "./project-status-card";

const mockProject = {
  slug: "my-app",
  path: "/Users/dev/my-app",
  last_sync_hash: "abc123",
  last_sync_at: "2026-03-06T12:00:00Z",
};

describe("ProjectStatusCard", () => {
  it("renders project name and path", () => {
    render(
      <ProjectStatusCard
        project={mockProject}
        fileCount={3}
        onPush={vi.fn()}
        onPull={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("my-app")).toBeInTheDocument();
    expect(screen.getByText("/Users/dev/my-app")).toBeInTheDocument();
  });

  it("shows 'In Sync' status when project has last_sync_hash", () => {
    render(
      <ProjectStatusCard
        project={mockProject}
        onPush={vi.fn()}
        onPull={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("In Sync")).toBeInTheDocument();
  });

  it("shows 'Out of Sync' when project has no last_sync_hash", () => {
    render(
      <ProjectStatusCard
        project={{ ...mockProject, last_sync_hash: null }}
        onPush={vi.fn()}
        onPull={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Out of Sync")).toBeInTheDocument();
  });

  it("shows 'Not Configured' when project is null", () => {
    render(
      <ProjectStatusCard
        project={null}
        onPush={vi.fn()}
        onPull={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("No project")).toBeInTheDocument();
    expect(screen.getByText("Not Configured")).toBeInTheDocument();
  });

  it("shows file count", () => {
    render(
      <ProjectStatusCard
        project={mockProject}
        fileCount={5}
        onPush={vi.fn()}
        onPull={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("5 .env files")).toBeInTheDocument();
  });

  it("disables Push and Pull when project is null", () => {
    render(
      <ProjectStatusCard
        project={null}
        onPush={vi.fn()}
        onPull={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Push" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pull" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Settings" })).not.toBeDisabled();
  });

  it("calls action callbacks on click", async () => {
    const user = userEvent.setup();
    const onPush = vi.fn();
    const onPull = vi.fn();
    const onSettings = vi.fn();

    render(
      <ProjectStatusCard
        project={mockProject}
        onPush={onPush}
        onPull={onPull}
        onSettings={onSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Push" }));
    expect(onPush).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Pull" }));
    expect(onPull).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onSettings).toHaveBeenCalledOnce();
  });
});
