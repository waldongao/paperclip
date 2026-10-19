import { tCli } from "../../i18n.js";
import { Command } from "commander";
import {
  agentSkillSyncSchema,
  createAgentSchema,
  resetAgentSessionSchema,
  updateAgentInstructionsBundleSchema,
  updateAgentInstructionsPathSchema,
  updateAgentPermissionsSchema,
  updateAgentSchema,
  upsertAgentInstructionsFileSchema,
  wakeAgentSchema,
  type Agent,
  type AgentWakeupResponse,
  type Issue,
} from "@paperclipai/shared";
import {
  removeMaintainerOnlySkillSymlinks,
  resolvePaperclipSkillsDir,
} from "@paperclipai/adapter-utils/server-utils";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addCommonClientOptions,
  apiPath,
  formatInlineRecord,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface AgentListOptions extends BaseClientOptions {
  companyId?: string;
}

interface AgentLocalCliOptions extends BaseClientOptions {
  companyId?: string;
  keyName?: string;
  installSkills?: boolean;
}

interface AgentInboxMineOptions extends BaseClientOptions {
  userId: string;
  status?: string;
}

interface AgentWakeOptions extends BaseClientOptions {
  companyId?: string;
  source?: string;
  trigger?: string;
  reason?: string;
  payload?: string;
  idempotencyKey?: string;
  forceFreshSession?: boolean;
}

interface AgentJsonPayloadOptions extends BaseClientOptions {
  companyId?: string;
  payloadJson: string;
}

interface AgentDeleteOptions extends BaseClientOptions {
  yes?: boolean;
}

interface AgentResetSessionOptions extends BaseClientOptions {
  taskKey?: string;
}

interface AgentSkillsSyncOptions extends BaseClientOptions {
  desiredSkills: string;
  mode: string;
}

interface AgentInstructionsFileOptions extends BaseClientOptions {
  path: string;
}

interface AgentInstructionsFilePutOptions extends BaseClientOptions {
  path: string;
  content?: string;
  contentFile?: string;
  clearLegacyPromptTemplate?: boolean;
}

interface CreatedAgentKey {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

interface SkillsInstallSummary {
  tool: "codex" | "claude" | "kimi";
  target: string;
  linked: string[];
  removed: string[];
  skipped: string[];
  failed: Array<{ name: string; error: string }>;
}

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

function codexSkillsHome(): string {
  const fromEnv = process.env.CODEX_HOME?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), ".codex");
  return path.join(base, "skills");
}

function claudeSkillsHome(): string {
  const fromEnv = process.env.CLAUDE_HOME?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), ".claude");
  return path.join(base, "skills");
}

function kimiSkillsHome(): string {
  const fromEnv = process.env.KIMI_CODE_HOME?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), ".kimi-code");
  return path.join(base, "skills");
}

async function installSkillsForTarget(
  sourceSkillsDir: string,
  targetSkillsDir: string,
  tool: "codex" | "claude" | "kimi",
): Promise<SkillsInstallSummary> {
  const summary: SkillsInstallSummary = {
    tool,
    target: targetSkillsDir,
    linked: [],
    removed: [],
    skipped: [],
    failed: [],
  };

  await fs.mkdir(targetSkillsDir, { recursive: true });
  const entries = await fs.readdir(sourceSkillsDir, { withFileTypes: true });
  summary.removed = await removeMaintainerOnlySkillSymlinks(
    targetSkillsDir,
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = path.join(sourceSkillsDir, entry.name);
    const target = path.join(targetSkillsDir, entry.name);
    const existing = await fs.lstat(target).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink()) {
        let linkedPath: string | null = null;
        try {
          linkedPath = await fs.readlink(target);
        } catch (err) {
          await fs.unlink(target);
          try {
            await fs.symlink(source, target);
            summary.linked.push(entry.name);
            continue;
          } catch (linkErr) {
            summary.failed.push({
              name: entry.name,
              error:
                err instanceof Error && linkErr instanceof Error
                  ? tCli("{{value0}}; then {{value1}}", { value0: err.message, value1: linkErr.message })
                  : err instanceof Error
                    ? err.message
                    : tCli("Failed to recover broken symlink: {{value0}}", { value0: String(err) }),
            });
            continue;
          }
        }

        const resolvedLinkedPath = path.isAbsolute(linkedPath)
          ? linkedPath
          : path.resolve(path.dirname(target), linkedPath);
        const linkedTargetExists = await fs
          .stat(resolvedLinkedPath)
          .then(() => true)
          .catch(() => false);

        if (!linkedTargetExists) {
          await fs.unlink(target);
        } else {
          summary.skipped.push(entry.name);
          continue;
        }
      } else {
        summary.skipped.push(entry.name);
        continue;
      }
    }

    try {
      await fs.symlink(source, target);
      summary.linked.push(entry.name);
    } catch (err) {
      summary.failed.push({
        name: entry.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

function buildAgentEnvExports(input: {
  apiBase: string;
  companyId: string;
  agentId: string;
  apiKey: string;
}): string {
  const escaped = (value: string) => value.replace(/'/g, "'\"'\"'");
  return [
    `export PAPERCLIP_API_URL='${escaped(input.apiBase)}'`,
    `export PAPERCLIP_COMPANY_ID='${escaped(input.companyId)}'`,
    `export PAPERCLIP_AGENT_ID='${escaped(input.agentId)}'`,
    `export PAPERCLIP_API_KEY='${escaped(input.apiKey)}'`,
  ].join("\n");
}

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description(tCli("Agent operations"));

  addCommonClientOptions(
    agent
      .command("me")
      .description(tCli("Show the current agent identity"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const me = await ctx.api.get<Agent>("/api/agents/me");
          printOutput(me, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("inbox")
      .description(tCli("List current agent assigned inbox items"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const rows = (await ctx.api.get<Issue[]>("/api/agents/me/inbox-lite")) ?? [];
          if (ctx.json) {
            printOutput(rows, { json: true });
            return;
          }
          for (const row of rows) {
            console.log(formatInlineRecord({
              identifier: row.identifier,
              id: row.id,
              status: row.status,
              priority: row.priority,
              title: row.title,
              projectId: row.projectId,
            }));
          }
          if (rows.length === 0) printOutput([], { json: false });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("inbox-mine")
      .description(tCli("List current agent inbox items touched or archived by a board user"))
      .requiredOption("--user-id <id>", tCli("Board user ID"))
      .option("--status <csv>", tCli("Comma-separated issue statuses"))
      .action(async (opts: AgentInboxMineOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const params = new URLSearchParams({ userId: opts.userId });
          if (opts.status) params.set("status", opts.status);
          const rows = (await ctx.api.get<Issue[]>(`/api/agents/me/inbox/mine?${params.toString()}`)) ?? [];
          printOutput(rows, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("list")
      .description(tCli("List agents for a company"))
      .requiredOption("-C, --company-id <id>", tCli("Company ID"))
      .action(async (opts: AgentListOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const rows = (await ctx.api.get<Agent[]>(apiPath`/api/companies/${ctx.companyId}/agents`)) ?? [];

          if (ctx.json) {
            printOutput(rows, { json: true });
            return;
          }

          if (rows.length === 0) {
            printOutput([], { json: false });
            return;
          }

          for (const row of rows) {
            console.log(
              formatInlineRecord({
                id: row.id,
                name: row.name,
                role: row.role,
                status: row.status,
                reportsTo: row.reportsTo,
                budgetMonthlyCents: row.budgetMonthlyCents,
                spentMonthlyCents: row.spentMonthlyCents,
              }),
            );
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("get")
      .description(tCli("Get one agent"))
      .argument("<agentId>", tCli("Agent ID"))
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const row = await ctx.api.get<Agent>(apiPath`/api/agents/${agentId}`);
          printOutput(row, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("create")
      .description(tCli("Create an agent from a JSON payload"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--payload-json <json>", tCli("CreateAgent JSON payload"))
      .action(async (opts: AgentJsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payload = createAgentSchema.parse(parseJson(opts.payloadJson));
          const created = await ctx.api.post<Agent>(apiPath`/api/companies/${ctx.companyId}/agents`, payload);
          printOutput(created, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("hire")
      .description(tCli("Create an agent hire request"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--payload-json <json>", tCli("CreateAgentHire JSON payload"))
      .action(async (opts: AgentJsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const result = await ctx.api.post(apiPath`/api/companies/${ctx.companyId}/agent-hires`, parseJson(opts.payloadJson));
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("update")
      .description(tCli("Update an agent from a JSON payload"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateAgent JSON payload"))
      .action(async (agentId: string, opts: AgentJsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateAgentSchema.parse(parseJson(opts.payloadJson));
          const updated = await ctx.api.patch<Agent>(apiPath`/api/agents/${agentId}`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("delete")
      .description(tCli("Delete an agent"))
      .argument("<agentId>", tCli("Agent ID"))
      .option("--yes", tCli("Confirm deletion"))
      .action(async (agentId: string, opts: AgentDeleteOptions) => {
        try {
          if (!opts.yes) throw new Error(tCli("Refusing to delete without --yes"));
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.delete(apiPath`/api/agents/${agentId}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  for (const [name, path, description] of [
    ["pause", "pause", tCli("Pause an agent")],
    ["resume", "resume", tCli("Resume an agent")],
    ["approve", "approve", tCli("Approve a pending agent")],
    ["terminate", "terminate", tCli("Terminate an agent")],
    ["heartbeat:invoke", "heartbeat/invoke", tCli("Invoke an agent heartbeat")],
    ["claude-login", "claude-login", tCli("Trigger Claude login for an agent")],
  ] as const) {
    addCommonClientOptions(
      agent
        .command(name)
        .description(description)
        .argument("<agentId>", tCli("Agent ID"))
        .action(async (agentId: string, opts: BaseClientOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            const result = await ctx.api.post(`${apiPath`/api/agents/${agentId}`}/${path}`, {});
            printOutput(result, { json: ctx.json });
          } catch (err) {
            handleCommandError(err);
          }
        }),
    );
  }

  addCommonClientOptions(
    agent
      .command("permissions:update")
      .description(tCli("Update agent permissions"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateAgentPermissions JSON payload"))
      .action(async (agentId: string, opts: AgentJsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateAgentPermissionsSchema.parse(parseJson(opts.payloadJson));
          const updated = await ctx.api.patch(apiPath`/api/agents/${agentId}/permissions`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("configuration")
      .description(tCli("Get redacted agent configuration"))
      .argument("<agentId>", tCli("Agent ID"))
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/agents/${agentId}/configuration`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("config-revisions")
      .description(tCli("List agent config revisions"))
      .argument("<agentId>", tCli("Agent ID"))
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/agents/${agentId}/config-revisions`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("config-revision:get")
      .description(tCli("Get one agent config revision"))
      .argument("<agentId>", tCli("Agent ID"))
      .argument("<revisionId>", tCli("Revision ID"))
      .action(async (agentId: string, revisionId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/agents/${agentId}/config-revisions/${revisionId}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("config-revision:rollback")
      .description(tCli("Roll an agent back to a config revision"))
      .argument("<agentId>", tCli("Agent ID"))
      .argument("<revisionId>", tCli("Revision ID"))
      .action(async (agentId: string, revisionId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.post(apiPath`/api/agents/${agentId}/config-revisions/${revisionId}/rollback`, {});
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("runtime-state")
      .description(tCli("Get agent runtime state"))
      .argument("<agentId>", tCli("Agent ID"))
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/agents/${agentId}/runtime-state`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("runtime-state:reset-session")
      .description(tCli("Reset an agent runtime session"))
      .argument("<agentId>", tCli("Agent ID"))
      .option("--task-key <key>", tCli("Specific task session key"))
      .action(async (agentId: string, opts: AgentResetSessionOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = resetAgentSessionSchema.parse({ taskKey: opts.taskKey });
          const result = await ctx.api.post(apiPath`/api/agents/${agentId}/runtime-state/reset-session`, payload);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("task-sessions")
      .description(tCli("List agent task sessions"))
      .argument("<agentId>", tCli("Agent ID"))
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/agents/${agentId}/task-sessions`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("skills")
      .description(tCli("List agent skills"))
      .argument("<agentId>", tCli("Agent ID"))
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/agents/${agentId}/skills`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("skills:sync")
      .description(tCli("Sync desired skills onto an agent"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--desired-skills <csv>", tCli("Desired skill names"))
      .requiredOption(
        "--mode <mode>",
        tCli("Merge mode: add keeps other skills; remove deletes only named skills; replace destructively overwrites the complete set"),
      )
      .action(async (agentId: string, opts: AgentSkillsSyncOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = agentSkillSyncSchema.parse({
            desiredSkills: parseCsv(opts.desiredSkills),
            mode: opts.mode,
          });
          const result = await ctx.api.post(apiPath`/api/agents/${agentId}/skills/sync`, payload);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("instructions-path:update")
      .description(tCli("Update an agent instructions path. Process adapters require adapterConfigKey and relative paths require adapterConfig.cwd."))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateAgentInstructionsPath JSON payload, for example {\"path\":\"/tmp/AGENTS.md\",\"adapterConfigKey\":\"instructionsFilePath\"}"))
      .action(async (agentId: string, opts: AgentJsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateAgentInstructionsPathSchema.parse(parseJson(opts.payloadJson));
          const result = await ctx.api.patch(apiPath`/api/agents/${agentId}/instructions-path`, payload);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("instructions-bundle")
      .description(tCli("Get an agent instructions bundle"))
      .argument("<agentId>", tCli("Agent ID"))
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/agents/${agentId}/instructions-bundle`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("instructions-bundle:update")
      .description(tCli("Update an agent instructions bundle"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateAgentInstructionsBundle JSON payload"))
      .action(async (agentId: string, opts: AgentJsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateAgentInstructionsBundleSchema.parse(parseJson(opts.payloadJson));
          const result = await ctx.api.patch(apiPath`/api/agents/${agentId}/instructions-bundle`, payload);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("instructions-file:get")
      .description(tCli("Get an agent instructions file"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--path <path>", tCli("Bundle-relative file path"))
      .action(async (agentId: string, opts: AgentInstructionsFileOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = new URLSearchParams({ path: opts.path });
          const result = await ctx.api.get(`${apiPath`/api/agents/${agentId}/instructions-bundle/file`}?${query.toString()}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("instructions-file:put")
      .description(tCli("Create or update an agent instructions file"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--path <path>", tCli("Bundle-relative file path"))
      .option("--content <text>", tCli("File content"))
      .option("--content-file <path>", tCli("Read file content from disk"))
      .option("--clear-legacy-prompt-template", tCli("Clear legacy prompt template"))
      .action(async (agentId: string, opts: AgentInstructionsFilePutOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const content = opts.contentFile ? await fs.readFile(opts.contentFile, "utf8") : opts.content;
          const payload = upsertAgentInstructionsFileSchema.parse({
            path: opts.path,
            content,
            clearLegacyPromptTemplate: Boolean(opts.clearLegacyPromptTemplate),
          });
          const result = await ctx.api.put(apiPath`/api/agents/${agentId}/instructions-bundle/file`, payload);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("instructions-file:delete")
      .description(tCli("Delete an agent instructions file"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--path <path>", tCli("Bundle-relative file path"))
      .action(async (agentId: string, opts: AgentInstructionsFileOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = new URLSearchParams({ path: opts.path });
          const result = await ctx.api.delete(`${apiPath`/api/agents/${agentId}/instructions-bundle/file`}?${query.toString()}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("wake")
      .description(tCli("Request a heartbeat wakeup for an agent"))
      .argument("<agentRef>", tCli("Agent ID or shortname/url-key"))
      .option("-C, --company-id <id>", tCli("Company ID for shortname/url-key lookup"))
      .option("--source <source>", tCli("Invocation source (timer, assignment, on_demand, automation)"), "on_demand")
      .option("--trigger <trigger>", tCli("Trigger detail (manual, ping, callback, system)"), "manual")
      .option("--reason <text>", tCli("Wakeup reason"))
      .option("--payload <json>", tCli("JSON object payload"))
      .option("--idempotency-key <key>", tCli("Wakeup idempotency key"))
      .option("--force-fresh-session", tCli("Request a fresh adapter session"))
      .action(async (agentRef: string, opts: AgentWakeOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = opts.companyId ? `?${new URLSearchParams({ companyId: opts.companyId }).toString()}` : "";
          const agentRow = await ctx.api.get<Agent>(`${apiPath`/api/agents/${agentRef}`}${query}`);
          if (!agentRow) {
            throw new Error(tCli("Agent not found: {{agentRef}}", { agentRef: agentRef }));
          }
          const payload = wakeAgentSchema.parse({
            source: opts.source,
            triggerDetail: opts.trigger,
            reason: opts.reason,
            payload: parseJsonObject(opts.payload),
            idempotencyKey: opts.idempotencyKey,
            forceFreshSession: Boolean(opts.forceFreshSession),
          });
          const result = await ctx.api.post<AgentWakeupResponse>(apiPath`/api/agents/${agentRow.id}/wakeup`, payload);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("local-cli")
      .description(
        tCli("Create an agent API key, install local Paperclip skills for Codex/Claude, and print shell exports"),
      )
      .argument("<agentRef>", tCli("Agent ID or shortname/url-key"))
      .requiredOption("-C, --company-id <id>", tCli("Company ID"))
      .option("--key-name <name>", tCli("API key label"), "local-cli")
      .option(
        "--no-install-skills",
        tCli("Skip installing Paperclip skills into ~/.codex/skills, ~/.claude/skills, and ~/.kimi-code/skills"),
      )
      .action(async (agentRef: string, opts: AgentLocalCliOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const query = new URLSearchParams({ companyId: ctx.companyId ?? "" });
          const agentRow = await ctx.api.get<Agent>(
            `${apiPath`/api/agents/${agentRef}`}?${query.toString()}`,
          );
          if (!agentRow) {
            throw new Error(tCli("Agent not found: {{agentRef}}", { agentRef: agentRef }));
          }

          const now = new Date().toISOString().replaceAll(":", "-");
          const keyName = opts.keyName?.trim() ? opts.keyName.trim() : `local-cli-${now}`;
          const key = await ctx.api.post<CreatedAgentKey>(apiPath`/api/agents/${agentRow.id}/keys`, { name: keyName });
          if (!key) {
            throw new Error(tCli("Failed to create API key"));
          }

          const installSummaries: SkillsInstallSummary[] = [];
          if (opts.installSkills !== false) {
            const skillsDir = await resolvePaperclipSkillsDir(__moduleDir, [path.resolve(process.cwd(), "skills")]);
            if (!skillsDir) {
              throw new Error(
                tCli("Could not locate local Paperclip skills directory. Expected ./skills in the repo checkout."),
              );
            }

            installSummaries.push(
              await installSkillsForTarget(skillsDir, codexSkillsHome(), "codex"),
              await installSkillsForTarget(skillsDir, claudeSkillsHome(), "claude"),
              await installSkillsForTarget(skillsDir, kimiSkillsHome(), "kimi"),
            );
          }

          const exportsText = buildAgentEnvExports({
            apiBase: ctx.api.apiBase,
            companyId: agentRow.companyId,
            agentId: agentRow.id,
            apiKey: key.token,
          });

          if (ctx.json) {
            printOutput(
              {
                agent: {
                  id: agentRow.id,
                  name: agentRow.name,
                  urlKey: agentRow.urlKey,
                  companyId: agentRow.companyId,
                },
                key: {
                  id: key.id,
                  name: key.name,
                  createdAt: key.createdAt,
                  token: key.token,
                },
                skills: installSummaries,
                exports: exportsText,
              },
              { json: true },
            );
            return;
          }

          console.log(tCli("Agent: {{name}} ({{id}})", { name: agentRow.name, id: agentRow.id }));
          console.log(tCli("API key created: {{name}} ({{id}})", { name: key.name, id: key.id }));
          if (installSummaries.length > 0) {
            for (const summary of installSummaries) {
              console.log(
                tCli("{{tool}}: linked={{count}} removed={{count2}} skipped={{count3}} failed={{count4}} target={{target}}", { tool: summary.tool, count: summary.linked.length, count2: summary.removed.length, count3: summary.skipped.length, count4: summary.failed.length, target: summary.target }),
              );
              for (const failed of summary.failed) {
                console.log(tCli("  failed {{name}}: {{error}}", { name: failed.name, error: failed.error }));
              }
            }
          }
          console.log("");
          console.log(tCli("# Run this in your shell before launching codex/claude:"));
          console.log(exportsText);
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}

function parseJsonObject(value: string | undefined): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(tCli("--payload must be a JSON object"));
  }
  return parsed as Record<string, unknown>;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}
