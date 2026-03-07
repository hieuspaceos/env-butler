// Tests for UpdateChecker: version check, install flow, dismiss banner, error handling.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UpdateChecker from "./update-checker";

// Mock Tauri modules
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// Mock error utils
vi.mock("@/lib/error-utils", () => ({
  toErrorMessage: (e: unknown) => {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Unknown error";
  },
}));

describe("UpdateChecker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null when no update available", async () => {
    const mockCheck = check as ReturnType<typeof vi.fn>;
    mockCheck.mockResolvedValueOnce(null);

    const { container } = render(<UpdateChecker />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders banner with version when update available", async () => {
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: vi.fn(),
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText(/v0.6.0 available/)).toBeInTheDocument();
    });
  });

  it("renders update button and dismiss button", async () => {
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: vi.fn(),
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "" }).querySelector("svg"),
      ).toBeInTheDocument(); // Dismiss button with X icon
    });
  });

  it("hides banner when dismiss button clicked", async () => {
    const user = userEvent.setup();
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: vi.fn(),
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    const { container } = render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText(/v0.6.0 available/)).toBeInTheDocument();
    });

    const dismissButton = screen.getAllByRole("button").find((btn) => {
      return btn.querySelector("svg") && !btn.textContent?.includes("Update");
    });

    if (dismissButton) {
      await user.click(dismissButton);
    }

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("downloads and installs update when update button clicked", async () => {
    const user = userEvent.setup();
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockDownloadAndInstall = vi.fn().mockResolvedValueOnce(undefined);
    const mockRelaunchFn = relaunch as ReturnType<typeof vi.fn>;
    mockRelaunchFn.mockResolvedValueOnce(undefined);

    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: mockDownloadAndInstall,
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText(/v0.6.0 available/)).toBeInTheDocument();
    });

    const updateButton = screen.getByRole("button", { name: "Update" });
    await user.click(updateButton);

    await waitFor(() => {
      expect(mockDownloadAndInstall).toHaveBeenCalled();
    });

    expect(mockRelaunchFn).toHaveBeenCalled();
  });

  it("disables update button during install", async () => {
    const user = userEvent.setup();
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockDownloadAndInstall = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const mockRelaunchFn = relaunch as ReturnType<typeof vi.fn>;
    mockRelaunchFn.mockResolvedValueOnce(undefined);

    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: mockDownloadAndInstall,
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText(/v0.6.0 available/)).toBeInTheDocument();
    });

    const updateButton = screen.getByRole("button", { name: "Update" });
    await user.click(updateButton);

    expect(updateButton).toBeDisabled();
  });

  it("shows loading spinner during install", async () => {
    const user = userEvent.setup();
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockDownloadAndInstall = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const mockRelaunchFn = relaunch as ReturnType<typeof vi.fn>;
    mockRelaunchFn.mockResolvedValueOnce(undefined);

    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: mockDownloadAndInstall,
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText(/v0.6.0 available/)).toBeInTheDocument();
    });

    const updateButton = screen.getByRole("button", { name: "Update" });
    await user.click(updateButton);

    // Check if spinner is visible (it's in the button)
    await waitFor(() => {
      const spinner = updateButton.querySelector("svg");
      expect(spinner).toBeInTheDocument();
      expect(spinner?.className.baseVal).toContain("animate-spin");
    });
  });

  it("handles download error and displays error message", async () => {
    const user = userEvent.setup();
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockDownloadAndInstall = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"));
    const mockRelaunchFn = relaunch as ReturnType<typeof vi.fn>;

    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: mockDownloadAndInstall,
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText(/v0.6.0 available/)).toBeInTheDocument();
    });

    const updateButton = screen.getByRole("button", { name: "Update" });
    await user.click(updateButton);

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });

    expect(mockRelaunchFn).not.toHaveBeenCalled();
  });

  it("button is re-enabled after error", async () => {
    const user = userEvent.setup();
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockDownloadAndInstall = vi
      .fn()
      .mockRejectedValueOnce(new Error("Download failed"));
    const mockRelaunchFn = relaunch as ReturnType<typeof vi.fn>;

    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: mockDownloadAndInstall,
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText(/v0.6.0 available/)).toBeInTheDocument();
    });

    const updateButton = screen.getByRole("button", { name: "Update" });
    await user.click(updateButton);

    await waitFor(() => {
      expect(updateButton).not.toBeDisabled();
    });
  });

  it("silently handles check error on mount", async () => {
    const mockCheck = check as ReturnType<typeof vi.fn>;
    mockCheck.mockRejectedValueOnce(new Error("Check failed"));

    const { container } = render(<UpdateChecker />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("runs check only once on mount", async () => {
    const mockCheck = check as ReturnType<typeof vi.fn>;
    mockCheck.mockResolvedValueOnce(null);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalledTimes(1);
    });
  });

  it("displays blue-themed banner styling", async () => {
    const mockCheck = check as ReturnType<typeof vi.fn>;
    const mockUpdate = {
      version: "0.6.0",
      downloadAndInstall: vi.fn(),
    };
    mockCheck.mockResolvedValueOnce(mockUpdate);

    const { container } = render(<UpdateChecker />);

    await waitFor(() => {
      const banner = container.querySelector(".bg-blue-500\\/10");
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveClass("border-blue-500/20");
    });
  });
});
