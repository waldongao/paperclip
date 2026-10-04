import { tCli, translateCliDisplayMessage } from "../../i18n.js";
import { Command } from "commander";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface CompanyOptions extends BaseClientOptions {
  companyId?: string;
}

interface JsonPayloadOptions extends CompanyOptions {
  payloadJson: string;
}

interface RuntimeActionOptions extends BaseClientOptions {
  payloadJson?: string;
}

interface OrgOutputOptions extends CompanyOptions {
  out?: string;
}

export function registerWorkspaceCommands(program: Command): void {
  const org = program.command("org").description(tCli("Organization chart operations"));
  addCompanyGet(org, "get", tCli("Get org chart data"), "org");
  addBinaryCompanyGet(org, "svg", tCli("Download org chart SVG"), "org.svg");
  addBinaryCompanyGet(org, "png", tCli("Download org chart PNG"), "org.png");
  addCompanyGet(program.command("agent-config").description(tCli("Agent configuration summaries")), "list", tCli("List agent configurations"), "agent-configurations");

  const workspace = program.command("workspace").description(tCli("Execution workspace operations"));
  addCompanyGet(workspace, "list", tCli("List execution workspaces"), "execution-workspaces");
  addIdGet(workspace, "get", tCli("Get an execution workspace"), "execution-workspaces");
  addIdGet(workspace, "close-readiness", tCli("Check execution workspace close readiness"), "execution-workspaces", "close-readiness");
  addIdGet(workspace, "operations", tCli("List execution workspace operations"), "execution-workspaces", "workspace-operations");
  addPatchJson(workspace, "update", tCli("Update an execution workspace"), "execution-workspaces");
  addRuntimeAction(workspace, "runtime-service", tCli("Control an execution workspace runtime service"), "execution-workspaces", "runtime-services");
  addRuntimeAction(workspace, "runtime-command", tCli("Run an execution workspace runtime command"), "execution-workspaces", "runtime-commands");

  const environment = program.command("environment").description(tCli("Environment operations"));
  addCompanyGet(environment, "list", tCli("List environments"), "environments");
  addCompanyGet(environment, "capabilities", tCli("Get environment capabilities"), "environments/capabilities");
  addCompanyPostJson(environment, "create", tCli("Create an environment"), "environments");
  addIdGet(environment, "get", tCli("Get an environment"), "environments");
  addIdGet(environment, "leases", tCli("List environment leases"), "environments", "leases");
  addCommonClientOptions(
    environment
      .command("lease")
      .description(tCli("Get an environment lease"))
      .argument("<leaseId>", tCli("Lease ID"))
      .action(async (leaseId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/environment-leases/${leaseId}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addPatchJson(environment, "update", tCli("Update an environment"), "environments");
  addDelete(environment, "delete", tCli("Delete an environment"), "environments");
  addPostEmpty(environment, "probe", tCli("Probe an environment"), "environments", "probe");
  addCompanyPostJson(environment, "probe-config", tCli("Probe an environment config"), "environments/probe-config");

  const projectWorkspace = program.command("project-workspace").description(tCli("Project workspace operations"));
  addCommonClientOptions(
    projectWorkspace
      .command("list")
      .description(tCli("List project workspaces"))
      .argument("<projectId>", tCli("Project ID"))
      .action(async (projectId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/projects/${projectId}/workspaces`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addProjectWorkspaceJson(projectWorkspace, "create", tCli("Create a project workspace"), "post");
  addProjectWorkspaceJson(projectWorkspace, "update", tCli("Update a project workspace"), "patch");
  addCommonClientOptions(
    projectWorkspace
      .command("delete")
      .description(tCli("Delete a project workspace"))
      .argument("<projectId>", tCli("Project ID"))
      .argument("<workspaceId>", tCli("Workspace ID"))
      .action(async (projectId: string, workspaceId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.delete(apiPath`/api/projects/${projectId}/workspaces/${workspaceId}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addProjectRuntimeAction(projectWorkspace, "runtime-service", tCli("Control a project workspace runtime service"), "runtime-services");
  addProjectRuntimeAction(projectWorkspace, "runtime-command", tCli("Run a project workspace runtime command"), "runtime-commands");
}

function addCompanyGet(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .option("-C, --company-id <id>", tCli("Company ID"))
      .action(async (opts: CompanyOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const result = await ctx.api.get(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}

function addBinaryCompanyGet(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .option("-C, --company-id <id>", tCli("Company ID"))
      .option("--out <path>", tCli("Write output to file"))
      .action(async (opts: OrgOutputOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const response = await fetch(buildApiUrl(ctx.api.apiBase, `${apiPath`/api/companies/${ctx.companyId}`}/${path}`), {
            headers: ctx.api.apiKey ? { authorization: `Bearer ${ctx.api.apiKey}` } : undefined,
          });
          const bytes = Buffer.from(await response.arrayBuffer());
          if (!response.ok) throw new Error(tCli("API error {{status}}: {{message}}", { status: response.status, message: translateCliDisplayMessage(bytes.toString("utf8")) }));
          if (opts.out) {
            const { writeFile } = await import("node:fs/promises");
            await writeFile(opts.out, bytes);
            printOutput({ out: opts.out, bytes: bytes.byteLength }, { json: ctx.json });
            return;
          }
          process.stdout.write(bytes);
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}

function addCompanyPostJson(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .option("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--payload-json <json>", tCli("JSON payload"))
      .action(async (opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const result = await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`, parseJson(opts.payloadJson));
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}

function addIdGet(parent: Command, name: string, description: string, resource: string, suffix?: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<id>", tCli("ID"))
      .action(async (id: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(`/api/${resource}/${encodeURIComponent(id)}${suffix ? `/${suffix}` : ""}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addPatchJson(parent: Command, name: string, description: string, resource: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<id>", tCli("ID"))
      .requiredOption("--payload-json <json>", tCli("JSON payload"))
      .action(async (id: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.patch(`/api/${resource}/${encodeURIComponent(id)}`, parseJson(opts.payloadJson));
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addDelete(parent: Command, name: string, description: string, resource: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<id>", tCli("ID"))
      .action(async (id: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.delete(`/api/${resource}/${encodeURIComponent(id)}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addPostEmpty(parent: Command, name: string, description: string, resource: string, suffix: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<id>", tCli("ID"))
      .action(async (id: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.post(`/api/${resource}/${encodeURIComponent(id)}/${suffix}`, {});
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addRuntimeAction(parent: Command, name: string, description: string, resource: string, actionResource: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<id>", tCli("Workspace ID"))
      .argument("<action>", tCli("start, stop, restart, or run"))
      .option("--payload-json <json>", tCli("Runtime target JSON payload"), "{}")
      .action(async (id: string, action: string, opts: RuntimeActionOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.post(`/api/${resource}/${encodeURIComponent(id)}/${actionResource}/${encodeURIComponent(action)}`, parseJson(opts.payloadJson ?? "{}"));
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addProjectWorkspaceJson(parent: Command, name: string, description: string, method: "post" | "patch"): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<projectId>", tCli("Project ID"))
      .argument("[workspaceId]", tCli("Workspace ID for update"))
      .requiredOption("--payload-json <json>", tCli("JSON payload"))
      .action(async (projectId: string, workspaceId: string | undefined, opts: JsonPayloadOptions) => {
        try {
          if (method === "patch" && !workspaceId) throw new Error(tCli("workspaceId is required for update"));
          const ctx = resolveCommandContext(opts);
          const path = method === "post"
            ? apiPath`/api/projects/${projectId}/workspaces`
            : apiPath`/api/projects/${projectId}/workspaces/${workspaceId}`;
          const result = method === "post"
            ? await ctx.api.post(path, parseJson(opts.payloadJson))
            : await ctx.api.patch(path, parseJson(opts.payloadJson));
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addProjectRuntimeAction(parent: Command, name: string, description: string, actionResource: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<projectId>", tCli("Project ID"))
      .argument("<workspaceId>", tCli("Workspace ID"))
      .argument("<action>", tCli("start, stop, restart, or run"))
      .option("--payload-json <json>", tCli("Runtime target JSON payload"), "{}")
      .action(async (projectId: string, workspaceId: string, action: string, opts: RuntimeActionOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.post(
            `${apiPath`/api/projects/${projectId}/workspaces/${workspaceId}`}/${actionResource}/${encodeURIComponent(action)}`,
            parseJson(opts.payloadJson ?? "{}"),
          );
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function buildApiUrl(apiBase: string, path: string): string {
  const url = new URL(apiBase);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  return url.toString();
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
