import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiConnectionError, ApiRequestError, PaperclipApiClient } from "./http.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Chinese CLI display boundaries", () => {
  it("translates a known API error while preserving its raw message and body", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    const body = { error: "Issue not found", code: "issue_not_found", status: "todo" };
    const error = new ApiRequestError(404, body.error, { issueId: "task-1" }, body);

    expect(error.message).toBe("找不到任务");
    expect(error.rawMessage).toBe("Issue not found");
    expect(error.status).toBe(404);
    expect(error.body).toBe(body);
    expect(body.code).toBe("issue_not_found");
    expect(body.status).toBe("todo");
  });

  it("preserves the English fallback when an API failure has no structured message", async () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    const client = new PaperclipApiClient({ apiBase: "http://localhost:3100" });

    await expect(client.get("/api/issues")).rejects.toMatchObject({
      rawMessage: "Request failed with status 500",
      message: "请求失败，状态码为 500",
      status: 500,
    });
  });

  it("keeps URLs, request headers, JSON values, and response content unchanged", async () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    const responseData = { status: "todo", title: "User supplied English title" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseData), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new PaperclipApiClient({
      apiBase: "http://localhost:3100",
      apiKey: "test-token",
      runId: "run-1",
    });

    const result = await client.post("/api/issues", responseData);
    expect(result).toEqual(responseData);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3100/api/issues");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-token",
      "x-paperclip-run-id": "run-1",
      "content-type": "application/json",
    });
    expect(init.body).toBe(JSON.stringify(responseData));
  });

  it("localizes connection guidance while preserving executable commands and metadata", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    const error = new ApiConnectionError({
      apiBase: "http://localhost:3100",
      path: "/api/companies",
      method: "GET",
      cause: new TypeError("fetch failed"),
    });

    expect(error.message).toContain("无法连接 Paperclip API。");
    expect(error.message).toContain("curl http://localhost:3100/api/health");
    expect(error.message).toContain("pnpm dev");
    expect(error.message).toContain("npx paperclipai run");
    expect(error.url).toBe("http://localhost:3100/api/companies");
    expect(error.method).toBe("GET");
    expect(error.causeMessage).toBe("fetch failed");
  });
});
