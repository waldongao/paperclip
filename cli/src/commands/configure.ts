import { tCli } from "../i18n.js";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  backupInvalidConfig,
  readConfig,
  writeConfig,
  configExists,
  resolveConfigPath,
} from "../config/store.js";
import {
  findPaperclipConfigKeyWarnings,
  type PaperclipConfig,
} from "../config/schema.js";
import { ensureLocalSecretsKeyFile } from "../config/secrets-key.js";
import { promptDatabase } from "../prompts/database.js";
import { promptLlm } from "../prompts/llm.js";
import { promptLogging } from "../prompts/logging.js";
import { defaultSecretsConfig, promptSecrets } from "../prompts/secrets.js";
import { defaultStorageConfig, promptStorage } from "../prompts/storage.js";
import { promptServer } from "../prompts/server.js";
import {
  resolveDefaultBackupDir,
  resolveDefaultEmbeddedPostgresDir,
  resolveDefaultLogsDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

type Section = "llm" | "database" | "logging" | "server" | "storage" | "secrets";

const SECTION_LABELS: Record<Section, string> = {
  llm: tCli("LLM Provider"),
  database: tCli("Database"),
  logging: tCli("Logging"),
  server: tCli("Server"),
  storage: tCli("Storage"),
  secrets: tCli("Secrets"),
};

function defaultConfig(): PaperclipConfig {
  const instanceId = resolvePaperclipInstanceId();
  return {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "configure",
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(instanceId),
      embeddedPostgresPort: 54329,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: resolveDefaultBackupDir(instanceId),
      },
    },
    logging: {
      mode: "file",
      logDir: resolveDefaultLogsDir(instanceId),
    },
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      bind: "loopback",
      host: "127.0.0.1",
      port: 3100,
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
    storage: defaultStorageConfig(),
    secrets: defaultSecretsConfig(),
  };
}

export async function configure(opts: {
  config?: string;
  section?: string;
}): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclip configure ")));
  const configPath = resolveConfigPath(opts.config);

  if (!configExists(opts.config)) {
    p.log.error(tCli("No config file found. Run `paperclipai onboard` first."));
    p.outro("");
    process.exitCode = 1;
    return;
  }

  let config: PaperclipConfig;
  let invalidBackupPath: string | undefined;
  try {
    config = readConfig(opts.config) ?? defaultConfig();
    for (const warning of findPaperclipConfigKeyWarnings(config)) {
      p.log.warn(tCli("Unknown config key {{value1}}; did you mean {{value2}}? It will be preserved.", { value1: String(warning.path), value2: String(warning.suggestion) }));
    }
  } catch (err) {
    const backupPath = backupInvalidConfig(opts.config);
    p.log.warn(
      tCli("Existing config is invalid. Preserved the original bytes at {{value1}}.\n{{value2}}", { value1: String(backupPath), value2: String(err instanceof Error ? err.message : String(err)) }),
    );

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
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

    config = defaultConfig();
    invalidBackupPath = backupPath;
  }

  let section: Section | undefined = opts.section as Section | undefined;

  if (section && !SECTION_LABELS[section]) {
    p.log.error(tCli("Unknown section: {{value1}}. Choose from: {{value2}}", { value1: String(section), value2: String(Object.keys(SECTION_LABELS).join(", ")) }));
    p.outro("");
    process.exitCode = 1;
    return;
  }

  // Section selection loop
  let continueLoop = true;
  while (continueLoop) {
    if (!section) {
      const choice = await p.select({
        message: tCli("Which section do you want to configure?"),
        options: Object.entries(SECTION_LABELS).map(([value, label]) => ({
          value: value as Section,
          label,
        })),
      });

      if (p.isCancel(choice)) {
        p.cancel(tCli("Configuration cancelled."));
        return;
      }

      section = choice;
    }

    p.log.step(pc.bold(SECTION_LABELS[section]));

    switch (section) {
      case "database":
        config.database = await promptDatabase(config.database);
        break;
      case "llm": {
        const llm = await promptLlm();
        if (llm) {
          config.llm = llm;
        } else {
          delete config.llm;
        }
        break;
      }
      case "logging":
        config.logging = await promptLogging();
        break;
      case "server":
        {
          const { server, auth } = await promptServer({
            currentServer: config.server,
            currentAuth: config.auth,
          });
          config.server = server;
          config.auth = auth;
        }
        break;
      case "storage":
        config.storage = await promptStorage(config.storage);
        break;
      case "secrets":
        config.secrets = await promptSecrets(config.secrets);
        {
          const keyResult = ensureLocalSecretsKeyFile(config, configPath);
          if (keyResult.status === "created") {
            p.log.success(tCli("Created local secrets key file at {{value1}}", { value1: String(pc.dim(keyResult.path)) }));
          } else if (keyResult.status === "existing") {
            p.log.message(pc.dim(tCli("Using existing local secrets key file at {{value1}}", { value1: String(keyResult.path) })));
          } else if (keyResult.status === "skipped_provider") {
            p.log.message(pc.dim(tCli("Skipping local key file management for non-local provider")));
          } else {
            p.log.message(pc.dim(tCli("Skipping local key file management because PAPERCLIP_SECRETS_MASTER_KEY is set")));
          }
        }
        break;
    }

    config.$meta.updatedAt = new Date().toISOString();
    config.$meta.source = "configure";

    const written = writeConfig(config, opts.config, {
      invalidBackupPath,
    });
    invalidBackupPath = undefined;
    if (written) {
      p.log.success(tCli("{{value1}} configuration updated.", { value1: String(SECTION_LABELS[section]) }));
    } else {
      p.log.message(pc.dim(tCli("{{value1}} configuration unchanged.", { value1: String(SECTION_LABELS[section]) })));
    }

    // If section was provided via CLI flag, don't loop
    if (opts.section) {
      continueLoop = false;
    } else {
      const another = await p.confirm({
        message: tCli("Configure another section?"),
        initialValue: false,
      });

      if (p.isCancel(another) || !another) {
        continueLoop = false;
      } else {
        section = undefined; // Reset to show picker again
      }
    }
  }

  p.outro(tCli("Configuration saved."));
}
