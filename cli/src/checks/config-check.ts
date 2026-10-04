import { tCli, translateCliDisplayMessage } from "../i18n.js";
import { readConfig, configExists, resolveConfigPath } from "../config/store.js";
import type { CheckResult } from "./index.js";

export function configCheck(configPath?: string): CheckResult {
  const filePath = resolveConfigPath(configPath);

  if (!configExists(configPath)) {
    return {
      name: tCli("Config file"),
      status: "fail",
      message: tCli("Config file not found at {{filePath}}", { filePath: String(filePath) }),
      canRepair: false,
      repairHint: tCli("Run `paperclipai onboard` to create one"),
    };
  }

  try {
    readConfig(configPath);
    return {
      name: tCli("Config file"),
      status: "pass",
      message: tCli("Valid config at {{filePath}}", { filePath: String(filePath) }),
    };
  } catch (err) {
    return {
      name: tCli("Config file"),
      status: "fail",
      message: tCli("Invalid config: {{message}}", { message: translateCliDisplayMessage(err instanceof Error ? err.message : String(err)) }),
      canRepair: false,
      repairHint: tCli("Run `paperclipai configure --section database` (or `paperclipai onboard` to recreate)"),
    };
  }
}
