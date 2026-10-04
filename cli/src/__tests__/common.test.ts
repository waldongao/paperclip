import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeContext } from "../client/context.js";
import { setStoredBoardCredential } from "../client/board-auth.js";
import * as boardAuth from "../client/board-auth.js";
import { ApiRequestError } from "../client/http.js";
import { apiPath, inferContentTypeFromPath, resolveApiBase, resolveCommandContext } from "../commands/client/common.js";

const ORIGINAL_ENV = { ...process.env };

function createTempPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-cli-common-"));
  return path.join(dir, name);
}

describe("resolveCommandContext", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PAPERCLIP_API_URL;
    delete process.env.PAPERCLIP_API_KEY;
    delete process.env.PAPERCLIP_COMPANY_ID;
    delete process.env.PAPERCLIP_AUTH_STORE;
    delete process.env.PAPERCLIP_SERVER_PORT;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses profile defaults when options/env are not provided", () => {
    const contextPath = createTempPath("context.json");

    writeContext(
      {
        version: 2,
        currentProfile: "ops",
        profiles: {
          ops: {
            apiBase: "http://127.0.0.1:9999",
            companyId: "company-profile",
            apiKeyEnvVarName: "AGENT_KEY",
          },
        },
      },
      contextPath,
    );
    process.env.AGENT_KEY = "key-from-env";

    const resolved = resolveCommandContext({ context: contextPath }, { requireCompany: true });
    expect(resolved.api.apiBase).toBe("http://127.0.0.1:9999");
    expect(resolved.companyId).toBe("company-profile");
    expect(resolved.api.apiKey).toBe("key-from-env");
  });

  it("prefers explicit options over profile values", () => {
    const contextPath = createTempPath("context.json");
    writeContext(
      {
        version: 2,
        currentProfile: "default",
        profiles: {
          default: {
            apiBase: "http://profile:3100",
            companyId: "company-profile",
          },
        },
      },
      contextPath,
    );

    const resolved = resolveCommandContext(
      {
        context: contextPath,
        apiBase: "http://override:3200",
        apiKey: "direct-token",
        companyId: "company-override",
      },
      { requireCompany: true },
    );

    expect(resolved.api.apiBase).toBe("http://override:3200");
    expect(resolved.companyId).toBe("company-override");
    expect(resolved.api.apiKey).toBe("direct-token");
  });

  it("throws when company is required but unresolved", () => {
    const contextPath = createTempPath("context.json");
    writeContext(
      {
        version: 2,
        currentProfile: "default",
        profiles: { default: {} },
      },
      contextPath,
    );

    expect(() =>
      resolveCommandContext({ context: contextPath, apiBase: "http://localhost:3100" }, { requireCompany: true }),
    ).toThrow(/Company ID is required/);
  });

  it("resolves api base by explicit, env, profile, then config/default precedence", () => {
    const configPath = createTempPath("config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      $meta: { version: 1, updatedAt: "2026-05-23T00:00:00.000Z", source: "onboard" },
      database: { mode: "embedded-postgres" },
      logging: { mode: "file" },
      server: { deploymentMode: "local_trusted", exposure: "private", host: "127.0.0.1", port: 4111 },
    }));

    expect(resolveApiBase({ apiBase: "http://explicit:1", config: configPath }, { apiBase: "http://profile:2" }))
      .toBe("http://explicit:1");

    process.env.PAPERCLIP_API_URL = "http://env:3/";
    expect(resolveApiBase({ config: configPath }, { apiBase: "http://profile:2" })).toBe("http://env:3");

    delete process.env.PAPERCLIP_API_URL;
    expect(resolveApiBase({ config: configPath }, { apiBase: "http://profile:2/" })).toBe("http://profile:2");
    expect(resolveApiBase({ config: configPath }, {})).toBe("http://localhost:4111");
  });

  it("prefers explicit and env tokens over profile env and stored board auth", () => {
    const contextPath = createTempPath("context.json");
    const authStorePath = createTempPath("auth.json");
    process.env.PAPERCLIP_AUTH_STORE = authStorePath;
    process.env.PROFILE_KEY = "profile-token";
    setStoredBoardCredential({
      apiBase: "http://localhost:3100",
      token: "stored-board-token",
      userId: "user-1",
      storePath: authStorePath,
    });
    writeContext(
      {
        version: 2,
        currentProfile: "default",
        profiles: {
          default: {
            apiBase: "http://localhost:3100",
            apiKeyEnvVarName: "PROFILE_KEY",
          },
        },
      },
      contextPath,
    );

    const profileResolved = resolveCommandContext({ context: contextPath });
    expect(profileResolved.api.apiKey).toBe("profile-token");
    expect(profileResolved.authSource).toBe("profile_env");

    process.env.PAPERCLIP_API_KEY = "env-token";
    const envResolved = resolveCommandContext({ context: contextPath });
    expect(envResolved.api.apiKey).toBe("env-token");
    expect(envResolved.authSource).toBe("env");

    const explicitResolved = resolveCommandContext({ context: contextPath, apiKey: "explicit-token" });
    expect(explicitResolved.api.apiKey).toBe("explicit-token");
    expect(explicitResolved.authSource).toBe("explicit");
  });

  describe("localized board authentication recovery", () => {
    let stdinDescriptor: PropertyDescriptor | undefined;
    let stdoutDescriptor: PropertyDescriptor | undefined;
    let loginSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      process.env.PAPERCLIP_LOCALE = "zh-CN";
      process.env.PAPERCLIP_AUTH_STORE = createTempPath("auth.json");
      stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
      stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
      loginSpy = vi.spyOn(boardAuth, "loginBoardCli").mockResolvedValue({
        token: "recovered-board-token",
        approvalUrl: "http://paperclip.test/cli-auth/challenge-1",
        userId: "user-1",
      });
    });

    afterEach(() => {
      if (stdinDescriptor) Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
      if (stdoutDescriptor) Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
      else delete (process.stdout as { isTTY?: boolean }).isTTY;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it.each([
      ["Board access required", "board"],
      ["Instance admin required", "instance_admin_required"],
    ])("recovers a localized 403 for %s with the correct requested access", async (rawMessage, requestedAccess) => {
      const error = new ApiRequestError(403, rawMessage);
      expect(error.message).toMatch(/[\u4e00-\u9fff]/);
      expect(error.rawMessage).toBe(rawMessage);
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: rawMessage }), { status: 403 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const resolved = resolveCommandContext({
        context: createTempPath("context.json"),
        apiBase: "http://paperclip.test",
        companyId: "company-1",
      });
      await expect(resolved.api.get("/api/companies")).resolves.toEqual({ ok: true });

      expect(loginSpy).toHaveBeenCalledExactlyOnceWith({
        apiBase: "http://paperclip.test",
        requestedAccess,
        requestedCompanyId: "company-1",
        command: expect.any(String),
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(2, "http://paperclip.test/api/companies", expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer recovered-board-token" }),
      }));
    });

    it.each([
      [403, "Permission denied"],
      [500, "Board access required"],
    ])("does not recover unrelated failures (%s, %s)", async (status, rawMessage) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: rawMessage }), { status }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const resolved = resolveCommandContext({ context: createTempPath("context.json"), apiBase: "http://paperclip.test" });

      await expect(resolved.api.get("/api/companies")).rejects.toMatchObject({ status, rawMessage });
      expect(loginSpy).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each(["noninteractive stdin", "noninteractive stdout", "explicit API key"])(
      "preserves the interactive recovery boundary for %s",
      async (boundary) => {
        if (boundary === "noninteractive stdin") {
          Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
        }
        if (boundary === "noninteractive stdout") {
          Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
        }
        const resolved = resolveCommandContext({
          context: createTempPath("context.json"),
          apiBase: "http://paperclip.test",
          apiKey: boundary === "explicit API key" ? "agent-token" : undefined,
        });
        const fetchMock = vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "Board access required" }), { status: 403 }),
        );
        vi.stubGlobal("fetch", fetchMock);

        expect(resolved.api.recoverAuth).toBeUndefined();
        await expect(resolved.api.get("/api/companies")).rejects.toMatchObject({
          status: 403,
          rawMessage: "Board access required",
        });
        expect(loginSpy).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );
  });
});

describe("inferContentTypeFromPath", () => {
  it("maps the issue-attachment file types the server allows", () => {
    // Must match server/src/attachment-types.ts DEFAULT_ALLOWED_TYPES exactly.
    expect(inferContentTypeFromPath("newsletter.html")).toBe("text/html");
    expect(inferContentTypeFromPath("page.htm")).toBe("text/html");
    expect(inferContentTypeFromPath("data.csv")).toBe("text/csv");
    expect(inferContentTypeFromPath("bundle.zip")).toBe("application/zip");
    expect(inferContentTypeFromPath("demo.mp4")).toBe("video/mp4");
    expect(inferContentTypeFromPath("clip.webm")).toBe("video/webm");
    expect(inferContentTypeFromPath("teaser.m4v")).toBe("video/x-m4v");
    expect(inferContentTypeFromPath("walkthrough.mov")).toBe("video/quicktime");
    expect(inferContentTypeFromPath("report.pdf")).toBe("application/pdf");
    expect(inferContentTypeFromPath("chart.png")).toBe("image/png");
  });

  it("emits text types with no charset parameter so they match the exact allowlist", () => {
    expect(inferContentTypeFromPath("notes.md")).toBe("text/markdown");
    expect(inferContentTypeFromPath("log.txt")).toBe("text/plain");
  });

  it("is case-insensitive and returns undefined for unknown extensions", () => {
    expect(inferContentTypeFromPath("/abs/Path/IMAGE.PNG")).toBe("image/png");
    expect(inferContentTypeFromPath("archive.unknownext")).toBeUndefined();
    expect(inferContentTypeFromPath("noextension")).toBeUndefined();
  });
});

describe("apiPath", () => {
  it("encodes dynamic path segments", () => {
    expect(apiPath`/api/issues/${"PAP-1/child"}/comments/${"needs review?"}`)
      .toBe("/api/issues/PAP-1%2Fchild/comments/needs%20review%3F");
  });

  it("rejects empty dynamic path segments", () => {
    expect(() => apiPath`/api/issues/${""}`).toThrow("Cannot build API path with an empty path segment.");
    expect(() => apiPath`/api/issues/${undefined}`).toThrow("Cannot build API path with an empty path segment.");
    expect(() => apiPath`/api/issues/${null}`).toThrow("Cannot build API path with an empty path segment.");
    expect(() => apiPath`/api/issues/${" "}`).toThrow("Cannot build API path with an empty path segment.");
  });
});
