// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentRuntimeState } from "@paperclipai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { AgentProperties } from "./AgentProperties";

vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: null }) }));

const originalLanguage = i18n.language;
afterEach(async () => { await i18n.changeLanguage(originalLanguage); });

const agent = {
  id: "agent-1", name: "My customer agent", status: "error", role: "engineer",
  adapterType: "claude_local", createdAt: new Date("2026-09-01"), reportsTo: null,
  errorReason: "Document is locked", title: "My original English title",
} as Agent;

function render(runtimeState: AgentRuntimeState) {
  return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
    <AgentProperties agent={agent} runtimeState={runtimeState} />
  </QueryClientProvider>);
}

describe("agent property system errors", () => {
  it("localizes known errors and roles while preserving source values and user titles", async () => {
    await i18n.changeLanguage("zh-CN");
    const runtimeState = { lastError: "Document is locked" } as AgentRuntimeState;
    const html = render(runtimeState);
    expect(html).toContain("文档已锁定");
    expect(html).toContain("工程师");
    expect(html).toContain("My original English title");
    expect(runtimeState.lastError).toBe("Document is locked");
    expect(agent.errorReason).toBe("Document is locked");
    expect(agent.role).toBe("engineer");
  });

  it("preserves unknown error details in Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(render({ lastError: "Custom extension failure at tenant-X" } as AgentRuntimeState))
      .toContain("Custom extension failure at tenant-X");
  });
});
