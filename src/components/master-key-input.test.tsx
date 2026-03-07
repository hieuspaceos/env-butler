// Tests for MasterKeyInput: form submission, input clearing, disabled state.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MasterKeyInput from "./master-key-input";

describe("MasterKeyInput", () => {
  it("renders with default props", () => {
    render(<MasterKeyInput onSubmit={vi.fn()} />);
    expect(screen.getByText("Master Key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your Master Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("renders with custom label and button text", () => {
    render(<MasterKeyInput onSubmit={vi.fn()} label="Password" submitText="Unlock" />);
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
  });

  it("calls onSubmit with input value and clears input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MasterKeyInput onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("Enter your Master Key");
    await user.type(input, "my-secret-key");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onSubmit).toHaveBeenCalledWith("my-secret-key");
    expect(input).toHaveValue("");
  });

  it("does not call onSubmit when input is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MasterKeyInput onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables input and button when disabled prop is true", () => {
    render(<MasterKeyInput onSubmit={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText("Enter your Master Key")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("uses password input type for security", () => {
    render(<MasterKeyInput onSubmit={vi.fn()} />);
    const input = screen.getByPlaceholderText("Enter your Master Key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
  });
});
