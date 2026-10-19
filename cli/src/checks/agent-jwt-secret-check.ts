import { tCli } from "../i18n.js";
import {
  ensureAgentJwtSecret,
  readAgentJwtSecretFromEnv,
  readAgentJwtSecretFromEnvFile,
  resolveAgentJwtEnvFile,
} from "../config/env.js";
import type { CheckResult } from "./index.js";

export function agentJwtSecretCheck(configPath?: string): CheckResult {
  if (readAgentJwtSecretFromEnv(configPath)) {
    return {
      name: tCli("Agent JWT secret"),
      status: "pass",
      message: tCli("PAPERCLIP_AGENT_JWT_SECRET is set in environment"),
    };
  }

  const envPath = resolveAgentJwtEnvFile(configPath);
  const fileSecret = readAgentJwtSecretFromEnvFile(envPath);

  if (fileSecret) {
    return {
      name: tCli("Agent JWT secret"),
      status: "warn",
      message: tCli("PAPERCLIP_AGENT_JWT_SECRET is present in {{envPath}} but not loaded into environment", { envPath: String(envPath) }),
      repairHint: tCli("Set the value from {{envPath}} in your shell before starting the Paperclip server", { envPath: String(envPath) }),
    };
  }

  return {
    name: tCli("Agent JWT secret"),
    status: "fail",
    message: tCli("PAPERCLIP_AGENT_JWT_SECRET missing from environment and {{envPath}}", { envPath: String(envPath) }),
    canRepair: true,
    repair: () => {
      ensureAgentJwtSecret(configPath);
    },
    repairHint: tCli("Run with --repair to create {{envPath}} containing PAPERCLIP_AGENT_JWT_SECRET", { envPath: String(envPath) }),
  };
}
