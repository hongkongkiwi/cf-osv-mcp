export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(
  source: Record<string, unknown>,
  key: string,
): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
