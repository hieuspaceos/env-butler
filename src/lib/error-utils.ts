// Extract readable message from Tauri invoke errors (which may be objects, not strings)
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e == null) return "An unknown error occurred";
  return JSON.stringify(e);
}
