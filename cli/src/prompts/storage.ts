import { tCli } from "../i18n.js";
import * as p from "@clack/prompts";
import type { StorageConfig } from "../config/schema.js";
import { resolveDefaultStorageDir, resolvePaperclipInstanceId } from "../config/home.js";

function defaultStorageBaseDir(): string {
  return resolveDefaultStorageDir(resolvePaperclipInstanceId());
}

export function defaultStorageConfig(): StorageConfig {
  return {
    provider: "local_disk",
    localDisk: {
      baseDir: defaultStorageBaseDir(),
    },
    s3: {
      bucket: "paperclip",
      region: "us-east-1",
      endpoint: undefined,
      prefix: "",
      forcePathStyle: false,
    },
  };
}

export async function promptStorage(current?: StorageConfig): Promise<StorageConfig> {
  const base = current ?? defaultStorageConfig();

  const provider = await p.select({
    message: tCli("Storage provider"),
    options: [
      {
        value: "local_disk" as const,
        label: tCli("Local disk (recommended)"),
        hint: tCli("best for single-user local deployments"),
      },
      {
        value: "s3" as const,
        label: tCli("S3 compatible"),
        hint: tCli("for cloud/object storage backends"),
      },
    ],
    initialValue: base.provider,
  });

  if (p.isCancel(provider)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  if (provider === "local_disk") {
    const baseDir = await p.text({
      message: tCli("Local storage base directory"),
      defaultValue: base.localDisk.baseDir || defaultStorageBaseDir(),
      placeholder: defaultStorageBaseDir(),
      validate: (value) => {
        if (!value || value.trim().length === 0) return tCli("Storage base directory is required");
      },
    });

    if (p.isCancel(baseDir)) {
      p.cancel(tCli("Setup cancelled."));
      process.exit(0);
    }

    return {
      provider: "local_disk",
      localDisk: {
        baseDir: baseDir.trim(),
      },
      s3: base.s3,
    };
  }

  const bucket = await p.text({
    message: tCli("S3 bucket"),
    defaultValue: base.s3.bucket || "paperclip",
    placeholder: "paperclip",
    validate: (value) => {
      if (!value || value.trim().length === 0) return tCli("Bucket is required");
    },
  });

  if (p.isCancel(bucket)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const region = await p.text({
    message: tCli("S3 region"),
    defaultValue: base.s3.region || "us-east-1",
    placeholder: "us-east-1",
    validate: (value) => {
      if (!value || value.trim().length === 0) return tCli("Region is required");
    },
  });

  if (p.isCancel(region)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const endpoint = await p.text({
    message: tCli("S3 endpoint (optional for compatible backends)"),
    defaultValue: base.s3.endpoint ?? "",
    placeholder: "https://s3.amazonaws.com",
  });

  if (p.isCancel(endpoint)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const prefix = await p.text({
    message: tCli("Object key prefix (optional)"),
    defaultValue: base.s3.prefix ?? "",
    placeholder: "paperclip/",
  });

  if (p.isCancel(prefix)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const forcePathStyle = await p.confirm({
    message: tCli("Use S3 path-style URLs?"),
    initialValue: base.s3.forcePathStyle ?? false,
  });

  if (p.isCancel(forcePathStyle)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  return {
    provider: "s3",
    localDisk: base.localDisk,
    s3: {
      bucket: bucket.trim(),
      region: region.trim(),
      endpoint: endpoint.trim() || undefined,
      prefix: prefix.trim(),
      forcePathStyle,
    },
  };
}

