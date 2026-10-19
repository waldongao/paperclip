import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctor } from "../commands/doctor.js";
import { writeConfig } from "../config/store.js";
import type { PaperclipConfig } from "../config/schema.js";
import { checkPort } from "../utils/net.js";

// Doctor repair tests must not depend on host port occupancy or socket permissions.
vi.mock("../utils/net.js", () => ({ checkPort: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

function createTempConfig(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-doctor-"));
  const configPath = path.join(root, ".paperclip", "config.json");
  const runtimeRoot = path.join(root, "runtime");

  const config: PaperclipConfig = {
    $meta: {
      version: 1,
      updatedAt: "2026-03-10T00:00:00.000Z",
      source: "configure",
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: path.join(runtimeRoot, "db"),
      embeddedPostgresPort: 55432,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: path.join(runtimeRoot, "backups"),
      },
    },
    logging: {
      mode: "file",
      logDir: path.join(runtimeRoot, "logs"),
    },
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      host: "127.0.0.1",
      port: 3199,
      allowedHostnames: [],
      serveUi: true,
    },
    auth: {
      baseUrlMode: "auto",
      disableSignUp: false,
    },
    telemetry: {
      enabled: true,
    },
    storage: {
      provider: "local_disk",
      localDisk: {
        baseDir: path.join(runtimeRoot, "storage"),
      },
      s3: {
        bucket: "paperclip",
        region: "us-east-1",
        prefix: "",
        forcePathStyle: false,
      },
    },
    secrets: {
      provider: "local_encrypted",
      strictMode: false,
      localEncrypted: {
        keyFilePath: path.join(runtimeRoot, "secrets", "master.key"),
      },
    },
  };

  writeConfig(config, configPath);
  return configPath;
}

describe("doctor", () => {
  beforeEach(() => {
    vi.mocked(checkPort).mockReset().mockResolvedValue({ available: true });
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PAPERCLIP_AGENT_JWT_SECRET;
    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("re-runs repairable checks so repaired failures do not remain blocking", async () => {
    const configPath = createTempConfig();

    const summary = await doctor({
      config: configPath,
      repair: true,
      yes: true,
    });

    expect(summary.failed).toBe(0);
    expect(summary.warned).toBe(0);
    expect(process.env.PAPERCLIP_AGENT_JWT_SECRET).toBeTruthy();
  });

  it("preserves unrelated port warnings after repairing other checks", async () => {
    vi.mocked(checkPort).mockResolvedValue({ available: false, error: "listen EPERM" });

    const summary = await doctor({
      config: createTempConfig(),
      repair: true,
      yes: true,
    });

    expect(summary.failed).toBe(0);
    expect(summary.warned).toBe(1);
    expect(checkPort).toHaveBeenCalledWith(3199);
    expect(process.env.PAPERCLIP_AGENT_JWT_SECRET).toBeTruthy();
  });
});
