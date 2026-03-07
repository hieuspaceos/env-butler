// Tests for error-utils: toErrorMessage extraction from various error types.

import { describe, it, expect } from "vitest";
import { toErrorMessage } from "./error-utils";

describe("toErrorMessage", () => {
  it("extracts message from Error instance", () => {
    expect(toErrorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("returns string errors as-is", () => {
    expect(toErrorMessage("plain string error")).toBe("plain string error");
  });

  it("JSON-serializes object errors (Tauri invoke pattern)", () => {
    const tauriError = { code: "NOT_FOUND", message: "project not found" };
    expect(toErrorMessage(tauriError)).toBe(JSON.stringify(tauriError));
  });

  it("handles null and undefined", () => {
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe(undefined); // JSON.stringify(undefined) returns undefined
  });

  it("handles number errors", () => {
    expect(toErrorMessage(42)).toBe("42");
  });
});
