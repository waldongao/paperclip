import { tCli } from "../i18n.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import {
  assertManagedInstallStore,
  removeManagedPathBlock,
  removeManagedShim,
  resolveInstallStorePaths,
  withInstallStoreLock,
} from "../install-store.js";
import { resolvePaperclipInstanceId } from "../config/home.js";
import { detectServiceManager, launchdServiceName, systemdServiceName } from "../services/service-manager.js";

type UninstallDependencies = {
  detectServiceManager: typeof detectServiceManager;
  platform: NodeJS.Platform;
  userHomeDir: string;
};

function otherServiceDefinitions(platform: NodeJS.Platform, userHomeDir: string, instanceId: string): string[] {
  const directory = platform === "linux"
    ? path.join(userHomeDir, ".config", "systemd", "user")
    : platform === "darwin"
      ? path.join(userHomeDir, "Library", "LaunchAgents")
      : null;
  if (!directory || !fs.existsSync(directory)) return [];
  const currentName = platform === "linux"
    ? systemdServiceName(instanceId)
    : `${launchdServiceName(instanceId)}.plist`;
  const pattern = platform === "linux"
    ? /^paperclipai(?:-.+)?\.service$/
    : /^ing\.paperclip\.paperclipai(?:\..+)?\.plist$/;
  return fs.readdirSync(directory)
    .filter((name) => name !== currentName && pattern.test(name))
    .map((name) => path.join(directory, name));
}

export async function uninstallCommand(
  dependencies: Partial<UninstallDependencies> = {},
): Promise<void> {
  const instanceId = resolvePaperclipInstanceId();
  const detect = dependencies.detectServiceManager ?? detectServiceManager;
  const platform = dependencies.platform ?? process.platform;
  const userHomeDir = dependencies.userHomeDir ?? os.homedir();
  const detection = await detect({ instanceId, platform });
  const otherDefinitions = otherServiceDefinitions(platform, userHomeDir, instanceId);
  if (otherDefinitions.length > 0) {
    throw new Error(tCli("Cannot remove the shared managed CLI while other instance services are installed: {{value1}}. Uninstall those services first.", { value1: String(otherDefinitions.join(", ")) }));
  }
  if (!detection.supported && platform === "linux") {
    const definitionPath = path.join(
      userHomeDir,
      ".config",
      "systemd",
      "user",
      systemdServiceName(instanceId),
    );
    if (fs.existsSync(definitionPath)) {
      throw new Error(
        tCli("Cannot verify or remove the background service: {{value1}}. Retry when the service manager is available.", { value1: String(detection.reason) }),
      );
    }
  }
  if (detection.supported) {
    const status = await detection.manager.status();
    if (status.installed || status.active) await detection.manager.uninstall();
  }

  const paths = resolveInstallStorePaths();
  const hadStore = fs.existsSync(paths.cliRoot);
  if (hadStore) assertManagedInstallStore(paths);
  const shimRemoved = await withInstallStoreLock(async () => {
    if (hadStore) assertManagedInstallStore(paths);
    const removed = removeManagedShim(paths);

    const home = process.env.HOME;
    for (const rcFile of home ? [path.join(home, ".bashrc"), path.join(home, ".zshrc")] : []) {
      removeManagedPathBlock(rcFile);
    }
    fs.rmSync(paths.cliRoot, { recursive: true, force: true });
    return removed;
  }, paths, { initialize: !hadStore });

  if (!shimRemoved) {
    console.log(pc.yellow(tCli("Left {{value1}} unchanged because it is not a Paperclip-managed shim.", { value1: String(paths.shimPath) })));
  }
  console.log(pc.green(tCli("Removed the managed Paperclip CLI install.")));
  console.log(pc.dim(tCli("User data was left untouched under {{value1}}.", { value1: String(paths.paperclipHome) })));
}
