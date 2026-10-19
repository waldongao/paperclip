export const LOCALE_STORAGE_KEY = "paperclip.locale";

/**
 * Locales whose script runs right-to-left. Used to set `<html dir>` so the
 * shell mirrors rather than leaving RTL text in an LTR layout.
 */
const RTL_LOCALES = new Set(["ar", "fa", "he", "ur"]);

/**
 * Region and script subtags that do not name a locale file of their own but map
 * cleanly onto one. Chinese is the case that matters most: browsers report a
 * spread of `zh-*` tags and every one of them should land on Simplified or
 * Traditional rather than falling through to English.
 */
const REGION_ALIASES: Record<string, string> = {
  "zh-hans": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-my": "zh-CN",
  "zh-hant": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
  "pt-pt": "pt-PT",
  "pt-br": "pt-BR",
};

/**
 * Base language → locale file, for languages whose only files carry a region
 * suffix. Without this a browser reporting bare `zh` matches nothing.
 */
const BASE_LANGUAGE_DEFAULTS: Record<string, string> = {
  zh: "zh-CN",
  pt: "pt-BR",
};

function stripScriptSubtag(tag: string) {
  // `zh-Hans-CN` → `zh-CN`: drop the 4-letter script so region matching can run.
  const parts = tag.split("-");
  if (parts.length < 3 || parts[1]?.length !== 4) return tag;
  return [parts[0], ...parts.slice(2)].join("-");
}

function matchSupported(tag: string, supported: readonly string[]): string | null {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return null;

  const exact = supported.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;

  const aliased = REGION_ALIASES[normalized];
  if (aliased && supported.includes(aliased)) return aliased;

  const withoutScript = stripScriptSubtag(normalized);
  if (withoutScript !== normalized) {
    const scriptMatch = matchSupported(withoutScript, supported);
    if (scriptMatch) return scriptMatch;
  }

  const base = normalized.split("-")[0] ?? "";
  if (!base) return null;

  const baseDefault = BASE_LANGUAGE_DEFAULTS[base];
  if (baseDefault && supported.includes(baseDefault)) return baseDefault;

  const baseExact = supported.find((locale) => locale.toLowerCase() === base);
  if (baseExact) return baseExact;

  // Last resort: any regional variant of the same language, in the stable order
  // the locale files were discovered in.
  return supported.find((locale) => locale.toLowerCase().startsWith(`${base}-`)) ?? null;
}

/**
 * Resolve the best supported locale for a list of requested tags, most-preferred
 * first. Returns `null` when nothing matches, so callers can distinguish "the
 * browser asked for something we don't have" from "the browser asked for English".
 */
export function negotiateLocale(requested: readonly string[], supported: readonly string[]): string | null {
  for (const tag of requested) {
    const match = matchSupported(tag, supported);
    if (match) return match;
  }
  return null;
}

export function readStoredLocale(supported: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!stored) return null;
    return supported.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore local storage write failures in restricted environments.
  }
}

export function clearStoredLocale() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // Ignore local storage write failures in restricted environments.
  }
}

function navigatorLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  const { languages, language } = navigator;
  if (Array.isArray(languages) && languages.length > 0) return [...languages];
  return language ? [language] : [];
}

/**
 * The locale to start the session in: an explicit stored choice wins, otherwise
 * the browser's accept-languages, otherwise the default.
 */
export function resolveInitialLocale(supported: readonly string[], defaultLocale: string): string {
  const stored = readStoredLocale(supported);
  if (stored) return stored;
  return negotiateLocale(navigatorLanguages(), supported) ?? defaultLocale;
}

export function isRtlLocale(locale: string) {
  return RTL_LOCALES.has(locale.split("-")[0]?.toLowerCase() ?? "");
}

/** Keep `<html lang>` / `<html dir>` in step with the active locale. */
export function applyDocumentLocale(locale: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("lang", locale);
  root.setAttribute("dir", isRtlLocale(locale) ? "rtl" : "ltr");
}
