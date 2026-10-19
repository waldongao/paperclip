import { tCli, translateCliDisplayMessage } from "../i18n.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { PaperclipConfig } from "../config/schema.js";
import { resolvePaperclipInstanceId } from "../config/home.js";
import { readInstallManifest, resolveInstallStorePaths } from "../install-store.js";
import {
  detectServiceManager,
  isExecutableFile,
  resolveServiceShimPath,
  type ServiceManagerDetection,
} from "../services/service-manager.js";
import { buildLocalHealthUrl } from "../utils/health-url.js";
import type { CheckResult } from "./index.js";

type HealthResult = { ok: boolean; version: string | null; error?: string };
type ServiceCheckDependencies = {
  detect: (instanceId: string) => Promise<ServiceManagerDetection>;
  probe: (config: PaperclipConfig) => Promise<HealthResult>;
  shimPresent: (executablePath: string) => Promise<boolean>;
};

async function probeHealth(config: PaperclipConfig): Promise<HealthResult> {
  try {
    const response = await fetch(buildLocalHealthUrl(config.server.host, config.server.port), {
      signal: AbortSignal.timeout(2_000),
    });
    const body = (await response.json()) as {
      status?: unknown;
      serverVersion?: unknown;
      version?: unknown;
    };
    const version = typeof body.serverVersion === "string"
      ? body.serverVersion
      : typeof body.version === "string"
        ? body.version
        : null;
    return { ok: response.ok && body.status === "ok", version };
  } catch (error) {
    return { ok: false, version: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function serviceHealthChecks(
  config: PaperclipConfig,
  dependencies: Partial<ServiceCheckDependencies> = {},
): Promise<CheckResult[]> {
  if (process.env.PAPERCLIP_SERVICE_MANAGED === "1") return [];

  const deps: ServiceCheckDependencies = {
    detect: (instanceId) => detectServiceManager({ instanceId }),
    probe: probeHealth,
    shimPresent: (executablePath) => isExecutableFile(executablePath),
    ...dependencies,
  };
  const instanceId = resolvePaperclipInstanceId();
  const detection = await deps.detect(instanceId);
  if (!detection.supported) {
    return [{ name: tCli("Background service"), status: "pass", message: detection.reason }];
  }

  const manager = detection.manager;
  const status = await manager.status();
  if (!status.installed) {
    return [
      {
        name: tCli("Background service"),
        status: "pass",
        message: tCli("Not installed for instance {{instanceId}} (optional)", { instanceId: String(instanceId) }),
      },
    ];
  }

  const results: CheckResult[] = [];
  let definitionCurrent = false;
  try {
    definitionCurrent = (await fs.readFile(manager.definitionPath, "utf8")) === manager.renderDefinition();
  } catch {
    definitionCurrent = false;
  }
  results.push(
    definitionCurrent
      ? { name: tCli("Service definition"), status: "pass", message: manager.definitionPath }
      : {
          name: tCli("Service definition"),
          status: "fail",
          message: tCli("Missing or drifted definition at {{definitionPath}}", { definitionPath: String(manager.definitionPath) }),
          repairHint: tCli("Run `paperclipai service install` to regenerate the service definition"),
        },
  );

  const health = await deps.probe(config);
  // The installed definition is the truth about what the service executes;
  // fall back to the environment-derived path only when it is unreadable.
  const serviceExecutable = (await manager.installedExecutablePath()) ?? resolveServiceShimPath();
  const shimPresent = status.active ? true : await deps.shimPresent(serviceExecutable);
  results.push(
    status.active
      ? { name: tCli("Service runtime"), status: "pass", message: tCli("{{serviceName}} is active", { serviceName: String(status.serviceName) }) }
      : !shimPresent
        ? {
            name: tCli("Service runtime"),
            status: "fail",
            message: tCli("{{serviceName}} cannot start: no executable exists at {{serviceExecutable}}", { serviceName: String(status.serviceName), serviceExecutable: String(serviceExecutable) }),
            repairHint:
              path.resolve(serviceExecutable) === path.resolve(resolveInstallStorePaths().shimPath)
                ? tCli("Run `paperclipai install` to restore the managed payload and shim, then `paperclipai service start`")
                : tCli("Restore the executable at {{serviceExecutable}}, or unset PAPERCLIP_SHIM_PATH and run `paperclipai install` followed by `paperclipai service install` to re-point the service at the managed shim", { serviceExecutable: String(serviceExecutable) }),
          }
        : health.ok
          ? {
              name: tCli("Service runtime"),
              status: "fail",
              message: tCli("{{serviceName}} is inactive but the configured port is serving another Paperclip process", { serviceName: String(status.serviceName) }),
              repairHint: tCli("Run `paperclipai service start`, or stop the conflicting foreground process first"),
            }
          : {
              name: tCli("Service runtime"),
              status: "fail",
              message: tCli("{{serviceName}} is {{detail}}", { serviceName: status.serviceName, detail: translateCliDisplayMessage(status.detail ?? "inactive") }),
              repairHint: tCli("Run `paperclipai service start`; inspect `paperclipai service logs` if it does not stay up"),
            },
  );

  let expectedVersion: string | null = null;
  try {
    expectedVersion = readInstallManifest()?.version ?? null;
  } catch {}
  results.push(
    !health.ok
      ? {
          name: tCli("Service health"),
          status: "fail",
          message: health.error ? translateCliDisplayMessage(health.error) : tCli("Health endpoint did not report ok"),
          repairHint: tCli("Inspect `paperclipai service status` and `paperclipai service logs`"),
        }
      : expectedVersion && health.version !== expectedVersion
        ? {
            name: tCli("Service version"),
            status: "fail",
            message: tCli("Running {{unknown}}; managed install is {{expectedVersion}}", { unknown: String(health.version ?? tCli("unknown")), expectedVersion: String(expectedVersion) }),
            repairHint: tCli("Run `paperclipai service restart --expected-version {{version}}`", { version: expectedVersion }),
          }
        : status.active
          ? {
              name: tCli("Service health"),
              status: "pass",
              message: tCli("Healthy{{version}}", { version: String(health.version ? tCli(" at version {{version}}", { version: String(health.version) }) : "") }),
            }
          : {
              name: tCli("Service health"),
              status: "warn",
              message: tCli("The configured port answers healthy{{version}}, but not from {{serviceName}} — the service is inactive", { version: String(health.version ? tCli(" (version {{version}})", { version: health.version }) : ""), serviceName: String(status.serviceName) }),
            },
  );

  if (status.enabled && status.linger === false) {
    results.push({
      name: tCli("Service linger"),
      status: "warn",
      message: tCli("Start-on-login is enabled but systemd user lingering is off"),
      repairHint: tCli("Re-run `paperclipai service install --enable-linger` if the service must survive logout"),
    });
  }

  return results;
}
