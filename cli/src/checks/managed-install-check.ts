import { tCli, translateCliDisplayMessage } from "../i18n.js";
import fs from "node:fs";
import path from "node:path";
import {
  MANAGED_SHIM_MARKER,
  readInstallManifest,
  resolveInstallStorePaths,
  type InstallStorePaths,
} from "../install-store.js";
import type { CheckResult } from "./index.js";
import { isSupportedNodeVersion, MINIMUM_NODE_VERSION } from "@paperclipai/shared/node-version";

function pathContains(directory: string): boolean {
  const normalized = path.resolve(directory);
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => path.resolve(entry) === normalized);
}

function hasManagedArtifacts(paths: InstallStorePaths): boolean {
  const persistentArtifacts = [
    paths.manifestPath,
    paths.markerPath,
    paths.currentPath,
    paths.shimPath,
  ].some((entry) => fs.existsSync(entry));
  if (persistentArtifacts) return true;
  try {
    return fs.readdirSync(paths.installsRoot).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    return true;
  }
}

export function nodeRuntimeCheck(): CheckResult {
  return isSupportedNodeVersion(process.versions.node)
    ? { name: tCli("Node.js runtime"), status: "pass", message: tCli("Node.js {{node}}", { node: String(process.versions.node) }) }
    : {
        name: tCli("Node.js runtime"),
        status: "fail",
        message: tCli("Node.js {{node}} is unsupported", { node: String(process.versions.node) }),
        repairHint: tCli("Install Node.js {{MINIMUM_NODE_VERSION}} or newer before installing or running Paperclip", { MINIMUM_NODE_VERSION: String(MINIMUM_NODE_VERSION) }),
      };
}

export function managedInstallChecks(
  paths = resolveInstallStorePaths(),
): CheckResult[] {
  if (!hasManagedArtifacts(paths)) {
    return [
      {
        name: tCli("Managed install"),
        status: "pass",
        message: tCli("Not present (optional for npx, global npm, and source-checkout usage)"),
      },
    ];
  }

  let manifest;
  try {
    manifest = readInstallManifest(paths);
  } catch (error) {
    return [
      {
        name: tCli("Managed install manifest"),
        status: "fail",
        message: translateCliDisplayMessage(error instanceof Error ? error.message : String(error)),
        repairHint: tCli("Re-run `paperclipai install` to rebuild the managed install metadata"),
      },
    ];
  }

  if (!manifest) {
    return [
      {
        name: tCli("Managed install manifest"),
        status: "fail",
        message: tCli("Managed install artifacts exist but {{manifestPath}} is missing", { manifestPath: String(paths.manifestPath) }),
        repairHint: tCli("Re-run `paperclipai install`"),
      },
    ];
  }

  const results: CheckResult[] = [];
  const payloadPath = path.resolve(manifest.payloadPath);
  const relativePayload = path.relative(paths.installsRoot, payloadPath);
  const payloadInStore = Boolean(relativePayload) && !relativePayload.startsWith("..") && !path.isAbsolute(relativePayload);
  const payloadExists = payloadInStore && fs.existsSync(payloadPath) && fs.statSync(payloadPath).isDirectory();
  let currentMatches = false;
  try {
    currentMatches = fs.lstatSync(paths.currentPath).isSymbolicLink()
      && fs.realpathSync(paths.currentPath) === fs.realpathSync(payloadPath);
  } catch {
    currentMatches = false;
  }

  results.push(
    payloadExists && currentMatches
      ? {
          name: tCli("Managed install store"),
          status: "pass",
          message: tCli("{{source}} {{version}} is active", { source: String(manifest.source), version: String(manifest.version) }),
        }
      : {
          name: tCli("Managed install store"),
          status: "fail",
          message: !payloadExists
            ? tCli("Manifest payload is missing or outside the install store: {{payloadPath}}", { payloadPath: String(manifest.payloadPath) })
            : tCli("Current link does not point to {{payloadPath}}", { payloadPath: String(manifest.payloadPath) }),
          repairHint: tCli("Re-run `paperclipai install` or roll back to a retained payload"),
        },
  );

  let shimValid = false;
  try {
    shimValid = fs.readFileSync(paths.shimPath, "utf8").includes(MANAGED_SHIM_MARKER);
  } catch {
    shimValid = false;
  }
  results.push(
    shimValid
      ? { name: tCli("Managed install shim"), status: "pass", message: paths.shimPath }
      : {
          name: tCli("Managed install shim"),
          status: "fail",
          message: tCli("Missing or unrecognized shim at {{shimPath}}", { shimPath: String(paths.shimPath) }),
          repairHint: tCli("Re-run `paperclipai install`"),
        },
  );

  const shimDirectory = path.dirname(paths.shimPath);
  results.push(
    pathContains(shimDirectory)
      ? { name: tCli("Managed install PATH"), status: "pass", message: tCli("{{shimDirectory}} is on PATH", { shimDirectory: String(shimDirectory) }) }
      : {
          name: tCli("Managed install PATH"),
          status: "warn",
          message: tCli("{{shimDirectory}} is not on PATH", { shimDirectory: String(shimDirectory) }),
          repairHint: tCli("Run `export PATH=\"$HOME/.local/bin:$PATH\"` and add it to your shell startup file"),
        },
  );

  const retained = new Set(
    [manifest, ...manifest.previous].map((record) => path.resolve(record.payloadPath)),
  );
  const orphaned: string[] = [];
  for (const source of ["npm", "git"] as const) {
    const sourceRoot = path.join(paths.installsRoot, source);
    if (!fs.existsSync(sourceRoot)) continue;
    for (const entry of fs.readdirSync(sourceRoot)) {
      const candidate = path.join(sourceRoot, entry);
      if (!entry.startsWith(".") && !retained.has(path.resolve(candidate))) orphaned.push(candidate);
    }
  }
  results.push(
    orphaned.length === 0
      ? { name: tCli("Managed install retention"), status: "pass", message: tCli("No orphaned payloads") }
      : {
          name: tCli("Managed install retention"),
          status: "warn",
          message: tCli(orphaned.length === 1 ? "{{count}} orphaned payload found" : "{{count}} orphaned payloads found", { count: orphaned.length }),
          repairHint: tCli("A successful `paperclipai update` prunes unretained payloads"),
        },
  );

  return results;
}
