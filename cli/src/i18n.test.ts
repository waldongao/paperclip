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

  it("localizes new command display without changing names, URLs, codes or raw messages", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    const rawMessage = "Approve Paperclip access in your browser: https://example.com/mcp-device?user_code=AB-CD\nConfirm code: AB-CD\nWaiting for your approval…";
    expect(translateCliDisplayMessage(rawMessage)).toBe("请在浏览器中批准 Paperclip 访问权限：https://example.com/mcp-device?user_code=AB-CD\n确认代码：AB-CD\n正在等待你的批准……");
    expect(rawMessage).toContain("Confirm code: AB-CD");
    expect(tCli("Created {{value1}} with agent {{value2}}.", { value1: "Test & Co.", value2: "My CEO" }))
      .toBe("已创建 Test & Co. 和智能体 My CEO。");
    expect(translateCliDisplayMessage("Paperclip returned no result while creating the CEO agent."))
      .toBe("Paperclip 在创建 CEO 智能体时未返回结果。");
  });
});
