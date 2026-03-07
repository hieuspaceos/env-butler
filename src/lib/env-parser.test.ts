// Tests for env-parser: .env content parsing and value masking.

import { describe, it, expect } from "vitest";
import { parseEnvContent, entriesToMap, maskValue } from "./env-parser";

describe("parseEnvContent", () => {
  it("parses simple key=value pairs", () => {
    const content = "DB_HOST=localhost\nDB_PORT=5432";
    const entries = parseEnvContent(content);
    expect(entries).toEqual([
      { key: "DB_HOST", value: "localhost" },
      { key: "DB_PORT", value: "5432" },
    ]);
  });

  it("skips comments and empty lines", () => {
    const content = "# Comment\n\nAPI_KEY=secret\n  # Another comment\nDEBUG=true";
    const entries = parseEnvContent(content);
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toBe("API_KEY");
    expect(entries[1].key).toBe("DEBUG");
  });

  it("handles values with equals signs", () => {
    const content = "CONNECTION=postgres://user:pass@host:5432/db?sslmode=require";
    const entries = parseEnvContent(content);
    expect(entries[0].value).toBe("postgres://user:pass@host:5432/db?sslmode=require");
  });

  it("handles empty values", () => {
    const content = "EMPTY_VAR=";
    const entries = parseEnvContent(content);
    expect(entries[0]).toEqual({ key: "EMPTY_VAR", value: "" });
  });

  it("skips lines without equals sign", () => {
    const content = "VALID=yes\nINVALID_LINE\nALSO_VALID=true";
    const entries = parseEnvContent(content);
    expect(entries).toHaveLength(2);
  });

  it("trims whitespace around keys and values", () => {
    const content = "  KEY  =  value  ";
    const entries = parseEnvContent(content);
    expect(entries[0]).toEqual({ key: "KEY", value: "value" });
  });

  it("returns empty array for empty content", () => {
    expect(parseEnvContent("")).toEqual([]);
    expect(parseEnvContent("\n\n\n")).toEqual([]);
  });
});

describe("entriesToMap", () => {
  it("converts entries array to lookup map", () => {
    const entries = [
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ];
    expect(entriesToMap(entries)).toEqual({ A: "1", B: "2" });
  });

  it("last entry wins for duplicate keys", () => {
    const entries = [
      { key: "KEY", value: "first" },
      { key: "KEY", value: "second" },
    ];
    expect(entriesToMap(entries)).toEqual({ KEY: "second" });
  });

  it("returns empty object for empty array", () => {
    expect(entriesToMap([])).toEqual({});
  });
});

describe("maskValue", () => {
  it("fully masks short values (<=8 chars)", () => {
    expect(maskValue("secret")).toBe("••••••••");
    expect(maskValue("12345678")).toBe("••••••••");
  });

  it("shows first 4 and last 4 chars for long values", () => {
    expect(maskValue("super-secret-key-value")).toBe("supe...alue");
  });

  it("masks empty string", () => {
    expect(maskValue("")).toBe("••••••••");
  });
});
