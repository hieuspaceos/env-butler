// Parse .env file content into key-value pairs and mask sensitive values.

export interface EnvEntry {
  key: string;
  value: string;
}

/** Parse .env content into key-value entries. Skips comments and empty lines. */
export function parseEnvContent(content: string): EnvEntry[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) return null;
      return {
        key: line.slice(0, eqIndex).trim(),
        value: line.slice(eqIndex + 1).trim(),
      };
    })
    .filter((entry): entry is EnvEntry => entry !== null);
}

/** Convert entries to a lookup map. */
export function entriesToMap(entries: EnvEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { key, value } of entries) {
    map[key] = value;
  }
  return map;
}

/** Mask a value for safe display. Shows first 4 + last 4 chars for values > 8 chars. */
export function maskValue(value: string): string {
  if (value.length <= 8) return "\u2022".repeat(8);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
