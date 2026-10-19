import { tCli } from "../i18n.js";
import fs from "node:fs";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

export function logCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  const logDir = resolveRuntimeLikePath(config.logging.logDir, configPath);
  const reportedDir = logDir;

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(reportedDir, { recursive: true });
  }

  try {
    fs.accessSync(reportedDir, fs.constants.W_OK);
    return {
      name: tCli("Log directory"),
      status: "pass",
      message: tCli("Log directory is writable: {{reportedDir}}", { reportedDir: String(reportedDir) }),
    };
  } catch {
    return {
      name: tCli("Log directory"),
      status: "fail",
      message: tCli("Log directory is not writable: {{logDir}}", { logDir: String(logDir) }),
      canRepair: false,
      repairHint: tCli("Check file permissions on the log directory"),
    };
  }
}
