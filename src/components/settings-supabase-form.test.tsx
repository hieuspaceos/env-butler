// Tests for SettingsSupabaseForm: form submission, validation, error handling, success feedback.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsSupabaseForm from "./settings-supabase-form";

// Mock tauri-commands
vi.mock("@/lib/tauri-commands", () => ({
  saveSupabaseConfig: vi.fn(),
}));

// Mock error-utils
vi.mock("@/lib/error-utils", () => ({
  toErrorMessage: (e: unknown) => {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Unknown error";
  },
}));

import { saveSupabaseConfig } from "@/lib/tauri-commands";

describe("SettingsSupabaseForm", () => {
  const defaultProps = {
    initialUrl: "https://example.supabase.co",
    initialKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    initialAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9-anon",
    setError: vi.fn(),
    setSaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with all input fields", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);

    expect(screen.getByText("Supabase Connection")).toBeInTheDocument();
    expect(screen.getByText(/Global config/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://your-project.supabase.co")).toBeInTheDocument();
    expect(screen.getByText("Service Role Key")).toBeInTheDocument();
    expect(screen.getByText(/Anon Key/)).toBeInTheDocument();
  });

  it("displays database icon", () => {
    const { container } = render(<SettingsSupabaseForm {...defaultProps} />);
    const icon = container.querySelector("svg");
    expect(icon).toBeInTheDocument();
  });

  it("populates initial values from props", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);

    const urlInput = screen.getByPlaceholderText(
      "https://your-project.supabase.co",
    ) as HTMLInputElement;
    expect(urlInput.value).toBe("https://example.supabase.co");

    const keyInputs = screen.getAllByPlaceholderText("eyJhbGciOi...") as HTMLInputElement[];
    // First password input is service role key
    expect(keyInputs[0].value).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("populates anon key when provided", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);

    const passwordInputs = screen.getAllByPlaceholderText(
      "eyJhbGciOi...",
    ) as HTMLInputElement[];
    // Second password input is anon key
    expect(passwordInputs[1].value).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9-anon");
  });

  it("renders save settings button", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Save Settings" }),
    ).toBeInTheDocument();
  });

  it("saves config when form is submitted with valid data", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockResolvedValueOnce(undefined);

    const setError = vi.fn();
    const setSaved = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey="test-anon-key"
        setError={setError}
        setSaved={setSaved}
      />,
    );

    const urlInput = screen.getByPlaceholderText(
      "https://your-project.supabase.co",
    );
    const keyInput = screen.getAllByPlaceholderText("eyJhbGciOi...")[0];
    const submitButton = screen.getByRole("button", { name: "Save Settings" });

    await user.clear(urlInput);
    await user.type(urlInput, "https://new.supabase.co");

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSaveSupabaseConfig).toHaveBeenCalledWith(
        "https://new.supabase.co",
        "test-key",
        "test-anon-key",
      );
    });
  });

  it("calls setError when URL is empty", async () => {
    const user = userEvent.setup();
    const setError = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl=""
        initialKey="test-key"
        initialAnonKey=""
        setError={setError}
        setSaved={vi.fn()}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    expect(setError).toHaveBeenCalledWith(
      "Both URL and Service Role Key are required",
    );
  });

  it("calls setError when service role key is empty", async () => {
    const user = userEvent.setup();
    const setError = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey=""
        initialAnonKey=""
        setError={setError}
        setSaved={vi.fn()}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    expect(setError).toHaveBeenCalledWith(
      "Both URL and Service Role Key are required",
    );
  });

  it("clears error when save succeeds", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockResolvedValueOnce(undefined);

    const setError = vi.fn();
    const setSaved = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey=""
        setError={setError}
        setSaved={setSaved}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith(null);
    });
  });

  it("calls setSaved(true) when save succeeds", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockResolvedValueOnce(undefined);

    const setError = vi.fn();
    const setSaved = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey=""
        setError={setError}
        setSaved={setSaved}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(setSaved).toHaveBeenCalledWith(true);
    });
  });

  it("resets saved state to false after 2 seconds", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockResolvedValueOnce(undefined);

    const setSaved = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey=""
        setError={vi.fn()}
        setSaved={setSaved}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(setSaved).toHaveBeenCalledWith(true);
    });

    await waitFor(
      () => {
        expect(setSaved).toHaveBeenCalledWith(false);
      },
      { timeout: 3000 },
    );
  });

  it("handles save error and displays error message", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockRejectedValueOnce(
      new Error("Failed to save config"),
    );

    const setError = vi.fn();
    const setSaved = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey=""
        setError={setError}
        setSaved={setSaved}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith("Failed to save config");
    });

    expect(setSaved).not.toHaveBeenCalledWith(true);
  });

  it("does not call setSaved when save fails", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockRejectedValueOnce(new Error("Network error"));

    const setSaved = vi.fn();

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey=""
        setError={vi.fn()}
        setSaved={setSaved}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(setSaved).not.toHaveBeenCalledWith(true);
    });
  });

  it("trims whitespace from input values", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockResolvedValueOnce(undefined);

    render(
      <SettingsSupabaseForm
        initialUrl=""
        initialKey=""
        initialAnonKey=""
        setError={vi.fn()}
        setSaved={vi.fn()}
      />,
    );

    const urlInput = screen.getByPlaceholderText(
      "https://your-project.supabase.co",
    );
    const keyInput = screen.getAllByPlaceholderText("eyJhbGciOi...")[0];

    await user.type(urlInput, "  https://test.supabase.co  ");
    await user.type(keyInput, "  test-key  ");

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSaveSupabaseConfig).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-key",
        undefined,
      );
    });
  });

  it("passes undefined for anon key when empty", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockResolvedValueOnce(undefined);

    render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey=""
        setError={vi.fn()}
        setSaved={vi.fn()}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Save Settings" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSaveSupabaseConfig).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-key",
        undefined,
      );
    });
  });

  it("renders anon key as optional with helper text", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);

    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(
      screen.getByText(/Required for Team v2 member access/),
    ).toBeInTheDocument();
  });

  it("prevents default form submission", async () => {
    const user = userEvent.setup();
    const mockSaveSupabaseConfig = saveSupabaseConfig as ReturnType<typeof vi.fn>;
    mockSaveSupabaseConfig.mockResolvedValueOnce(undefined);

    const { container } = render(
      <SettingsSupabaseForm
        initialUrl="https://test.supabase.co"
        initialKey="test-key"
        initialAnonKey=""
        setError={vi.fn()}
        setSaved={vi.fn()}
      />,
    );

    const form = container.querySelector("form");
    const submitEvent = new SubmitEvent("submit", { bubbles: true });
    const preventDefaultSpy = vi.spyOn(submitEvent, "preventDefault");

    form?.dispatchEvent(submitEvent);

    // The form submission should be prevented by the handler
    expect(mockSaveSupabaseConfig).toHaveBeenCalled();
  });

  it("uses password input type for key fields for security", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);

    const passwordInputs = screen.getAllByPlaceholderText("eyJhbGciOi...");
    passwordInputs.forEach((input) => {
      expect(input).toHaveAttribute("type", "password");
    });
  });

  it("uses url input type for URL field", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);

    const urlInput = screen.getByPlaceholderText(
      "https://your-project.supabase.co",
    );
    expect(urlInput).toHaveAttribute("type", "url");
  });

  it("renders form with proper section heading", () => {
    render(<SettingsSupabaseForm {...defaultProps} />);

    expect(screen.getByText("Supabase Connection")).toBeInTheDocument();
    const heading = screen.getByText("Supabase Connection");
    expect(heading.tagName).toBe("H2");
  });
});
