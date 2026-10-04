import { afterEach, describe, expect, it } from "vitest";
import type { PipelineCaseLiveness } from "@paperclipai/shared";
import { ApiError } from "@/api/client";
import { AuthApiError } from "@/api/auth";
import { buildTranscript, type RunLogChunk } from "@/adapters/transcript";
import { paperclipRunnerUIAdapter } from "@/adapters/paperclip-runner";
import { i18n } from "@/i18n";
import { derivePipelineLivenessBanner } from "./pipeline-liveness";
import { formatRetryReason } from "./runRetryState";
import { applyRetentionBudget, isTrimmedOutputMarkerChunk, TRIMMED_OUTPUT_MARKER_TEXT } from "./run-log-chunks";

const initialLanguage = i18n.language;
afterEach(async () => { await i18n.changeLanguage(initialLanguage); });

describe("localized display and raw recovery boundaries", () => {
  it("keeps API and auth failure bodies and raw messages available for recovery", async () => {
    await i18n.changeLanguage("zh-CN");
    const body = { error: "Issue not found", code: "issue_not_found", status: "todo" };
    for (const error of [new ApiError(body.error, 404, body), new AuthApiError(body.error, 404, body, body.code)]) {
      expect(error.message).toMatch(/[\u3400-\u9fff]/);
      expect(error.rawMessage).toBe("Issue not found");
      expect(error.status).toBe(404);
      expect(error.body).toBe(body);
      expect(body.code).toBe("issue_not_found");
      expect(body.status).toBe("todo");
    }
  });

  it("detects restored permissions from the original liveness message before translating the banner", async () => {
    await i18n.changeLanguage("zh-CN");
    const message = "Pipeline automation permission has been restored; retry the failed automation ledger.";
    const liveness: PipelineCaseLiveness = {
      state: "attention", reason: "automation_failed", message,
      automation: { automationId: "automation-1" },
    };
    const view = derivePipelineLivenessBanner(liveness);
    expect(view).toMatchObject({ tone: "retry", showRetry: true, retryKind: "automation" });
    expect(view?.body).toMatch(/[\u3400-\u9fff]/);
    expect(liveness.message).toBe(message);
  });

  it("keeps the retention marker stable across locales and translates only its displayed transcript entry", async () => {
    const chunks: RunLogChunk[] = [
      { ts: "one", stream: "stdout", chunk: "first", seq: 1 },
      { ts: "two", stream: "stdout", chunk: "second", seq: 2 },
    ];
    await i18n.changeLanguage("en");
    const trimmed = applyRetentionBudget(chunks, { maxChunks: 1, collapseTrimmed: true }).chunks;
    await i18n.changeLanguage("zh-CN");
    expect(isTrimmedOutputMarkerChunk(trimmed[0]!)).toBe(true);
    const retained = applyRetentionBudget(trimmed, { maxChunks: 1, collapseTrimmed: true }).chunks;
    expect(retained.filter(isTrimmedOutputMarkerChunk)).toHaveLength(1);
    expect(retained[0]?.chunk).toBe(TRIMMED_OUTPUT_MARKER_TEXT);
    const entries = buildTranscript(retained, (line, ts) => [{ kind: "stdout", ts, text: line }]);
    expect(entries[0]).toMatchObject({ kind: "system", text: expect.stringMatching(/[\u3400-\u9fff]/) });
    expect(entries[1]).toMatchObject({ kind: "stdout", text: "second" });
  });

  it("translates a command's display status while preserving its protocol status and failure classification", async () => {
    await i18n.changeLanguage("zh-CN");
    const item = { id: "command-1", type: "commandExecution", command: "pnpm test", status: "failed" };
    const entries = paperclipRunnerUIAdapter.parseStdoutLine(JSON.stringify({
      type: "paperclip.prp.event", event: { eventType: "item.completed", itemId: item.id, payload: { kind: "commandExecution", item } },
    }), "now");
    expect(entries).toEqual([expect.objectContaining({ kind: "tool_result", isError: true, content: expect.stringMatching(/[\u3400-\u9fff]/) })]);
    expect(item.status).toBe("failed");
  });

  it("translates known recovery retry reasons while preserving the previous English display", async () => {
    for (const reason of ["workspace_busy", "interaction_continuation_infra_retry", "execution_review_participant_recovery", "issue_disposition_repair", "provider_quota_recovery"]) {
      await i18n.changeLanguage("en");
      expect(formatRetryReason(reason)).toBe(reason.replace(/_/g, " "));
      await i18n.changeLanguage("zh-CN");
      expect(formatRetryReason(reason)).toMatch(/[\u3400-\u9fff]/);
    }
    expect(formatRetryReason("extension_retry_reason")).toBe("extension retry reason");
  });

  it("translates fixed parser failure guidance and preserves the original failed line", async () => {
    await i18n.changeLanguage("zh-CN");
    const failedLine = '{"provider":"extension","content":"User English content"}';
    const entries = buildTranscript([{ ts: "now", stream: "stdout", chunk: failedLine }], () => { throw new Error("unknown extension error"); });
    expect(entries[0]).toMatchObject({ kind: "result", subtype: "transcript_parse_error", isError: true });
    const entry = entries[0];
    if (entry?.kind !== "result") throw new Error("Expected a transcript error result");
    expect(entry.text).toMatch(/[\u3400-\u9fff]/);
    expect(entry.text).toContain("unknown extension error");
    expect(entry.text).toContain(failedLine);
  });
});
