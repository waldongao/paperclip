import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from ".";
import { translateDisplayMessage } from "./display-message";

describe("display translation of product messages", () => {
  beforeEach(async () => { await i18n.changeLanguage("zh-CN"); });
  afterEach(async () => { await i18n.changeLanguage("en"); });

  it("translates known API and schema labels without changing technical tokens", () => {
    expect(translateDisplayMessage("Select an organization to view agents.")).toBe("选择一个组织以查看智能体。");
    expect(translateDisplayMessage("application/json")).toBe("application/json");
    expect(translateDisplayMessage("x-paperclip-route")).toBe("x-paperclip-route");
  });

  it("recognizes complete system sentences and preserves interpolated names", () => {
    expect(translateDisplayMessage("Paperclip will open Test & Co. so you can choose a workspace and approve access."))
      .toBe("Paperclip 将打开 Test & Co.，供你选择工作区并批准访问。");
  });

  it("removes English inflections only from audited system parameters", () => {
    expect(translateDisplayMessage("Skipped 2 built-in managed agents from export."))
      .toBe("已跳过导出 2 个内置受管智能体。");
    expect(translateDisplayMessage('Existing skill "Test & Co." matched during safe import and will be renamed instead of overwritten.'))
      .toBe("安全导入时匹配到已有技能“Test & Co.”，将被重命名，而非覆盖。");
    expect(translateDisplayMessage("Run status: succeeded")).toBe("运行状态：成功");
    expect(translateDisplayMessage("Test & Co. run failed")).toBe("Test & Co. 运行 失败");
  });

  it("leaves unknown user content, embedded English phrases and identifiers unchanged", () => {
    for (const value of ["My company needs a new product", "Alice: Review", "Please quote: Select an organization to view agents.", "custom_provider"])
      expect(translateDisplayMessage(value)).toBe(value);
  });

  it("keeps original product messages in English when English is selected", async () => {
    await i18n.changeLanguage("en");
    expect(translateDisplayMessage("Select an organization to view agents.")).toBe("Select an organization to view agents.");
  });
});
