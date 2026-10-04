import { ApiError } from "@/api/client";

/** API messages may be translated for display; response control flow uses the original server message. */
export function isLockedDocumentError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.rawMessage === "Document is locked";
}

export function isHireApprovalRequiredError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.rawMessage.includes("requires board approval");
}
