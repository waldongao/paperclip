import { tCli } from "../i18n.js";
export function normalizeHostnameInput(raw: string): string {
  const input = raw.trim();
  if (!input) {
    throw new Error(tCli("Hostname is required"));
  }

  try {
    const url = input.includes("://") ? new URL(input) : new URL(`http://${input}`);
    const hostname = url.hostname.trim().toLowerCase();
    if (!hostname) throw new Error(tCli("Hostname is required"));
    return hostname;
  } catch {
    throw new Error(tCli("Invalid hostname: {{raw}}", { raw: String(raw) }));
  }
}

export function parseHostnameCsv(raw: string): string[] {
  if (!raw.trim()) return [];
  const unique = new Set<string>();
  for (const part of raw.split(",")) {
    const hostname = normalizeHostnameInput(part);
    unique.add(hostname);
  }
  return Array.from(unique);
}

