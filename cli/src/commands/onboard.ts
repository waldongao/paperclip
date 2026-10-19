import { tCli } from "../i18n.js";
import * as p from "@clack/prompts";
import path from "node:path";
import pc from "picocolors";
import {
  AUTH_BASE_URL_MODES,
  BIND_MODES,
  DEPLOYMENT_EXPOSURES,
  DEPLOYMENT_MODES,
  SECRET_PROVIDERS,
  STORAGE_PROVIDERS,
  inferBindModeFromHost,
  resolveRuntimeBind,
  type BindMode,
  type AuthBaseUrlMode,
  type DeploymentExposure,
  type DeploymentMode,
  type SecretProvider,
  type StorageProvider,
} from "@paperclipai/shared";
import {
  backupInvalidConfig,
  configExists,
  readConfig,
  resolveConfigPath,
  writeConfig,
} from "../config/store.js";
import {
  findPaperclipConfigKeyWarnings,
  type PaperclipConfig,
} from "../config/schema.js";
import { ensureAgentJwtSecret, ensureToolActionSigningSecret, resolveAgentJwtEnvFile } from "../config/env.js";
import { ensureLocalSecretsKeyFile } from "../config/secrets-key.js";
import { promptDatabase } from "../prompts/database.js";
import { promptLlm } from "../prompts/llm.js";
import { promptLogging } from "../prompts/logging.js";
import { defaultSecretsConfig } from "../prompts/secrets.js";
import { defaultStorageConfig, promptStorage } from "../prompts/storage.js";
import { promptServer } from "../prompts/server.js";
import { buildPresetServerConfig } from "../config/server-bind.js";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolveDefaultBackupDir,
  resolveDefaultEmbeddedPostgresDir,
  resolveDefaultLogsDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";
import { bootstrapCeoInvite } from "./auth-bootstrap-ceo.js";
import { printPaperclipCliBanner } from "../utils/banner.js";
import {
  getTelemetryClient,
  trackInstallStarted,
  trackInstallCompleted,
} from "../telemetry.js";
import {
  handleOnboardService,
  handoffToOnboardedService,
  shouldOfferForegroundStart,
} from "../onboard-service.js";
import { readInstallManifest, isManagedExecutable } from "../install-store.js";

type SetupMode = "quickstart" | "advanced";

type OnboardOptions = {
  config?: string;
  run?: boolean;
  yes?: boolean;
  invokedByRun?: boolean;
  bind?: BindMode;
  installService?: boolean;
};

type OnboardDefaults = Pick<PaperclipConfig, "database" | "logging" | "server" | "auth" | "storage" | "secrets">;

const TAILNET_BIND_WARNING =
  tCli("No Tailscale address was detected during setup. The saved config will stay on loopback until Tailscale is available or PAPERCLIP_TAILNET_BIND_HOST is set.");

const ONBOARD_ENV_KEYS = [
  "PAPERCLIP_PUBLIC_URL",
  "DATABASE_URL",
  "PAPERCLIP_DB_BACKUP_ENABLED",
  "PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES",
  "PAPERCLIP_DB_BACKUP_RETENTION_DAYS",
  "PAPERCLIP_DB_BACKUP_DIR",
  "PAPERCLIP_DEPLOYMENT_MODE",
  "PAPERCLIP_DEPLOYMENT_EXPOSURE",
  "PAPERCLIP_BIND",
  "PAPERCLIP_BIND_HOST",
  "PAPERCLIP_TAILNET_BIND_HOST",
  "HOST",
  "PORT",
  "SERVE_UI",
  "PAPERCLIP_ALLOWED_HOSTNAMES",
  "PAPERCLIP_AUTH_BASE_URL_MODE",
  "PAPERCLIP_AUTH_PUBLIC_BASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_BASE_URL",
  "PAPERCLIP_STORAGE_PROVIDER",
  "PAPERCLIP_STORAGE_LOCAL_DIR",
  "PAPERCLIP_STORAGE_S3_BUCKET",
  "PAPERCLIP_STORAGE_S3_REGION",
  "PAPERCLIP_STORAGE_S3_ENDPOINT",
  "PAPERCLIP_STORAGE_S3_PREFIX",
  "PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE",
  "PAPERCLIP_SECRETS_PROVIDER",
  "PAPERCLIP_SECRETS_STRICT_MODE",
  "PAPERCLIP_SECRETS_MASTER_KEY_FILE",
] as const;

function parseBooleanFromEnv(rawValue: string | undefined): boolean | null {
  if (rawValue === undefined) return null;
  const lower = rawValue.trim().toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;
  return null;
}

async function runOnboardedForeground(configPath: string): Promise<void> {
  const previousOpenOnListen = process.env.PAPERCLIP_OPEN_ON_LISTEN;
  const browserDisabled = parseBooleanFromEnv(process.env.PAPERCLIP_NO_BROWSER) === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // The server consumes this flag in its listen callback. Keep it scoped to
  // this foreground start so a later in-process restart does not open another
  // tab. Explicit configuration wins over the interactive default, while the
  // broad no-browser switch wins over an earlier explicit opt-in.
  if (browserDisabled) {
    process.env.PAPERCLIP_OPEN_ON_LISTEN = "false";
  } else if (interactive && previousOpenOnListen === undefined) {
    process.env.PAPERCLIP_OPEN_ON_LISTEN = "true";
  }

  try {
    const { runCommand } = await import("./run.js");
    await runCommand({ config: configPath, repair: true, yes: true });
  } finally {
    if (previousOpenOnListen === undefined) {
      delete process.env.PAPERCLIP_OPEN_ON_LISTEN;
    } else {
      process.env.PAPERCLIP_OPEN_ON_LISTEN = previousOpenOnListen;
    }
  }
}

function parseNumberFromEnv(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseEnumFromEnv<T extends string>(rawValue: string | undefined, allowedValues: readonly T[]): T | null {
  if (!rawValue) return null;
  return allowedValues.includes(rawValue as T) ? (rawValue as T) : null;
}

function resolvePathFromEnv(rawValue: string | undefined): string | null {
  if (!rawValue || rawValue.trim().length === 0) return null;
  return path.resolve(expandHomePrefix(rawValue.trim()));
}

function describeServerBinding(server: Pick<PaperclipConfig["server"], "bind" | "customBindHost" | "host" | "port">): string {
  const bind = server.bind ?? inferBindModeFromHost(server.host);
  const detail =
    bind === "custom"
      ? server.customBindHost ?? server.host
      : bind === "tailnet"
        ? tCli("detected tailscale address")
        : server.host;
  return `${bind}${detail ? ` (${detail})` : ""}:${server.port}`;
}

function quickstartDefaultsFromEnv(opts?: { preferTrustedLocal?: boolean }): {
  defaults: OnboardDefaults;
  usedEnvKeys: string[];
  ignoredEnvKeys: Array<{ key: string; reason: string }>;
} {
  const preferTrustedLocal = opts?.preferTrustedLocal ?? false;
  const instanceId = resolvePaperclipInstanceId();
  const defaultStorage = defaultStorageConfig();
  const defaultSecrets = defaultSecretsConfig();
  const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
  const publicUrl = preferTrustedLocal
    ? undefined
    : (
      process.env.PAPERCLIP_PUBLIC_URL?.trim() ||
      process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL?.trim() ||
      process.env.BETTER_AUTH_URL?.trim() ||
      process.env.BETTER_AUTH_BASE_URL?.trim() ||
      undefined
    );
  const deploymentMode = preferTrustedLocal
    ? "local_trusted"
    : (parseEnumFromEnv<DeploymentMode>(process.env.PAPERCLIP_DEPLOYMENT_MODE, DEPLOYMENT_MODES) ?? "local_trusted");
  const deploymentExposureFromEnv = parseEnumFromEnv<DeploymentExposure>(
    process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE,
    DEPLOYMENT_EXPOSURES,
  );
  const deploymentExposure =
    deploymentMode === "local_trusted" ? "private" : (deploymentExposureFromEnv ?? "private");
  const bindFromEnv = parseEnumFromEnv<BindMode>(process.env.PAPERCLIP_BIND, BIND_MODES);
  const customBindHostFromEnv = process.env.PAPERCLIP_BIND_HOST?.trim() || undefined;
  const hostFromEnv = process.env.HOST?.trim() || undefined;
  const configuredBindHost = customBindHostFromEnv ?? hostFromEnv;
  const bind = preferTrustedLocal
    ? "loopback"
    : (
      deploymentMode === "local_trusted"
        ? "loopback"
        : (bindFromEnv ?? (configuredBindHost ? inferBindModeFromHost(configuredBindHost) : "lan"))
    );
  const resolvedBind = resolveRuntimeBind({
    bind,
    host: hostFromEnv ?? (bind === "loopback" ? "127.0.0.1" : "0.0.0.0"),
    customBindHost: customBindHostFromEnv,
    tailnetBindHost: process.env.PAPERCLIP_TAILNET_BIND_HOST?.trim(),
  });
  const authPublicBaseUrl = publicUrl;
  const authBaseUrlModeFromEnv = parseEnumFromEnv<AuthBaseUrlMode>(
    process.env.PAPERCLIP_AUTH_BASE_URL_MODE,
    AUTH_BASE_URL_MODES,
  );
  const authBaseUrlMode = authBaseUrlModeFromEnv ?? (authPublicBaseUrl ? "explicit" : "auto");
  const allowedHostnamesFromEnv = process.env.PAPERCLIP_ALLOWED_HOSTNAMES
    ? process.env.PAPERCLIP_ALLOWED_HOSTNAMES
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
    : [];
  const hostnameFromPublicUrl = publicUrl
    ? (() => {
      try {
        return new URL(publicUrl).hostname.trim().toLowerCase();
      } catch {
        return null;
      }
    })()
    : null;
  const storageProvider =
    parseEnumFromEnv<StorageProvider>(process.env.PAPERCLIP_STORAGE_PROVIDER, STORAGE_PROVIDERS) ??
    defaultStorage.provider;
  const secretsProvider =
    parseEnumFromEnv<SecretProvider>(process.env.PAPERCLIP_SECRETS_PROVIDER, SECRET_PROVIDERS) ??
    defaultSecrets.provider;
  const databaseBackupEnabled = parseBooleanFromEnv(process.env.PAPERCLIP_DB_BACKUP_ENABLED) ?? true;
  const databaseBackupIntervalMinutes = Math.max(
    1,
    parseNumberFromEnv(process.env.PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES) ?? 60,
  );
  const databaseBackupRetentionDays = Math.max(
    1,
    parseNumberFromEnv(process.env.PAPERCLIP_DB_BACKUP_RETENTION_DAYS) ?? 30,
  );
  const defaults: OnboardDefaults = {
    database: {
      mode: databaseUrl ? "postgres" : "embedded-postgres",
      ...(databaseUrl ? { connectionString: databaseUrl } : {}),
      embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(instanceId),
      embeddedPostgresPort: 54329,
      backup: {
        enabled: databaseBackupEnabled,
        intervalMinutes: databaseBackupIntervalMinutes,
        retentionDays: databaseBackupRetentionDays,
        dir: resolvePathFromEnv(process.env.PAPERCLIP_DB_BACKUP_DIR) ?? resolveDefaultBackupDir(instanceId),
      },
    },
    logging: {
      mode: "file",
      logDir: resolveDefaultLogsDir(instanceId),
    },
    server: {
      deploymentMode,
      exposure: deploymentExposure,
      bind: resolvedBind.bind,
      ...(resolvedBind.customBindHost ? { customBindHost: resolvedBind.customBindHost } : {}),
      host: resolvedBind.host,
      port: Number(process.env.PORT) || 3100,
      allowedHostnames: Array.from(new Set([...allowedHostnamesFromEnv, ...(hostnameFromPublicUrl ? [hostnameFromPublicUrl] : [])])),
      serveUi: parseBooleanFromEnv(process.env.SERVE_UI) ?? true,
    },
    auth: {
      baseUrlMode: authBaseUrlMode,
      disableSignUp: false,
      ...(authPublicBaseUrl ? { publicBaseUrl: authPublicBaseUrl } : {}),
    },
    storage: {
      provider: storageProvider,
      localDisk: {
        baseDir:
          resolvePathFromEnv(process.env.PAPERCLIP_STORAGE_LOCAL_DIR) ?? defaultStorage.localDisk.baseDir,
      },
      s3: {
        bucket: process.env.PAPERCLIP_STORAGE_S3_BUCKET ?? defaultStorage.s3.bucket,
        region: process.env.PAPERCLIP_STORAGE_S3_REGION ?? defaultStorage.s3.region,
        endpoint: process.env.PAPERCLIP_STORAGE_S3_ENDPOINT ?? defaultStorage.s3.endpoint,
        prefix: process.env.PAPERCLIP_STORAGE_S3_PREFIX ?? defaultStorage.s3.prefix,
        forcePathStyle:
          parseBooleanFromEnv(process.env.PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE) ??
          defaultStorage.s3.forcePathStyle,
      },
    },
    secrets: {
      provider: secretsProvider,
      strictMode: parseBooleanFromEnv(process.env.PAPERCLIP_SECRETS_STRICT_MODE) ?? defaultSecrets.strictMode,
      localEncrypted: {
        keyFilePath:
          resolvePathFromEnv(process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE) ??
          defaultSecrets.localEncrypted.keyFilePath,
      },
    },
  };
  const ignoredEnvKeys: Array<{ key: string; reason: string }> = [];
  if (preferTrustedLocal) {
    const forcedLocalReason = tCli("Ignored because --yes quickstart forces trusted local loopback defaults");
    for (const key of [
      "PAPERCLIP_DEPLOYMENT_MODE",
      "PAPERCLIP_DEPLOYMENT_EXPOSURE",
      "PAPERCLIP_BIND",
      "PAPERCLIP_BIND_HOST",
      "HOST",
      "PAPERCLIP_AUTH_BASE_URL_MODE",
      "PAPERCLIP_AUTH_PUBLIC_BASE_URL",
      "PAPERCLIP_PUBLIC_URL",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_BASE_URL",
    ] as const) {
      if (process.env[key] !== undefined) {
        ignoredEnvKeys.push({ key, reason: forcedLocalReason });
      }
    }
  }
  if (deploymentMode === "local_trusted" && process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE !== undefined) {
    ignoredEnvKeys.push({
      key: "PAPERCLIP_DEPLOYMENT_EXPOSURE",
      reason: tCli("Ignored because deployment mode local_trusted always forces private exposure"),
    });
  }
  if (deploymentMode === "local_trusted" && process.env.PAPERCLIP_BIND !== undefined) {
    ignoredEnvKeys.push({
      key: "PAPERCLIP_BIND",
      reason: tCli("Ignored because deployment mode local_trusted always uses loopback reachability"),
    });
  }
  if (deploymentMode === "local_trusted" && process.env.PAPERCLIP_BIND_HOST !== undefined) {
    ignoredEnvKeys.push({
      key: "PAPERCLIP_BIND_HOST",
      reason: tCli("Ignored because deployment mode local_trusted always uses loopback reachability"),
    });
  }
  if (deploymentMode === "local_trusted" && process.env.HOST !== undefined) {
    ignoredEnvKeys.push({
      key: "HOST",
      reason: tCli("Ignored because deployment mode local_trusted always uses loopback reachability"),
    });
  }

  const ignoredKeySet = new Set(ignoredEnvKeys.map((entry) => entry.key));
  const usedEnvKeys = ONBOARD_ENV_KEYS.filter(
    (key) => process.env[key] !== undefined && !ignoredKeySet.has(key),
  );
  return { defaults, usedEnvKeys, ignoredEnvKeys };
}

function canCreateBootstrapInviteImmediately(config: Pick<PaperclipConfig, "database" | "server">): boolean {
  return config.server.deploymentMode === "authenticated" && config.database.mode !== "embedded-postgres";
}

export function isEphemeralNpxExecution(entrypoint = process.argv[1]): boolean {
  if (!entrypoint) return false;
  const normalized = entrypoint.replaceAll("\\", "/");
  return normalized.includes("/_npx/") || normalized.includes("/npm/_npx/");
}

function printManagedInstallHint(): void {
  const manifest = readInstallManifest();
  if (manifest && isManagedExecutable(process.argv[1], manifest)) return;
  if (!isEphemeralNpxExecution()) return;
  p.log.info(
    tCli("This npx run is temporary. Use {{value1}} for atomic updates, rollback, and service support.", { value1: String(pc.cyan("paperclipai install")) }),
  );
}

export async function onboard(opts: OnboardOptions): Promise<void> {
  if (opts.bind && !["loopback", "lan", "tailnet"].includes(opts.bind)) {
    throw new Error(tCli("Unsupported bind preset for onboard: {{value1}}. Use loopback, lan, or tailnet.", { value1: String(opts.bind) }));
  }

  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclipai onboard ")));
  const configPath = resolveConfigPath(opts.config);
  const instance = describeLocalInstancePaths(resolvePaperclipInstanceId());
  p.log.message(
    pc.dim(
      tCli("Local home: {{value1}} | instance: {{value2}} | config: {{value3}}", { value1: String(instance.homeDir), value2: String(instance.instanceId), value3: String(configPath) }),
    ),
  );

  let existingConfig: PaperclipConfig | null = null;
  let invalidBackupPath: string | undefined;
  if (configExists(opts.config)) {
    p.log.message(pc.dim(tCli("{{value1}} exists", { value1: String(configPath) })));

    try {
      existingConfig = readConfig(opts.config);
      for (const warning of findPaperclipConfigKeyWarnings(existingConfig)) {
        p.log.warn(tCli("Unknown config key {{value1}}; did you mean {{value2}}? It will be preserved.", { value1: String(warning.path), value2: String(warning.suggestion) }));
      }
    } catch (err) {
      const backupPath = backupInvalidConfig(opts.config);
      p.log.warn(
        tCli("Existing config is invalid. Preserved the original bytes at {{value1}}.\n{{value2}}", { value1: String(backupPath), value2: String(err instanceof Error ? err.message : String(err)) }),
      );

      const canConfirmRepair =
        opts.yes !== true &&
        opts.invokedByRun !== true &&
        process.stdin.isTTY === true &&
        process.stdout.isTTY === true;
      if (!canConfirmRepair) {
        p.log.error(
          tCli("Refusing to replace {{value1}} without confirmation. Rerun interactively to repair from defaults; the original and {{value2}} are unchanged.", { value1: String(configPath), value2: String(backupPath) }),
        );
        p.outro("");
        process.exitCode = 1;
        return;
      }

      const repair = await p.confirm({
        message: tCli("Repair from defaults? The invalid original is backed up at {{value1}}.", { value1: String(backupPath) }),
        initialValue: false,
      });
      if (p.isCancel(repair) || !repair) {
        p.cancel(tCli("Configuration left unchanged. Invalid backup: {{value1}}", { value1: String(backupPath) }));
        process.exitCode = 1;
        return;
      }
      invalidBackupPath = backupPath;
    }
  }

  if (existingConfig) {
    p.log.message(
      pc.dim(tCli("Existing Paperclip install detected; keeping the current configuration unchanged.")),
    );
    p.log.message(pc.dim(tCli("Use {{value1}} if you want to change settings.", { value1: String(pc.cyan("paperclipai configure")) })));

    const jwtSecret = ensureAgentJwtSecret(configPath);
    const envFilePath = resolveAgentJwtEnvFile(configPath);
    if (jwtSecret.created) {
      p.log.success(tCli("Created {{value1}} in {{value2}}", { value1: String(pc.cyan("PAPERCLIP_AGENT_JWT_SECRET")), value2: String(pc.dim(envFilePath)) }));
    } else if (process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim()) {
      p.log.info(tCli("Using existing {{value1}} from environment", { value1: String(pc.cyan("PAPERCLIP_AGENT_JWT_SECRET")) }));
    } else {
      p.log.info(tCli("Using existing {{value1}} in {{value2}}", { value1: String(pc.cyan("PAPERCLIP_AGENT_JWT_SECRET")), value2: String(pc.dim(envFilePath)) }));
    }
    const toolActionSigningSecret = ensureToolActionSigningSecret(configPath);
    if (toolActionSigningSecret.created) {
      p.log.success(tCli("Created {{value1}} in {{value2}}", { value1: String(pc.cyan("PAPERCLIP_TOOL_ACTION_SIGNING_SECRET")), value2: String(pc.dim(envFilePath)) }));
    }

    const keyResult = ensureLocalSecretsKeyFile(existingConfig, configPath);
    if (keyResult.status === "created") {
      p.log.success(tCli("Created local secrets key file at {{value1}}", { value1: String(pc.dim(keyResult.path)) }));
    } else if (keyResult.status === "existing") {
      p.log.message(pc.dim(tCli("Using existing local secrets key file at {{value1}}", { value1: String(keyResult.path) })));
    }

    p.note(
      [
        tCli("Existing config preserved"),
        tCli("Database: {{value1}}", { value1: tCli(String(existingConfig.database.mode)) }),
        existingConfig.llm ? tCli("LLM: {{value1}}", { value1: String(existingConfig.llm.provider) }) : tCli("LLM: not configured"),
        tCli("Logging: {{value1}} -> {{value2}}", { value1: tCli(String(existingConfig.logging.mode)), value2: String(existingConfig.logging.logDir) }),
        tCli("Server: {{value1}}/{{value2}} @ {{value3}}", { value1: tCli(String(existingConfig.server.deploymentMode)), value2: tCli(String(existingConfig.server.exposure)), value3: String(describeServerBinding(existingConfig.server)) }),
        tCli("Allowed hosts: {{value1}}", { value1: String(existingConfig.server.allowedHostnames.length > 0 ? existingConfig.server.allowedHostnames.join(", ") : tCli("(loopback only)")) }),
        tCli("Auth URL mode: {{value1}}{{value2}}", { value1: tCli(String(existingConfig.auth.baseUrlMode)), value2: String(existingConfig.auth.publicBaseUrl ? ` (${existingConfig.auth.publicBaseUrl})` : "") }),
        tCli("Storage: {{value1}}", { value1: tCli(String(existingConfig.storage.provider)) }),
        tCli("Secrets: {{value1}} (strict mode {{value2}})", { value1: tCli(String(existingConfig.secrets.provider)), value2: String(existingConfig.secrets.strictMode ? tCli("on") : tCli("off")) }),
        tCli("Agent auth: PAPERCLIP_AGENT_JWT_SECRET configured"),
      ].join("\n"),
      tCli("Configuration ready"),
    );

    p.note(
      [
        tCli("Run: {{value1}}", { value1: String(pc.cyan("paperclipai run")) }),
        tCli("Reconfigure later: {{value1}}", { value1: String(pc.cyan("paperclipai configure")) }),
        tCli("Diagnose setup: {{value1}}", { value1: String(pc.cyan("paperclipai doctor")) }),
      ].join("\n"),
      tCli("Next commands"),
    );

    printManagedInstallHint();
    const serviceInstalled = await handleOnboardService(opts);
    if (serviceInstalled) {
      await handoffToOnboardedService(existingConfig);
    }

    let shouldRunNow = !serviceInstalled && (opts.run === true || opts.yes === true);
    if (shouldOfferForegroundStart({ serviceInstalled, startAlreadyDecided: shouldRunNow, invokedByRun: opts.invokedByRun === true, interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) })) {
      const answer = await p.confirm({
        message: tCli("Start Paperclip now?"),
        initialValue: true,
      });
      if (!p.isCancel(answer)) {
        shouldRunNow = answer;
      }
    }

    if (shouldRunNow && !opts.invokedByRun) {
      await runOnboardedForeground(configPath);
      return;
    }

    p.outro(tCli("Existing Paperclip setup is ready."));
    return;
  }

  let setupMode: SetupMode = "quickstart";
  if (opts.yes) {
    p.log.message(
      pc.dim(
        opts.bind
          ? tCli("`--yes` enabled: using Quickstart defaults with bind={{value1}}.", { value1: String(opts.bind) })
          : tCli("`--yes` enabled: using Quickstart defaults."),
      ),
    );
  } else {
    const setupModeChoice = await p.select({
      message: tCli("Choose setup path"),
      options: [
        {
          value: "quickstart" as const,
          label: tCli("Quickstart"),
          hint: tCli("Recommended: local defaults + ready to run"),
        },
        {
          value: "advanced" as const,
          label: tCli("Advanced setup"),
          hint: tCli("Customize database, server, storage, and more"),
        },
      ],
      initialValue: "quickstart",
    });
    if (p.isCancel(setupModeChoice)) {
      p.cancel(tCli("Setup cancelled."));
      return;
    }
    setupMode = setupModeChoice as SetupMode;
  }

  const tc = getTelemetryClient();
  if (tc) trackInstallStarted(tc);

  let llm: PaperclipConfig["llm"] | undefined;
  const { defaults: derivedDefaults, usedEnvKeys, ignoredEnvKeys } = quickstartDefaultsFromEnv({
    preferTrustedLocal: opts.yes === true && !opts.bind,
  });
  let {
    database,
    logging,
    server,
    auth,
    storage,
    secrets,
  } = derivedDefaults;

  if (opts.bind === "loopback" || opts.bind === "lan" || opts.bind === "tailnet") {
    const preset = buildPresetServerConfig(opts.bind, {
      port: server.port,
      allowedHostnames: server.allowedHostnames,
      serveUi: server.serveUi,
    });
    server = preset.server;
    auth = preset.auth;
    if (opts.bind === "tailnet" && server.host === "127.0.0.1") {
      p.log.warn(TAILNET_BIND_WARNING);
    }
  }

  if (setupMode === "advanced") {
    p.log.step(pc.bold(tCli("Database")));
    database = await promptDatabase(database);

    if (database.mode === "postgres" && database.connectionString) {
      const s = p.spinner();
      s.start(tCli("Testing database connection..."));
      try {
        const { createDb } = await import("@paperclipai/db");
        const db = createDb(database.connectionString);
        await db.execute("SELECT 1");
        s.stop(tCli("Database connection successful"));
      } catch {
        s.stop(pc.yellow(tCli("Could not connect to database — you can fix this later with `paperclipai doctor`")));
      }
    }

    p.log.step(pc.bold(tCli("LLM Provider")));
    llm = await promptLlm();

    if (llm?.apiKey) {
      const s = p.spinner();
      s.start(tCli("Validating API key..."));
      try {
        if (llm.provider === "claude") {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": llm.apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (res.ok || res.status === 400) {
            s.stop(tCli("API key is valid"));
          } else if (res.status === 401) {
            s.stop(pc.yellow(tCli("API key appears invalid — you can update it later")));
          } else {
            s.stop(pc.yellow(tCli("Could not validate API key — continuing anyway")));
          }
        } else {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${llm.apiKey}` },
          });
          if (res.ok) {
            s.stop(tCli("API key is valid"));
          } else if (res.status === 401) {
            s.stop(pc.yellow(tCli("API key appears invalid — you can update it later")));
          } else {
            s.stop(pc.yellow(tCli("Could not validate API key — continuing anyway")));
          }
        }
      } catch {
        s.stop(pc.yellow(tCli("Could not reach API — continuing anyway")));
      }
    }

    p.log.step(pc.bold(tCli("Logging")));
    logging = await promptLogging();

    p.log.step(pc.bold(tCli("Server")));
    ({ server, auth } = await promptServer({ currentServer: server, currentAuth: auth }));

    p.log.step(pc.bold(tCli("Storage")));
    storage = await promptStorage(storage);

    p.log.step(pc.bold(tCli("Secrets")));
    const secretsDefaults = defaultSecretsConfig();
    secrets = {
      provider: secrets.provider ?? secretsDefaults.provider,
      strictMode: secrets.strictMode ?? secretsDefaults.strictMode,
      localEncrypted: {
        keyFilePath: secrets.localEncrypted?.keyFilePath ?? secretsDefaults.localEncrypted.keyFilePath,
      },
    };
    p.log.message(
      pc.dim(
        tCli("Using defaults: provider={{value1}}, strictMode={{value2}}, keyFile={{value3}}", { value1: tCli(String(secrets.provider)), value2: String(secrets.strictMode), value3: String(secrets.localEncrypted.keyFilePath) }),
      ),
    );
  } else {
    p.log.step(pc.bold(tCli("Quickstart")));
    p.log.message(
      pc.dim(
        opts.bind
          ? tCli("Using quickstart defaults with bind={{value1}}.", { value1: String(opts.bind) })
          : tCli("Using quickstart defaults: {{value1}}/{{value2}} @ {{value3}}.", { value1: tCli(String(server.deploymentMode)), value2: tCli(String(server.exposure)), value3: String(describeServerBinding(server)) }),
      ),
    );
    if (usedEnvKeys.length > 0) {
      p.log.message(pc.dim(tCli("Environment-aware defaults active ({{value1}} env var(s) detected).", { value1: String(usedEnvKeys.length) })));
    } else {
      p.log.message(
        pc.dim(tCli("No environment overrides detected: embedded database, file storage, local encrypted secrets.")),
      );
    }
    for (const ignored of ignoredEnvKeys) {
      p.log.message(pc.dim(tCli("Ignored {{value1}}: {{value2}}", { value1: String(ignored.key), value2: String(ignored.reason) })));
    }
  }

  const jwtSecret = ensureAgentJwtSecret(configPath);
  const envFilePath = resolveAgentJwtEnvFile(configPath);
  if (jwtSecret.created) {
    p.log.success(tCli("Created {{value1}} in {{value2}}", { value1: String(pc.cyan("PAPERCLIP_AGENT_JWT_SECRET")), value2: String(pc.dim(envFilePath)) }));
  } else if (process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim()) {
    p.log.info(tCli("Using existing {{value1}} from environment", { value1: String(pc.cyan("PAPERCLIP_AGENT_JWT_SECRET")) }));
  } else {
    p.log.info(tCli("Using existing {{value1}} in {{value2}}", { value1: String(pc.cyan("PAPERCLIP_AGENT_JWT_SECRET")), value2: String(pc.dim(envFilePath)) }));
  }
  const toolActionSigningSecret = ensureToolActionSigningSecret(configPath);
  if (toolActionSigningSecret.created) {
    p.log.success(tCli("Created {{value1}} in {{value2}}", { value1: String(pc.cyan("PAPERCLIP_TOOL_ACTION_SIGNING_SECRET")), value2: String(pc.dim(envFilePath)) }));
  }

  const config: PaperclipConfig = {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "onboard",
    },
    ...(llm && { llm }),
    database,
    logging,
    server,
    auth,
    telemetry: {
      enabled: true,
    },
    storage,
    secrets,
  };

  const keyResult = ensureLocalSecretsKeyFile(config, configPath);
  if (keyResult.status === "created") {
    p.log.success(tCli("Created local secrets key file at {{value1}}", { value1: String(pc.dim(keyResult.path)) }));
  } else if (keyResult.status === "existing") {
    p.log.message(pc.dim(tCli("Using existing local secrets key file at {{value1}}", { value1: String(keyResult.path) })));
  }

  writeConfig(config, opts.config, {
    invalidBackupPath,
  });

  if (tc) trackInstallCompleted(tc, {
    adapterType: server.deploymentMode,
  });

  p.note(
    [
      tCli("Database: {{value1}}", { value1: tCli(String(database.mode)) }),
      llm ? tCli("LLM: {{value1}}", { value1: String(llm.provider) }) : tCli("LLM: not configured"),
      tCli("Logging: {{value1}} -> {{value2}}", { value1: tCli(String(logging.mode)), value2: String(logging.logDir) }),
      tCli("Server: {{value1}}/{{value2}} @ {{value3}}", { value1: tCli(String(server.deploymentMode)), value2: tCli(String(server.exposure)), value3: String(describeServerBinding(server)) }),
      tCli("Allowed hosts: {{value1}}", { value1: String(server.allowedHostnames.length > 0 ? server.allowedHostnames.join(", ") : tCli("(loopback only)")) }),
      tCli("Auth URL mode: {{value1}}{{value2}}", { value1: tCli(String(auth.baseUrlMode)), value2: String(auth.publicBaseUrl ? ` (${auth.publicBaseUrl})` : "") }),
      tCli("Storage: {{value1}}", { value1: tCli(String(storage.provider)) }),
      tCli("Secrets: {{value1}} (strict mode {{value2}})", { value1: tCli(String(secrets.provider)), value2: String(secrets.strictMode ? tCli("on") : tCli("off")) }),
      tCli("Agent auth: PAPERCLIP_AGENT_JWT_SECRET configured"),
    ].join("\n"),
    tCli("Configuration saved"),
  );

  p.note(
    [
      tCli("Run: {{value1}}", { value1: String(pc.cyan("paperclipai run")) }),
      tCli("Reconfigure later: {{value1}}", { value1: String(pc.cyan("paperclipai configure")) }),
      tCli("Diagnose setup: {{value1}}", { value1: String(pc.cyan("paperclipai doctor")) }),
    ].join("\n"),
    tCli("Next commands"),
  );

  printManagedInstallHint();

  if (canCreateBootstrapInviteImmediately({ database, server })) {
    p.log.step(tCli("Generating bootstrap CEO invite"));
    await bootstrapCeoInvite({ config: configPath });
  }

  const serviceInstalled = await handleOnboardService(opts);
  if (serviceInstalled) {
    await handoffToOnboardedService(config);
  }

  let shouldRunNow = !serviceInstalled && (opts.run === true || opts.yes === true);
  if (shouldOfferForegroundStart({ serviceInstalled, startAlreadyDecided: shouldRunNow, invokedByRun: opts.invokedByRun === true, interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) })) {
    const answer = await p.confirm({
      message: tCli("Start Paperclip now?"),
      initialValue: true,
    });
    if (!p.isCancel(answer)) {
      shouldRunNow = answer;
    }
  }

  if (shouldRunNow && !opts.invokedByRun) {
    await runOnboardedForeground(configPath);
    return;
  }

  if (server.deploymentMode === "authenticated" && database.mode === "embedded-postgres") {
    p.log.info(
      [
        tCli("Bootstrap CEO invite will be created after the server starts."),
        tCli("Next: {{value1}}", { value1: String(pc.cyan("paperclipai run")) }),
        tCli("Then: {{value1}}", { value1: String(pc.cyan("paperclipai auth bootstrap-ceo")) }),
      ].join("\n"),
    );
  }

  p.outro(tCli("You're all set!"));
}
