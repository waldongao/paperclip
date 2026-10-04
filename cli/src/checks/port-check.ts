import { tCli } from "../i18n.js";
import type { PaperclipConfig } from "../config/schema.js";
import { checkPort } from "../utils/net.js";
import type { CheckResult } from "./index.js";

export async function portCheck(config: PaperclipConfig): Promise<CheckResult> {
  const port = config.server.port;
  const result = await checkPort(port);

  if (result.available) {
    return {
      name: tCli("Server port"),
      status: "pass",
      message: tCli("Port {{port}} is available", { port: String(port) }),
    };
  }

  return {
    name: tCli("Server port"),
    status: "warn",
    message: result.error ?? tCli("Port {{port}} is not available", { port: String(port) }),
    canRepair: false,
    repairHint: tCli("Check what's using port {{port}} with: lsof -i :{{port2}}", { port: String(port), port2: String(port) }),
  };
}
