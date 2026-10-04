import { tCli } from "../../i18n.js";
import { Command } from "commander";
import type { Project } from "@paperclipai/shared";
import { createProjectSchema, updateProjectSchema } from "@paperclipai/shared";
import {
  addCommonClientOptions,
  apiPath,
  formatInlineRecord,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface ProjectListOptions extends BaseClientOptions {
  companyId?: string;
}

interface ProjectCreateOptions extends BaseClientOptions {
  companyId?: string;
  name: string;
  description?: string;
  status?: string;
  goalId?: string;
  goalIds?: string;
  leadAgentId?: string;
  targetDate?: string;
  color?: string;
  envJson?: string;
  executionWorkspacePolicyJson?: string;
}

interface ProjectUpdateOptions extends BaseClientOptions {
  name?: string;
  description?: string;
  status?: string;
  goalId?: string;
  goalIds?: string;
  leadAgentId?: string;
  targetDate?: string;
  color?: string;
  envJson?: string;
  executionWorkspacePolicyJson?: string;
  archivedAt?: string;
}

interface ProjectDeleteOptions extends BaseClientOptions {
  yes?: boolean;
}

export function registerProjectCommands(program: Command): void {
  const project = program.command("project").description(tCli("Project operations"));

  addCommonClientOptions(
    project
      .command("list")
      .description(tCli("List projects for a company"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .action(async (opts: ProjectListOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const rows = (await ctx.api.get<Project[]>(apiPath`/api/companies/${ctx.companyId}/projects`)) ?? [];
          if (ctx.json) {
            printOutput(rows, { json: true });
            return;
          }
          if (rows.length === 0) {
            printOutput([], { json: false });
            return;
          }
          for (const row of rows) {
            console.log(formatInlineRecord({
              id: row.id,
              name: row.name,
              status: row.status,
              urlKey: row.urlKey,
              goalIds: row.goalIds?.join(",") ?? "",
              leadAgentId: row.leadAgentId,
            }));
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    project
      .command("get")
      .description(tCli("Get one project by ID or shortname"))
      .argument("<project>", tCli("Project ID or shortname"))
      .option("-C, --company-id <id>", tCli("Company ID for shortname lookup"))
      .action(async (projectRef: string, opts: ProjectListOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = ctx.companyId ? `?${new URLSearchParams({ companyId: ctx.companyId }).toString()}` : "";
          const row = await ctx.api.get<Project>(`${apiPath`/api/projects/${projectRef}`}${query}`);
          printOutput(row, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    project
      .command("create")
      .description(tCli("Create a project"))
      .requiredOption("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--name <name>", tCli("Project name"))
      .option("--description <text>", tCli("Project description"))
      .option("--status <status>", tCli("Project status"))
      .option("--goal-id <id>", tCli("Deprecated single goal ID"))
      .option("--goal-ids <csv>", tCli("Comma-separated goal IDs"))
      .option("--lead-agent-id <id>", tCli("Lead agent ID"))
      .option("--target-date <date>", tCli("Target date"))
      .option("--color <value>", tCli("Project color"))
      .option("--env-json <json>", tCli("Project env binding JSON"))
      .option("--execution-workspace-policy-json <json>", tCli("Execution workspace policy JSON"))
      .action(async (opts: ProjectCreateOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payload = createProjectSchema.parse({
            name: opts.name,
            description: opts.description,
            status: opts.status,
            goalId: parseNullableString(opts.goalId),
            goalIds: parseCsv(opts.goalIds),
            leadAgentId: parseNullableString(opts.leadAgentId),
            targetDate: parseNullableString(opts.targetDate),
            color: parseNullableString(opts.color),
            env: parseOptionalJson(opts.envJson),
            executionWorkspacePolicy: parseOptionalJson(opts.executionWorkspacePolicyJson),
          });
          const created = await ctx.api.post<Project>(apiPath`/api/companies/${ctx.companyId}/projects`, payload);
          printOutput(created, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    project
      .command("update")
      .description(tCli("Update a project"))
      .argument("<project>", tCli("Project ID or shortname"))
      .option("-C, --company-id <id>", tCli("Company ID for shortname lookup"))
      .option("--name <name>", tCli("Project name"))
      .option("--description <text|null>", tCli("Project description"))
      .option("--status <status>", tCli("Project status"))
      .option("--goal-id <id|null>", tCli("Deprecated single goal ID"))
      .option("--goal-ids <csv>", tCli("Comma-separated goal IDs"))
      .option("--lead-agent-id <id|null>", tCli("Lead agent ID"))
      .option("--target-date <date|null>", tCli("Target date"))
      .option("--color <value|null>", tCli("Project color"))
      .option("--env-json <json|null>", tCli("Project env binding JSON"))
      .option("--execution-workspace-policy-json <json|null>", tCli("Execution workspace policy JSON"))
      .option("--archived-at <iso8601|null>", tCli("Archive timestamp or null"))
      .action(async (projectRef: string, opts: ProjectUpdateOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateProjectSchema.parse({
            name: opts.name,
            description: parseNullableString(opts.description),
            status: opts.status,
            goalId: parseNullableString(opts.goalId),
            goalIds: opts.goalIds === undefined ? undefined : parseCsv(opts.goalIds),
            leadAgentId: parseNullableString(opts.leadAgentId),
            targetDate: parseNullableString(opts.targetDate),
            color: parseNullableString(opts.color),
            env: parseOptionalJson(opts.envJson),
            executionWorkspacePolicy: parseOptionalJson(opts.executionWorkspacePolicyJson),
            archivedAt: parseNullableString(opts.archivedAt),
          });
          const query = ctx.companyId ? `?${new URLSearchParams({ companyId: ctx.companyId }).toString()}` : "";
          const updated = await ctx.api.patch<Project>(`${apiPath`/api/projects/${projectRef}`}${query}`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    project
      .command("delete")
      .description(tCli("Delete a project"))
      .argument("<project>", tCli("Project ID or shortname"))
      .option("-C, --company-id <id>", tCli("Company ID for shortname lookup"))
      .option("--yes", tCli("Confirm deletion"))
      .action(async (projectRef: string, opts: ProjectDeleteOptions) => {
        try {
          if (!opts.yes) throw new Error(tCli("Deletion requires --yes."));
          const ctx = resolveCommandContext(opts);
          const query = ctx.companyId ? `?${new URLSearchParams({ companyId: ctx.companyId }).toString()}` : "";
          const deleted = await ctx.api.delete<Project>(`${apiPath`/api/projects/${projectRef}`}${query}`);
          printOutput(deleted, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function parseNullableString(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim().toLowerCase() === "null" ? null : value;
}

function parseOptionalJson(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  if (value.trim().toLowerCase() === "null") return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(tCli("Invalid JSON: {{value0}}", { value0: err instanceof Error ? err.message : String(err) }));
  }
}
