import { configureLocalizedHelp } from "./commands/cli-help.js";
import { tCli, translateCliDisplayMessage } from "./i18n.js";
import { Command } from "commander";
import { warnIfUnsupportedNodeVersion } from "@paperclipai/shared/node-version";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { channelsCommand } from "./commands/channels.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
import { dbBackupCommand } from "./commands/db-backup.js";
import { registerEnvLabCommands } from "./commands/env-lab.js";
import { registerContextCommands } from "./commands/client/context.js";
import { registerCompanyCommands } from "./commands/client/company.js";
import { registerIssueCommands } from "./commands/client/issue.js";
import { registerAgentCommands } from "./commands/client/agent.js";
import { registerProjectCommands } from "./commands/client/project.js";
import { registerGoalCommands } from "./commands/client/goal.js";
import { registerApprovalCommands } from "./commands/client/approval.js";
import { registerActivityCommands } from "./commands/client/activity.js";
import { registerDashboardCommands } from "./commands/client/dashboard.js";
import { registerRoutineCommands } from "./commands/routines.js";
import { registerPipelineCommands } from "./commands/pipelines.js";
import { registerFeedbackCommands } from "./commands/client/feedback.js";
import { registerSecretCommands } from "./commands/client/secrets.js";
import { registerSkillsCommands } from "./commands/client/skills.js";
import { registerTeamCommands } from "./commands/client/teams.js";
import { applyDataDirOverride, type DataDirOptionLike } from "./config/data-dir.js";
import { loadPaperclipEnvFile } from "./config/env.js";
import { initTelemetryFromConfigFile, flushTelemetry } from "./telemetry.js";
import { registerWorktreeCommands } from "./commands/worktree.js";
import { registerPluginCommands } from "./commands/client/plugin.js";
import { registerClientAuthCommands } from "./commands/client/auth.js";
import { registerConnectCommand } from "./commands/client/connect.js";
import { registerTokenCommands } from "./commands/client/token.js";
import { registerPromptCommands } from "./commands/client/prompt.js";
import { registerRunCommands } from "./commands/client/run.js";
import { registerCostCommands } from "./commands/client/cost.js";
import { registerWorkspaceCommands } from "./commands/client/workspace.js";
import { registerAccessCommands } from "./commands/client/access.js";
import { registerRoutineApiCommands } from "./commands/client/routine-api.js";
import { registerAdapterCommands } from "./commands/client/adapter.js";
import { registerManagedAgentCommands } from "./commands/managed-agent.js";
import { registerAssetCommands } from "./commands/client/asset.js";
import { registerSkillCommands } from "./commands/client/skill.js";
import { cliVersion } from "./version.js";
import { installCommand } from "./commands/install.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { updateCommand } from "./commands/update.js";
import { registerServiceCommands } from "./commands/service.js";
import { registerConnectionIntentCommands } from "./commands/client/connections.js";

const program = new Command();
configureLocalizedHelp(program);
const DATA_DIR_OPTION_HELP =
  tCli("Paperclip data directory root (isolates state from ~/.paperclip)");

program.enablePositionalOptions();

program
  .name("paperclipai")
  .description(tCli("Paperclip CLI — setup, diagnose, and configure your instance"))
  .version(cliVersion, "-V, --version", tCli("Output the version number"));

program
  .command("install")
  .description(tCli("Install Paperclip into a managed per-user CLI store"))
  .option("--canary", tCli("Install the npm canary channel"))
  .option("--version <version>", tCli("Install an exact published npm version"))
  .option("--ref <ref>", tCli("Install a GitHub branch, tag, or commit SHA"))
  .option("--repo <owner/name>", tCli("Override the GitHub repository used with --ref"))
  .option("-y, --yes", tCli("Consent to git-ref code execution and supported shell PATH updates without prompting"))
  .action(installCommand);

program
  .command("uninstall")
  .description(tCli("Remove the managed CLI install while preserving user data"))
  .action(uninstallCommand);

program
  .command("update")
  .alias("upgrade")
  .description(tCli("Check, update, or roll back the Paperclip CLI"))
  .option("--latest", tCli("Switch to the latest stable channel"))
  .option("--canary", tCli("Switch to the canary channel"))
  .option("--version <version>", tCli("Install an exact published version"))
  .option("--rollback", tCli("Flip back to the retained previous managed payload"))
  .option("--check", tCli("Check for an available update without applying it"))
  .option("--dry-run", tCli("Print the action without changing anything"))
  .option("--json", tCli("Print machine-readable output"))
  .option("-y, --yes", tCli("Confirm an explicit downgrade"))
  .option("--no-backup", tCli("Skip the pre-update database backup"))
  .action(updateCommand);

program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals() as DataDirOptionLike;
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context"),
  });
  loadPaperclipEnvFile(options.config);
  initTelemetryFromConfigFile(options.config);
});

program
  .command("onboard")
  .description(tCli("Interactive first-run setup wizard"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--bind <mode>", tCli("Quickstart reachability preset (loopback, lan, tailnet)"))
  .option("-y, --yes", tCli("Accept quickstart defaults (trusted local loopback unless --bind is set) and start immediately"), false)
  .option("--install-service", tCli("Install and start the background service after onboarding"))
  .option("--no-install-service", tCli("Do not install or suggest the background service"))
  .option("--run", tCli("Start Paperclip immediately after saving config"), false)
  .action(onboard);

program
  .command("doctor")
  .description(tCli("Run diagnostic checks on your Paperclip setup"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--repair", tCli("Attempt to repair issues automatically"))
  .alias("--fix")
  .option("-y, --yes", tCli("Skip repair confirmation prompts"))
  .action(async (opts) => {
    await doctor(opts);
  });

program
  .command("env")
  .description(tCli("Print environment variables for deployment"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(envCommand);

program
  .command("channels")
  .description(tCli("Show the release channels and which one this install follows"))
  .option("--json", tCli("Machine-readable output"))
  .action(async (opts) => {
    await channelsCommand(opts);
  });

program
  .command("configure")
  .description(tCli("Update configuration sections"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-s, --section <section>", tCli("Section to configure (llm, database, logging, server, storage, secrets)"))
  .action(configure);

program
  .command("db:backup")
  .description(tCli("Create a one-off database backup using current config"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--dir <path>", tCli("Backup output directory (overrides config)"))
  .option("--retention-days <days>", tCli("Retention window used for pruning"), (value) => Number(value))
  .option("--filename-prefix <prefix>", tCli("Backup filename prefix"), "paperclip")
  .option("--json", tCli("Print backup metadata as JSON"))
  .action(async (opts) => {
    await dbBackupCommand(opts);
  });

program
  .command("allowed-hostname")
  .description(tCli("Allow a hostname for authenticated/private mode access"))
  .argument("<host>", tCli("Hostname to allow (for example dotta-macbook-pro)"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(addAllowedHostname);

const run = program
  .command("run")
  .description(tCli("Bootstrap local setup (onboard + doctor) and run Paperclip"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-i, --instance <id>", tCli("Local instance id (default: default)"))
  .option("--bind <mode>", tCli("On first run, use onboarding reachability preset (loopback, lan, tailnet)"))
  .option("--repair", tCli("Attempt automatic repairs during doctor"), true)
  .option("--no-repair", tCli("Disable automatic repairs during doctor"))
  .option("--force", tCli("Run even when the same instance is active under the service manager"))
  .action(runCommand);

registerRunCommands(run);
registerServiceCommands(program);

const heartbeat = program.command("heartbeat").description(tCli("Heartbeat utilities"));

heartbeat
  .command("run")
  .description(tCli("Run one agent heartbeat and stream live logs"))
  .requiredOption("-a, --agent-id <agentId>", tCli("Agent ID to invoke"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--context <path>", tCli("Path to CLI context file"))
  .option("--profile <name>", tCli("CLI context profile name"))
  .option("--api-base <url>", tCli("Base URL for the Paperclip server API"))
  .option("--api-key <token>", tCli("Bearer token for agent-authenticated calls"))
  .option(
    "--source <source>",
    tCli("Invocation source (timer | assignment | on_demand | automation)"),
    "on_demand",
  )
  .option("--trigger <trigger>", tCli("Trigger detail (manual | ping | callback | system)"), "manual")
  .option("--timeout-ms <ms>", tCli("Max time to wait before giving up"), "0")
  .option("--json", tCli("Output raw JSON where applicable"))
  .option("--debug", tCli("Show raw adapter stdout/stderr JSON chunks"))
  .action(heartbeatRun);

registerContextCommands(program);
registerConnectCommand(program);
registerConnectionIntentCommands(program);
registerCompanyCommands(program);
registerIssueCommands(program);
registerAgentCommands(program);
registerProjectCommands(program);
registerGoalCommands(program);
registerTokenCommands(program);
registerPromptCommands(program);
registerApprovalCommands(program);
registerActivityCommands(program);
registerDashboardCommands(program);
registerCostCommands(program);
registerWorkspaceCommands(program);
registerAccessCommands(program);
registerRoutineApiCommands(program);
registerAdapterCommands(program);
registerManagedAgentCommands(program);
registerAssetCommands(program);
registerSkillCommands(program);
registerRoutineCommands(program);
registerPipelineCommands(program);
registerFeedbackCommands(program);
registerSecretCommands(program);
registerSkillsCommands(program);
registerTeamCommands(program);
registerWorktreeCommands(program);
registerEnvLabCommands(program);
registerPluginCommands(program);

const auth = program.command("auth").description(tCli("Authentication and bootstrap utilities"));

auth
  .command("bootstrap-ceo")
  .description(tCli("Create a one-time bootstrap invite URL for first instance admin"))
  .option("-c, --config <path>", tCli("Path to config file"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--force", tCli("Create new invite even if admin already exists"), false)
  .option("--expires-hours <hours>", tCli("Invite expiration window in hours"), (value) => Number(value))
  .option("--base-url <url>", tCli("Public base URL used to print invite link"))
  .action(bootstrapCeoInvite);

registerClientAuthCommands(auth);

async function main(): Promise<void> {
  warnIfUnsupportedNodeVersion(process.versions.node, (message) => console.warn(message));

  let failed = false;
  try {
    await program.parseAsync();
  } catch (err) {
    failed = true;
    console.error(translateCliDisplayMessage(err instanceof Error ? err.message : String(err)));
  } finally {
    await flushTelemetry();
  }

  if (failed) {
    process.exit(1);
  }
}

void main();
