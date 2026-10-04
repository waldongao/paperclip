import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import { i18n } from "@/i18n";
import { isHireApprovalRequiredError, isLockedDocumentError } from "./localized-errors";

const originalLanguage = i18n.language;
afterEach(async () => { await i18n.changeLanguage(originalLanguage); });

describe("localized API error control flow", () => {
  it("still recognizes locked documents when the displayed error is Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const error = new ApiError("Document is locked", 409, {});
    error.message = "文档已锁定";
    expect(isLockedDocumentError(error)).toBe(true);
    expect(isLockedDocumentError(new ApiError("Document is locked", 403, {}))).toBe(false);
    expect(isLockedDocumentError(new ApiError("Revision conflict", 409, {}))).toBe(false);
  });

  it("still routes agent creation to hire approval when its displayed error is Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const error = new ApiError("Creating this agent requires board approval", 409, {});
    error.message = "创建此智能体需要管理端审批";
    expect(isHireApprovalRequiredError(error)).toBe(true);
    expect(isHireApprovalRequiredError(new ApiError("Creating this agent requires board approval", 403, {}))).toBe(false);
    expect(isHireApprovalRequiredError(new ApiError("Agent name already exists", 409, {}))).toBe(false);
  });
});
