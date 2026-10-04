import { tCli } from "../i18n.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { buildNextManifest, flipCurrentAtomic, isManagedExecutable, pruneInstallPayloads, readInstallManifest, resolveInstallStorePaths, withInstallStoreLock, writeInstallManifestAtomic, type InstallChannel, type InstallManifest, type InstallRecord, type InstallStorePaths } from "../install-store.js";
import { dbBackupCommand } from "./db-backup.js";
import { installGitPayload, installNpmPayload, PUBLIC_NPM_REGISTRY, resolveGitHubRef, resolvePublishedVersion, type CommandRunner } from "./install.js";
import { resolvePaperclipInstanceId, resolvePaperclipInstanceRoot } from "../config/home.js";
import { resolveConfigPath } from "../config/store.js";
import { detectServiceManager } from "../services/service-manager.js";
import { restartManagedService } from "./service.js";
import { packageVersion } from "../version.js";

const execFileAsync = promisify(execFile);
export type InstallMode = "managed" | "global-npm" | "npx" | "source" | "unknown";
export type UpdateOptions = { canary?: boolean; latest?: boolean; version?: string; rollback?: boolean; check?: boolean; dryRun?: boolean; json?: boolean; yes?: boolean; backup?: boolean };
type Dependencies = { executablePath: string; runCommand: CommandRunner; backup: () => Promise<void>; confirm: (message: string) => Promise<boolean>; now: () => Date; paths: InstallStorePaths; restartActiveService: (expectedVersion: string) => Promise<boolean>; hasInstanceData: () => boolean };

const DATABASE_UNREACHABLE_CODES = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT"]);

function hasPaperclipInstanceData(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
    || fs.existsSync(resolveConfigPath())
    || fs.existsSync(resolvePaperclipInstanceRoot());
}

function isDatabaseUnreachableError(error: unknown): boolean {
  const pending = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || current === undefined || seen.has(current)) continue;
    seen.add(current);
    if (typeof current === "string") {
      if (/\b(?:ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT)\b|connection refused/i.test(current)) return true;
      continue;
    }
    if (typeof current !== "object") continue;
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string" && DATABASE_UNREACHABLE_CODES.has(record.code)) return true;
    if (typeof record.message === "string" && /\b(?:ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT)\b|connection refused/i.test(record.message)) return true;
    if (record.cause !== undefined) pending.push(record.cause);
    if (Array.isArray(record.errors)) pending.push(...record.errors);
  }
  return false;
}

async function runPreUpdateBackup(options: UpdateOptions, backup: () => Promise<void>, hasInstanceData = hasPaperclipInstanceData): Promise<void> {
  if (!hasInstanceData()) {
    const message = tCli("Skipping the pre-update backup because this Paperclip instance has not been onboarded and has no data to back up.");
    if (options.json) console.error(message); else console.log(pc.yellow(message));
    return;
  }
  try {
    await backup();
  } catch (error) {
    if (isDatabaseUnreachableError(error)) {
      throw new Error(
        tCli("The Paperclip database is not running or reachable, so the pre-update backup cannot be taken. Start the service with `paperclipai service start` and retry, or skip the backup with `paperclipai update --no-backup`."),
        { cause: error },
      );
    }
    throw error;
  }
}

async function restartActiveManagedService(expectedVersion: string): Promise<boolean> {
  const instanceId = resolvePaperclipInstanceId();
  const detection = await detectServiceManager({ instanceId });
  if (!detection.supported || !(await detection.manager.status()).active) return false;
  await restartManagedService({ instanceId, expectedVersion });
  return true;
}

export function detectInstallMode(executablePath = process.argv[1] ?? "", paths = resolveInstallStorePaths()): InstallMode {
  const resolved = path.resolve(executablePath || ".");
  const manifest = readInstallManifest(paths);
  if (manifest && isManagedExecutable(resolved, manifest, paths)) return "managed";
  const normalized = resolved.split(path.sep).join("/");
  if (normalized.includes("/.npm/_npx/") || normalized.includes("/node_modules/.cache/npx/")) return "npx";
  if (normalized.includes("/node_modules/paperclipai/")) return "global-npm";
  let cursor = path.dirname(resolved);
  while (cursor !== path.dirname(cursor)) {
    if (fs.existsSync(path.join(cursor, ".git"))) return "source";
    cursor = path.dirname(cursor);
  }
  return "unknown";
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => { const [core, prerelease = ""] = value.replace(/^v/, "").split("-", 2); return { numbers: core.split(".").map((part) => Number(part) || 0), prerelease }; };
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < Math.max(a.numbers.length, b.numbers.length); index += 1) { const delta = (a.numbers[index] ?? 0) - (b.numbers[index] ?? 0); if (delta !== 0) return Math.sign(delta); }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  const aParts = a.prerelease.split(".");
  const bParts = b.prerelease.split(".");
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const leftPart = aParts[index];
    const rightPart = bParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Math.sign(Number(leftPart) - Number(rightPart));
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function resolveUpdateRequest(manifest: InstallManifest | null, options: Pick<UpdateOptions, "canary" | "latest" | "version">): { spec: string; channel: InstallChannel; explicit: boolean } {
  const selected = Number(Boolean(options.canary)) + Number(Boolean(options.latest)) + Number(Boolean(options.version));
  if (selected > 1) throw new Error(tCli("Choose only one of --latest, --canary, or --version."));
  if (options.version) return { spec: options.version.trim(), channel: "pinned", explicit: true };
  if (options.canary) return { spec: "canary", channel: "canary", explicit: true };
  if (options.latest) return { spec: "latest", channel: "latest", explicit: true };
  if (manifest?.channel === "pinned") return { spec: manifest.version, channel: "pinned", explicit: false };
  const channel = manifest?.channel === "canary" ? "canary" : "latest";
  return { spec: channel, channel, explicit: false };
}

export function rollbackManagedInstall(paths = resolveInstallStorePaths()): InstallManifest {
  const manifest = readInstallManifest(paths);
  if (!manifest) throw new Error(tCli("No managed install was found to roll back."));
  const target = manifest.previous[0];
  if (!target) throw new Error(tCli("No previous managed payload is available for rollback."));
  if (!fs.existsSync(target.payloadPath)) throw new Error(tCli("Previous payload is missing: {{value1}}", { value1: String(target.payloadPath) }));
  const current: InstallRecord = { source: manifest.source, version: manifest.version, channel: manifest.channel, payloadPath: manifest.payloadPath, repo: manifest.repo, ref: manifest.ref, sha: manifest.sha, installedAt: manifest.installedAt };
  const next: InstallManifest = { schemaVersion: manifest.schemaVersion, ...target, previous: [current, ...manifest.previous.slice(1)].slice(0, 2) };
  const oldTarget = fs.readlinkSync(paths.currentPath);
  flipCurrentAtomic(target.payloadPath, paths);
  try { writeInstallManifestAtomic(next, paths); } catch (error) { flipCurrentAtomic(path.resolve(paths.cliRoot, oldTarget), paths); throw error; }
  return next;
}

async function defaultConfirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const answer = await p.confirm({ message, initialValue: false });
  return !p.isCancel(answer) && answer === true;
}
function emit(options: UpdateOptions, value: Record<string, unknown>, message: string): void { if (options.json) console.log(JSON.stringify(value, null, 2)); else console.log(message); }

async function rollbackAfterServiceValidationFailure(
  paths: InstallStorePaths,
  restartActiveService: (expectedVersion: string) => Promise<boolean>,
  validationError: unknown,
  payloadLabel: string,
): Promise<never> {
  const rolledBack = await withInstallStoreLock(async () => rollbackManagedInstall(paths), paths);
  try {
    await restartActiveService(rolledBack.version);
  } catch (restartError) {
    throw new Error(
      tCli("{{value1}} failed service validation and was rolled back to {{value2}}, but the rolled-back service also failed to restart.", { value1: String(payloadLabel), value2: String(rolledBack.version) }),
      { cause: new AggregateError([validationError, restartError]) },
    );
  }
  throw new Error(tCli("{{value1}} failed service validation and was rolled back to {{value2}}.", { value1: String(payloadLabel), value2: String(rolledBack.version) }), { cause: validationError });
}

export async function updateCommand(options: UpdateOptions, overrides: Partial<Dependencies> = {}): Promise<void> {
  const paths = overrides.paths ?? resolveInstallStorePaths();
  const executablePath = overrides.executablePath ?? process.argv[1] ?? "";
  const runCommand = overrides.runCommand ?? execFileAsync;
  const mode = detectInstallMode(executablePath, paths);
  const manifest = readInstallManifest(paths);
  if (options.rollback) {
    if (mode !== "managed") throw new Error(tCli("--rollback is only available for managed installs."));
    if (options.dryRun) { emit(options, { mode, action: "rollback", dryRun: true, target: manifest?.previous[0]?.version ?? null }, tCli("Would roll back to {{value1}}.", { value1: String(manifest?.previous[0]?.version ?? tCli("the previous payload")) })); return; }
    const next = await withInstallStoreLock(async () => rollbackManagedInstall(paths), paths);
    const restarted = await (overrides.restartActiveService ?? restartActiveManagedService)(next.version);
    emit(options, { mode, action: "rollback", version: next.version, restarted }, pc.green(tCli("Rolled back to paperclipai {{value1}}{{value2}}. Database migrations are not reversed; restore the pre-update backup if needed.", { value1: String(next.version), value2: String(restarted ? tCli(" and restarted the active service") : "") })));
    return;
  }
  if (mode === "npx") { emit(options, { mode, action: "install" }, tCli("This is an ephemeral npx install. Run `paperclipai install`, then use `paperclipai update` from the managed shim.")); return; }
  if (mode === "source" || mode === "unknown") { emit(options, { mode, action: "manual" }, tCli("This appears to be a source checkout. Update it with `git pull` followed by `pnpm install`; Paperclip will not mutate the repository.")); return; }
  const request = resolveUpdateRequest(mode === "managed" ? manifest : null, options);
  if (mode === "managed" && manifest?.source === "git") {
    if (!manifest.repo || !manifest.ref || !manifest.sha) throw new Error(tCli("Managed git install metadata is incomplete."));
    if (/^[0-9a-f]{7,40}$/i.test(manifest.ref)) { emit(options, { mode, source: "git", pinned: true, sha: manifest.sha }, tCli("Git install is pinned at {{value1}}.", { value1: String(manifest.sha.slice(0, 12)) })); return; }
    const targetSha = await resolveGitHubRef(manifest.repo, manifest.ref, runCommand);
    if (targetSha === manifest.sha) { emit(options, { mode, source: "git", changed: false, sha: targetSha, ref: manifest.ref }, tCli("{{value1}}@{{value2}} is already at {{value3}}.", { value1: String(manifest.repo), value2: String(manifest.ref), value3: String(targetSha.slice(0, 12)) })); return; }
    if (options.check || options.dryRun) { emit(options, { mode, source: "git", changed: true, currentSha: manifest.sha, targetSha, ref: manifest.ref, dryRun: Boolean(options.dryRun) }, tCli("Git update available: {{value1}} → {{value2}}.", { value1: String(manifest.sha.slice(0, 12)), value2: String(targetSha.slice(0, 12)) })); if (options.check) process.exitCode = 10; return; }
    if (options.yes !== true) {
      const confirmed = await (overrides.confirm ?? defaultConfirm)(tCli("Update from {{value1}}@{{value2}} and execute build scripts from commit {{value3}}?", { value1: String(manifest.repo), value2: String(manifest.ref), value3: String(targetSha.slice(0, 12)) }));
      if (!confirmed) throw new Error(tCli("Git update cancelled. Re-run with --yes to confirm executing build scripts from the updated commit."));
    }
    if (options.backup !== false) await runPreUpdateBackup(options, overrides.backup ?? (() => dbBackupCommand({})), overrides.hasInstanceData);
    const installed = await withInstallStoreLock(async () => {
      const payload = await installGitPayload(manifest.repo!, targetSha, runCommand, paths);
      const record: InstallRecord = { source: "git", version: payload.version, channel: "pinned", repo: manifest.repo, ref: manifest.ref, sha: targetSha, payloadPath: payload.payloadPath, installedAt: (overrides.now?.() ?? new Date()).toISOString() };
      const next = buildNextManifest(record, manifest); const oldTarget = fs.readlinkSync(paths.currentPath); flipCurrentAtomic(payload.payloadPath, paths);
      try { writeInstallManifestAtomic(next, paths); } catch (error) { flipCurrentAtomic(path.resolve(paths.cliRoot, oldTarget), paths); throw error; }
      pruneInstallPayloads(next, paths); return payload;
    }, paths);
    let restarted: boolean;
    try {
      restarted = await (overrides.restartActiveService ?? restartActiveManagedService)(installed.version);
    } catch (error) {
      return rollbackAfterServiceValidationFailure(
        paths,
        overrides.restartActiveService ?? restartActiveManagedService,
        error,
        tCli("Updated git payload"),
      );
    }
    emit(options, { mode, source: "git", changed: true, currentSha: manifest.sha, targetSha, reused: installed.reused, restarted }, pc.yellow(tCli("Updated unreleased git payload {{value1}} → {{value2}} from {{value3}}@{{value4}}{{value5}}.", { value1: String(manifest.sha.slice(0, 12)), value2: String(targetSha.slice(0, 12)), value3: String(manifest.repo), value4: String(manifest.ref), value5: String(restarted ? tCli(" and restarted the active service") : "") })));
    return;
  }
  const targetVersion = await resolvePublishedVersion(request.spec, runCommand);
  const currentVersion = manifest?.version ?? (mode === "global-npm" ? packageVersion : undefined);
  const comparison = currentVersion ? compareVersions(targetVersion, currentVersion) : 1;
  if (options.check) { emit(options, { mode, currentVersion: currentVersion ?? null, targetVersion, updateAvailable: comparison > 0, downgrade: comparison < 0, channel: request.channel }, comparison > 0 ? tCli("Update available: {{value1}}", { value1: String(targetVersion) }) : comparison < 0 ? tCli("Target {{value1}} is older than {{value2}}.", { value1: String(targetVersion), value2: String(currentVersion) }) : tCli("paperclipai {{value1}} is current.", { value1: String(targetVersion) })); if (comparison > 0) process.exitCode = 10; return; }
  if (mode === "global-npm") {
    if (comparison < 0 && options.yes !== true) { const confirmed = await (overrides.confirm ?? defaultConfirm)(tCli("Downgrade paperclipai from {{value1}} to {{value2}}?", { value1: String(currentVersion), value2: String(targetVersion) })); if (!confirmed) throw new Error(tCli("Downgrade cancelled. Re-run with --yes to confirm explicitly.")); }
    const args = ["install", "-g", `paperclipai@${targetVersion}`, `--registry=${PUBLIC_NPM_REGISTRY}`, `--@paperclipai:registry=${PUBLIC_NPM_REGISTRY}`]; console.log(tCli("Running: npm {{value1}}", { value1: String(args.join(" ")) }));
    if (!options.dryRun) {
      const npmConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-npm-"));
      const npmUserConfigPath = path.join(npmConfigDir, "npmrc");
      try {
        fs.writeFileSync(npmUserConfigPath, `registry=${PUBLIC_NPM_REGISTRY}\n@paperclipai:registry=${PUBLIC_NPM_REGISTRY}\n`, { mode: 0o600 });
        await runCommand("npm", args, {
          env: {
            ...process.env,
            npm_config_registry: PUBLIC_NPM_REGISTRY,
            NPM_CONFIG_REGISTRY: PUBLIC_NPM_REGISTRY,
            npm_config_userconfig: npmUserConfigPath,
            NPM_CONFIG_USERCONFIG: npmUserConfigPath,
          },
          maxBuffer: 16 * 1024 * 1024,
        });
      } finally {
        fs.rmSync(npmConfigDir, { recursive: true, force: true });
      }
    }
    emit(options, { mode, action: "update", targetVersion, dryRun: Boolean(options.dryRun), command: ["npm", ...args] }, options.dryRun ? tCli("Dry run complete.") : pc.green(tCli("Updated global npm install to {{value1}}.", { value1: String(targetVersion) }))); return;
  }
  if (!manifest) throw new Error(tCli("Managed install metadata is missing."));
  if (comparison === 0) { emit(options, { mode, currentVersion, targetVersion, changed: false }, tCli("paperclipai {{value1}} is already active.", { value1: String(targetVersion) })); return; }
  if (comparison < 0 && options.yes !== true) { const confirmed = await (overrides.confirm ?? defaultConfirm)(tCli("Downgrade paperclipai from {{value1}} to {{value2}}?", { value1: String(currentVersion), value2: String(targetVersion) })); if (!confirmed) throw new Error(tCli("Downgrade cancelled. Re-run with --yes to confirm explicitly.")); }
  if (options.dryRun) { emit(options, { mode, currentVersion, targetVersion, action: comparison < 0 ? "downgrade" : "update", backup: options.backup !== false, dryRun: true }, tCli("Would {{value1}} paperclipai {{value2}} → {{value3}}{{value4}}.", { value1: String(comparison < 0 ? tCli("downgrade") : tCli("update")), value2: String(currentVersion), value3: String(targetVersion), value4: String(options.backup === false ? tCli(" without a backup") : tCli(" after a database backup")) })); return; }
  if (options.backup !== false) await runPreUpdateBackup(options, overrides.backup ?? (() => dbBackupCommand({})), overrides.hasInstanceData);
  const installed = await withInstallStoreLock(async () => {
    const payload = await installNpmPayload(targetVersion, runCommand, paths);
    const record: InstallRecord = { source: "npm", version: targetVersion, channel: request.channel, payloadPath: payload.payloadPath, installedAt: (overrides.now?.() ?? new Date()).toISOString() };
    const next = buildNextManifest(record, manifest); const oldTarget = fs.readlinkSync(paths.currentPath); flipCurrentAtomic(payload.payloadPath, paths);
    try { writeInstallManifestAtomic(next, paths); } catch (error) { flipCurrentAtomic(path.resolve(paths.cliRoot, oldTarget), paths); throw error; }
    pruneInstallPayloads(next, paths); return payload;
  }, paths);
  let restarted: boolean;
  try {
    restarted = await (overrides.restartActiveService ?? restartActiveManagedService)(targetVersion);
  } catch (error) {
    return rollbackAfterServiceValidationFailure(
      paths,
      overrides.restartActiveService ?? restartActiveManagedService,
      error,
      tCli("Updated payload"),
    );
  }
  emit(options, { mode, currentVersion, targetVersion, changed: true, reused: installed.reused, restarted }, pc.green(tCli("Updated paperclipai {{value1}} → {{value2}}{{value3}}. Run `paperclipai update --rollback` for an instant payload rollback.", { value1: String(currentVersion), value2: String(targetVersion), value3: String(restarted ? tCli(" and restarted the active service") : "") })));
}
