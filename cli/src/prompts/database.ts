import { tCli } from "../i18n.js";
import * as p from "@clack/prompts";
import type { DatabaseConfig } from "../config/schema.js";
import {
  resolveDefaultBackupDir,
  resolveDefaultEmbeddedPostgresDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";

export async function promptDatabase(current?: DatabaseConfig): Promise<DatabaseConfig> {
  const instanceId = resolvePaperclipInstanceId();
  const defaultEmbeddedDir = resolveDefaultEmbeddedPostgresDir(instanceId);
  const defaultBackupDir = resolveDefaultBackupDir(instanceId);
  const base: DatabaseConfig = current ?? {
    mode: "embedded-postgres",
    embeddedPostgresDataDir: defaultEmbeddedDir,
    embeddedPostgresPort: 54329,
    backup: {
      enabled: true,
      intervalMinutes: 60,
      retentionDays: 30,
      dir: defaultBackupDir,
    },
  };

  const mode = await p.select({
    message: tCli("Database mode"),
    options: [
      { value: "embedded-postgres" as const, label: tCli("Embedded PostgreSQL (managed locally)"), hint: tCli("recommended") },
      { value: "postgres" as const, label: tCli("PostgreSQL (external server)") },
    ],
    initialValue: base.mode,
  });

  if (p.isCancel(mode)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  let connectionString: string | undefined = base.connectionString;
  let embeddedPostgresDataDir = base.embeddedPostgresDataDir || defaultEmbeddedDir;
  let embeddedPostgresPort = base.embeddedPostgresPort || 54329;

  if (mode === "postgres") {
    const value = await p.text({
      message: tCli("PostgreSQL connection string"),
      defaultValue: base.connectionString ?? "",
      placeholder: "postgres://user:pass@localhost:5432/paperclip",
      validate: (val) => {
        if (!val) return tCli("Connection string is required for PostgreSQL mode");
        if (!val.startsWith("postgres")) return tCli("Must be a postgres:// or postgresql:// URL");
      },
    });

    if (p.isCancel(value)) {
      p.cancel(tCli("Setup cancelled."));
      process.exit(0);
    }

    connectionString = value;
  } else {
    const dataDir = await p.text({
      message: tCli("Embedded PostgreSQL data directory"),
      defaultValue: base.embeddedPostgresDataDir || defaultEmbeddedDir,
      placeholder: defaultEmbeddedDir,
    });

    if (p.isCancel(dataDir)) {
      p.cancel(tCli("Setup cancelled."));
      process.exit(0);
    }

    embeddedPostgresDataDir = dataDir || defaultEmbeddedDir;

    const portValue = await p.text({
      message: tCli("Embedded PostgreSQL port"),
      defaultValue: String(base.embeddedPostgresPort || 54329),
      placeholder: "54329",
      validate: (val) => {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1 || n > 65535) return tCli("Port must be an integer between 1 and 65535");
      },
    });

    if (p.isCancel(portValue)) {
      p.cancel(tCli("Setup cancelled."));
      process.exit(0);
    }

    embeddedPostgresPort = Number(portValue || "54329");
    connectionString = undefined;
  }

  const backupEnabled = await p.confirm({
    message: tCli("Enable automatic database backups?"),
    initialValue: base.backup.enabled,
  });
  if (p.isCancel(backupEnabled)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const backupDirInput = await p.text({
    message: tCli("Backup directory"),
    defaultValue: base.backup.dir || defaultBackupDir,
    placeholder: defaultBackupDir,
    validate: (val) => (!val || val.trim().length === 0 ? tCli("Backup directory is required") : undefined),
  });
  if (p.isCancel(backupDirInput)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const backupIntervalInput = await p.text({
    message: tCli("Backup interval (minutes)"),
    defaultValue: String(base.backup.intervalMinutes || 60),
    placeholder: "60",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) return tCli("Interval must be a positive integer");
      if (n > 10080) return tCli("Interval must be 10080 minutes (7 days) or less");
      return undefined;
    },
  });
  if (p.isCancel(backupIntervalInput)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const backupRetentionInput = await p.text({
    message: tCli("Backup retention (days)"),
    defaultValue: String(base.backup.retentionDays || 30),
    placeholder: "30",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) return tCli("Retention must be a positive integer");
      if (n > 3650) return tCli("Retention must be 3650 days or less");
      return undefined;
    },
  });
  if (p.isCancel(backupRetentionInput)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  return {
    mode,
    connectionString,
    embeddedPostgresDataDir,
    embeddedPostgresPort,
    backup: {
      enabled: backupEnabled,
      intervalMinutes: Number(backupIntervalInput || "60"),
      retentionDays: Number(backupRetentionInput || "30"),
      dir: backupDirInput || defaultBackupDir,
    },
  };
}
