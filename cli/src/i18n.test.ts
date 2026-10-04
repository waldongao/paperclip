import { afterEach, describe, expect, it, vi } from "vitest";
import { cliLocale, tCli, translateCliDisplayMessage } from "./i18n.js";

afterEach(() => vi.unstubAllEnvs());

describe("CLI locale", () => {
  it("uses an explicit Paperclip preference before the shell locale", () => {
    expect(cliLocale({ PAPERCLIP_LOCALE: "en", LANG: "zh_CN.UTF-8" })).toBe("en");
    expect(cliLocale({ LANG: "zh_CN.UTF-8" })).toBe("zh-CN");
    expect(cliLocale({ LANG: "en_US.UTF-8" })).toBe("en");
  });

  it("interpolates values without changing their spelling", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "en");
    expect(tCli("Saved {{path}}", { path: "/tmp/Test & Co./config.json" }))
      .toBe("Saved /tmp/Test & Co./config.json");
  });

  it("preserves unknown text and command syntax", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    expect(tCli("paperclipai run --json")).toBe("paperclipai run --json");
  });

  it("translates known human messages and preserves interpolated paths", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    expect(tCli("Saved {{path}}", { path: "/tmp/Test & Co./config.json" }))
      .toBe("已保存 /tmp/Test & Co./config.json");
    expect(translateCliDisplayMessage("Saved /tmp/Test & Co./config.json"))
      .toBe("Saved /tmp/Test & Co./config.json");
    expect(translateCliDisplayMessage("Invite does not allow Test & Co. joins"))
      .toBe("此邀请不允许 Test & Co. 类型的成员加入");
    expect(translateCliDisplayMessage("Skipped 2 built-in managed agents from export."))
      .toBe("已跳过导出 2 个内置受管智能体。");
    expect(translateCliDisplayMessage("Run status: succeeded")).toBe("运行状态：成功");
    expect(translateCliDisplayMessage("Test & Co. run failed")).toBe("Test & Co. 运行 失败");
  });
});
