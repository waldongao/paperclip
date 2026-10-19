import { tCli } from "../i18n.js";
import { inferBindModeFromHost } from "@paperclipai/shared";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export function deploymentAuthCheck(config: PaperclipConfig): CheckResult {
  const mode = config.server.deploymentMode;
  const exposure = config.server.exposure;
  const auth = config.auth;
  const bind = config.server.bind ?? inferBindModeFromHost(config.server.host);

  if (mode === "local_trusted") {
    if (bind !== "loopback") {
      return {
        name: tCli("Deployment/auth mode"),
        status: "fail",
        message: tCli("local_trusted requires loopback binding (found {{bind}})", { bind: String(bind) }),
        canRepair: false,
        repairHint: tCli("Run `paperclipai configure --section server` and choose Local trusted / loopback reachability"),
      };
    }
    return {
      name: tCli("Deployment/auth mode"),
      status: "pass",
      message: tCli("local_trusted mode is configured for loopback-only access"),
    };
  }

  const secret =
    process.env.BETTER_AUTH_SECRET?.trim() ??
    process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
  if (!secret) {
    return {
      name: tCli("Deployment/auth mode"),
      status: "fail",
      message: tCli("authenticated mode requires BETTER_AUTH_SECRET (or PAPERCLIP_AGENT_JWT_SECRET)"),
      canRepair: false,
      repairHint: tCli("Set BETTER_AUTH_SECRET before starting Paperclip"),
    };
  }

  if (auth.baseUrlMode === "explicit" && !auth.publicBaseUrl) {
    return {
      name: tCli("Deployment/auth mode"),
      status: "fail",
      message: tCli("auth.baseUrlMode=explicit requires auth.publicBaseUrl"),
      canRepair: false,
      repairHint: tCli("Run `paperclipai configure --section server` and provide a base URL"),
    };
  }

  if (exposure === "public") {
    if (auth.baseUrlMode !== "explicit" || !auth.publicBaseUrl) {
      return {
        name: tCli("Deployment/auth mode"),
        status: "fail",
        message: tCli("authenticated/public requires explicit auth.publicBaseUrl"),
        canRepair: false,
        repairHint: tCli("Run `paperclipai configure --section server` and select public exposure"),
      };
    }
    try {
      const url = new URL(auth.publicBaseUrl);
      if (url.protocol !== "https:") {
        return {
          name: tCli("Deployment/auth mode"),
          status: "warn",
          message: tCli("Public exposure should use an https:// auth.publicBaseUrl"),
          canRepair: false,
          repairHint: tCli("Use HTTPS in production for secure session cookies"),
        };
      }
    } catch {
      return {
        name: tCli("Deployment/auth mode"),
        status: "fail",
        message: tCli("auth.publicBaseUrl is not a valid URL"),
        canRepair: false,
        repairHint: tCli("Run `paperclipai configure --section server` and provide a valid URL"),
      };
    }
  }

  return {
    name: tCli("Deployment/auth mode"),
    status: "pass",
    message: tCli("Mode {{mode}}/{{exposure}} with bind {{bind}} and auth URL mode {{baseUrlMode}}", { mode: String(mode), exposure: String(exposure), bind: String(bind), baseUrlMode: String(auth.baseUrlMode) }),
  };
}
