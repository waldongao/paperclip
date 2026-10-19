import type { Resource } from "i18next";

import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages);

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = keyof typeof localeMessages;

/**
 * Endonyms — each language named in itself, which is what someone who cannot
 * read the current UI language needs in order to find their own.
 */
export const localeLabels: Record<string, string> = {
  ar: "العربية",
  bn: "বাংলা",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  es: "Español",
  fa: "فارسی",
  fi: "Suomi",
  fil: "Filipino",
  fr: "Français",
  he: "עברית",
  hi: "हिन्दी",
  hu: "Magyar",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  mr: "मराठी",
  ms: "Bahasa Melayu",
  nb: "Norsk bokmål",
  nl: "Nederlands",
  pa: "ਪੰਜਾਬੀ",
  pl: "Polski",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  ro: "Română",
  ru: "Русский",
  sv: "Svenska",
  sw: "Kiswahili",
  ta: "தமிழ்",
  te: "తెలుగు",
  th: "ไทย",
  tr: "Türkçe",
  uk: "Українська",
  ur: "اردو",
  vi: "Tiếng Việt",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

export function localeLabel(locale: string) {
  return localeLabels[locale] ?? locale;
}

function countLeaves(messages: unknown): number {
  if (typeof messages === "string") return 1;
  if (!messages || typeof messages !== "object") return 0;
  return Object.values(messages as Record<string, unknown>).reduce<number>(
    (total, value) => total + countLeaves(value),
    0,
  );
}

const englishLeafCount = countLeaves(localeMessages[DEFAULT_LOCALE]);

/**
 * Share of the English strings each locale actually translates. Locale files are
 * allowed to be partial (i18next falls back to English per key), so this is what
 * tells the UI which languages are complete enough to offer.
 */
export const localeCoverage: Record<string, number> = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [
    locale,
    englishLeafCount === 0 ? 1 : countLeaves(messages) / englishLeafCount,
  ]),
);

/**
 * Offering a locale that is 3% translated just shows an English UI under a
 * foreign name, so the switcher lists only locales past this bar. Locale files
 * that get filled in later appear on their own without a code change here.
 */
export const LOCALE_COVERAGE_THRESHOLD = 0.5;

export const selectableLocales = supportedLocales
  .filter((locale) => locale === DEFAULT_LOCALE || (localeCoverage[locale] ?? 0) >= LOCALE_COVERAGE_THRESHOLD)
  .sort((a, b) => localeLabel(a).localeCompare(localeLabel(b)));
