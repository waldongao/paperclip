import { tCli } from "../i18n.js";
import * as p from "@clack/prompts";
import type { LoggingConfig } from "../config/schema.js";
import { resolveDefaultLogsDir, resolvePaperclipInstanceId } from "../config/home.js";

export async function promptLogging(): Promise<LoggingConfig> {
  const defaultLogDir = resolveDefaultLogsDir(resolvePaperclipInstanceId());
  const mode = await p.select({
    message: tCli("Logging mode"),
    options: [
      { value: "file" as const, label: tCli("File-based logging"), hint: tCli("recommended") },
      { value: "cloud" as const, label: tCli("Cloud logging"), hint: tCli("coming soon") },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  if (mode === "file") {
    const logDir = await p.text({
      message: tCli("Log directory"),
      defaultValue: defaultLogDir,
      placeholder: defaultLogDir,
    });

    if (p.isCancel(logDir)) {
      p.cancel(tCli("Setup cancelled."));
      process.exit(0);
    }

    return { mode: "file", logDir: logDir || defaultLogDir };
  }

  p.note(tCli("Cloud logging is coming soon. Using file-based logging for now."));
  return { mode: "file", logDir: defaultLogDir };
}
