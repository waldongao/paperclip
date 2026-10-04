// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LOCALE_STORAGE_KEY,
  applyDocumentLocale,
  clearStoredLocale,
  isRtlLocale,
  negotiateLocale,
  readStoredLocale,
  resolveInitialLocale,
  storeLocale,
} from "./locale-preference";

const SUPPORTED = ["en", "de", "fr", "ja", "pt-BR", "pt-PT", "zh-CN", "zh-TW", "ar"];

afterEach(() => {
  clearStoredLocale();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

describe("negotiateLocale", () => {
  it("prefers an exact match", () => {
    expect(negotiateLocale(["zh-TW"], SUPPORTED)).toBe("zh-TW");
    expect(negotiateLocale(["de"], SUPPORTED)).toBe("de");
  });

  it("matches case-insensitively", () => {
    expect(negotiateLocale(["ZH-cn"], SUPPORTED)).toBe("zh-CN");
  });

  it("maps a bare language onto its default regional file", () => {
    expect(negotiateLocale(["zh"], SUPPORTED)).toBe("zh-CN");
    expect(negotiateLocale(["pt"], SUPPORTED)).toBe("pt-BR");
  });

  it("routes Chinese script and region tags to the right variant", () => {
    expect(negotiateLocale(["zh-Hans"], SUPPORTED)).toBe("zh-CN");
    expect(negotiateLocale(["zh-Hans-CN"], SUPPORTED)).toBe("zh-CN");
    expect(negotiateLocale(["zh-SG"], SUPPORTED)).toBe("zh-CN");
    expect(negotiateLocale(["zh-Hant"], SUPPORTED)).toBe("zh-TW");
    expect(negotiateLocale(["zh-Hant-HK"], SUPPORTED)).toBe("zh-TW");
    expect(negotiateLocale(["zh-HK"], SUPPORTED)).toBe("zh-TW");
    expect(negotiateLocale(["zh-MO"], SUPPORTED)).toBe("zh-TW");
  });

  it("falls back from an unknown region to the base language", () => {
    expect(negotiateLocale(["en-GB"], SUPPORTED)).toBe("en");
    expect(negotiateLocale(["de-AT"], SUPPORTED)).toBe("de");
  });

  it("honours the order the browser asked for", () => {
    expect(negotiateLocale(["xx", "zh-CN", "fr"], SUPPORTED)).toBe("zh-CN");
  });

  it("returns null when nothing matches", () => {
    expect(negotiateLocale(["xx", "yy-ZZ"], SUPPORTED)).toBeNull();
    expect(negotiateLocale([], SUPPORTED)).toBeNull();
  });
});

describe("stored preference", () => {
  it("round-trips a supported locale", () => {
    storeLocale("zh-CN");
    expect(readStoredLocale(SUPPORTED)).toBe("zh-CN");
  });

  it("ignores a stored locale that is no longer supported", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "kl-GL");
    expect(readStoredLocale(SUPPORTED)).toBeNull();
  });
});

describe("resolveInitialLocale", () => {
  it("prefers an explicit stored choice over the browser languages", () => {
    vi.stubGlobal("navigator", { languages: ["fr-FR"], language: "fr-FR" });
    storeLocale("zh-CN");
    expect(resolveInitialLocale(SUPPORTED, "en")).toBe("zh-CN");
  });

  it("negotiates from the browser languages when nothing is stored", () => {
    vi.stubGlobal("navigator", { languages: ["zh-Hans-CN", "en-US"], language: "zh-Hans-CN" });
    expect(resolveInitialLocale(SUPPORTED, "en")).toBe("zh-CN");
  });

  it("falls back to the default when the browser asks for nothing supported", () => {
    vi.stubGlobal("navigator", { languages: ["kl-GL"], language: "kl-GL" });
    expect(resolveInitialLocale(SUPPORTED, "en")).toBe("en");
  });
});

describe("document locale", () => {
  it("flags right-to-left scripts", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("he-IL")).toBe(true);
    expect(isRtlLocale("zh-CN")).toBe(false);
  });

  it("writes lang and dir onto the document element", () => {
    applyDocumentLocale("zh-CN");
    expect(document.documentElement.getAttribute("lang")).toBe("zh-CN");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");

    applyDocumentLocale("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });
});
