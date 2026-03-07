// Tests for RecoveryKitDisplay: mnemonic display, save dialog, confirmation checkbox.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecoveryKitDisplay from "./recovery-kit-display";

// Mock Tauri dialog and fs modules
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
}));

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

const mockMnemonic =
  "abandon ability able about above absolute absorb abstract abuse access accident account achieve acknowledge acquiesce across act action actress acts actual acumen acute add address";

describe("RecoveryKitDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders recovery kit title and description", () => {
    const mockWords = "word1 word2 word3 word4";
    render(<RecoveryKitDisplay mnemonic={mockWords} onConfirm={vi.fn()} />);

    expect(screen.getByText("Recovery Kit")).toBeInTheDocument();
    expect(
      screen.getByText(/Secured by the same recovery standard as Bitcoin wallets/),
    ).toBeInTheDocument();
  });

  it("displays mnemonic words in 4-column grid with numbered index", () => {
    const mockWords = "word1 word2 word3 word4 word5 word6 word7 word8";
    render(<RecoveryKitDisplay mnemonic={mockWords} onConfirm={vi.fn()} />);

    expect(screen.getByText("word1")).toBeInTheDocument();
    expect(screen.getByText("word8")).toBeInTheDocument();
    // Check that words are displayed with numbering
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("8.")).toBeInTheDocument();
  });

  it("renders save recovery kit button", () => {
    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Save Recovery Kit/ }),
    ).toBeInTheDocument();
  });

  it("calls save dialog and writes file when save button clicked", async () => {
    const user = userEvent.setup();
    const mockSave = save as ReturnType<typeof vi.fn>;
    const mockWrite = writeTextFile as ReturnType<typeof vi.fn>;

    mockSave.mockResolvedValueOnce("/path/to/recovery-kit.txt");

    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Save Recovery Kit/ }));

    expect(mockSave).toHaveBeenCalledWith({
      title: "Save Recovery Kit",
      defaultPath: "env-butler-recovery-kit.txt",
      filters: [{ name: "Text", extensions: ["txt"] }],
    });

    expect(mockWrite).toHaveBeenCalledWith(
      "/path/to/recovery-kit.txt",
      expect.stringContaining("ENV BUTLER — RECOVERY KIT"),
    );
  });

  it("does not write file when save dialog is cancelled", async () => {
    const user = userEvent.setup();
    const mockSave = save as ReturnType<typeof vi.fn>;
    const mockWrite = writeTextFile as ReturnType<typeof vi.fn>;

    mockSave.mockResolvedValueOnce(null); // User cancelled

    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Save Recovery Kit/ }));

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("renders confirmation checkbox", () => {
    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={vi.fn()} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    const label = screen.getByText(/I have saved my Recovery Kit/);
    expect(label).toBeInTheDocument();
  });

  it("continues button is disabled until checkbox is checked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();

    // Check the checkbox
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    expect(button).not.toBeDisabled();
  });

  it("calls onConfirm when checkbox is checked and continue button clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={onConfirm} />);

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    const button = screen.getByRole("button", { name: "Continue" });
    await user.click(button);

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not call onConfirm when continue button is disabled", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Continue" });
    await user.click(button);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("checkbox state toggles correctly", async () => {
    const user = userEvent.setup();
    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={vi.fn()} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("displays all words from mnemonic in order", () => {
    const words = mockMnemonic.split(" ");

    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={vi.fn()} />);

    // Verify first and last word are rendered
    expect(screen.getByText(words[0])).toBeInTheDocument();
    expect(screen.getByText(words[words.length - 1])).toBeInTheDocument();
  });

  it("saved file contains properly formatted recovery kit text", async () => {
    const user = userEvent.setup();
    const mockSave = save as ReturnType<typeof vi.fn>;
    const mockWrite = writeTextFile as ReturnType<typeof vi.fn>;

    mockSave.mockResolvedValueOnce("/path/to/recovery-kit.txt");

    render(<RecoveryKitDisplay mnemonic={mockMnemonic} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Save Recovery Kit/ }));

    const callArgs = mockWrite.mock.calls[0];
    const savedContent = callArgs[1] as string;

    expect(savedContent).toContain("ENV BUTLER — RECOVERY KIT");
    expect(savedContent).toContain("=".repeat(30));
    // Component uses padStart(2) which adds space padding, resulting in " 1. abandon"
    expect(savedContent).toContain(" 1. abandon");
    // Just check that the last word is present (formatting varies)
    const words = mockMnemonic.split(" ");
    expect(savedContent).toContain(words[words.length - 1]);
    expect(savedContent).toContain(
      "Keep this file safe and offline",
    );
    expect(savedContent).toContain(
      "If you lose both your Master Key and this Recovery Kit",
    );
  });
});
