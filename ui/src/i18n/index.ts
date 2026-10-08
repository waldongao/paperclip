import i18n, { type InitOptions, type TOptions } from "i18next";
import { useCallback, useSyncExternalStore } from "react";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, selectableLocales, supportedLocales } from "./locales";
import { applyDocumentLocale, resolveInitialLocale, storeLocale } from "./locale-preference";

const initialLocale = resolveInitialLocale(supportedLocales, DEFAULT_LOCALE);

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

applyDocumentLocale(initialLocale);

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

function currentLocale() {
  return i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE;
}

/**
 * Switch the active language and remember the choice. Persisting here rather
 * than in the component means any caller — switcher, deep link, tests — leaves
 * the session in the same state.
 *
 * Confirm the reload before changing the preference so callers can cancel and
 * save any pending edits. Several hundred strings live in module-level
 * constants (select options, status filters, column definitions) that call `t()`
 * once at import time; without a reload those would keep the language the tab
 * started in and the UI would come out half-translated. Reloading re-evaluates
 * them against the stored choice, so every surface agrees. First load still
 * detects the browser language with no reload.
 */
export function setLocale(locale: string): boolean {
  if (!supportedLocales.includes(locale)) {
    console.warn(`Ignoring unsupported locale: ${locale}`);
    return false;
  }
  if (locale === currentLocale()) return true;

  if (typeof window !== "undefined" && !window.confirm(t("settings.language.confirmReload"))) {
    return false;
  }

  storeLocale(locale);
  applyDocumentLocale(locale);

  if (typeof window !== "undefined") {
    window.location.reload();
    return true;
  }

  void i18n.changeLanguage(locale).catch((error: unknown) => {
    console.error("Failed to change language", error);
  });
  return true;
}

function subscribeToLocale(onChange: () => void) {
  i18n.on("languageChanged", onChange);
  return () => {
    i18n.off("languageChanged", onChange);
  };
}

export function useLocale() {
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, () => DEFAULT_LOCALE);
  return {
    locale,
    setLocale: useCallback((next: string) => setLocale(next), []),
    availableLocales: selectableLocales,
  };
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
