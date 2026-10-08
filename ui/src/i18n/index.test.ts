import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, setLocale } from ".";
import { LOCALE_STORAGE_KEY } from "./locale-preference";

const confirm = vi.fn();
const reload = vi.fn();
const setItem = vi.fn();
const setAttribute = vi.fn();

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.stubGlobal("window", { confirm, location: { reload }, localStorage: { setItem } });
  vi.stubGlobal("document", { documentElement: { setAttribute } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("language switching with pending edits", () => {
  it("leaves the preference and document unchanged when the user cancels", () => {
    confirm.mockReturnValue(false);

    expect(setLocale("zh-CN")).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Unsaved changes"));
    expect(setItem).not.toHaveBeenCalled();
    expect(setAttribute).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(i18n.language).toBe("en");
  });

  it("stores the selected language and reloads only after confirmation", () => {
    confirm.mockReturnValue(true);

    expect(setLocale("zh-CN")).toBe(true);
    expect(setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, "zh-CN");
    expect(setAttribute).toHaveBeenCalledWith("lang", "zh-CN");
    expect(setAttribute).toHaveBeenCalledWith("dir", "ltr");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not prompt or reload when the current language is selected", () => {
    expect(setLocale("en")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
