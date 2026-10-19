import { tCli } from "../i18n.js";
import fs from "node:fs";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

export function storageCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  if (config.storage.provider === "local_disk") {
    const baseDir = resolveRuntimeLikePath(config.storage.localDisk.baseDir, configPath);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    try {
      fs.accessSync(baseDir, fs.constants.W_OK);
      return {
        name: tCli("Storage"),
        status: "pass",
        message: tCli("Local disk storage is writable: {{baseDir}}", { baseDir: String(baseDir) }),
      };
    } catch {
      return {
        name: tCli("Storage"),
        status: "fail",
        message: tCli("Local storage directory is not writable: {{baseDir}}", { baseDir: String(baseDir) }),
        canRepair: false,
        repairHint: tCli("Check file permissions for storage.localDisk.baseDir"),
      };
    }
  }

  const bucket = config.storage.s3.bucket.trim();
  const region = config.storage.s3.region.trim();
  if (!bucket || !region) {
    return {
      name: tCli("Storage"),
      status: "fail",
      message: tCli("S3 storage requires non-empty bucket and region"),
      canRepair: false,
      repairHint: tCli("Run `paperclipai configure --section storage`"),
    };
  }

  return {
    name: tCli("Storage"),
    status: "warn",
    message: tCli("S3 storage configured (bucket={{bucket}}, region={{region}}). Reachability check is skipped in doctor.", { bucket: String(bucket), region: String(region) }),
    canRepair: false,
    repairHint: tCli("Verify credentials and endpoint in deployment environment"),
  };
}

