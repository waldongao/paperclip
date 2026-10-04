// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import { i18n, t } from "@/i18n";
import { ErrorState } from "./shared";

describe("Tools error classification", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    await i18n.changeLanguage("en");
  });

  it.each(["en", "zh-CN"])("recognizes the original unavailable-route error in %s", async (locale) => {
    await i18n.changeLanguage(locale);
    const error = new ApiError("API route not found", 500, null);
    if (locale === "zh-CN") expect(error.message).toMatch(/[\u4e00-\u9fff]/);

    await act(async () => root.render(<ErrorState error={error} />));

    expect(error.rawMessage).toBe("API route not found");
    expect(container.textContent).toContain(t("tools_access_isnt_available_on_this_server_yet_t"));
    expect(container.textContent).not.toContain(error.message);
  });
});
