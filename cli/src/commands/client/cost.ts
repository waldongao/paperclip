import { tCli } from "../../i18n.js";
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

interface IncidentOptions extends CompanyOptions {
  payloadJson?: string;
}

export function registerCostCommands(program: Command): void {
  const cost = program.command("cost").description(tCli("Cost and finance operations"));

  for (const [name, path] of [
    ["summary", "costs/summary"],
    ["by-agent", "costs/by-agent"],
    ["by-agent-model", "costs/by-agent-model"],
    ["by-provider", "costs/by-provider"],
    ["by-biller", "costs/by-biller"],
    ["by-project", "costs/by-project"],
    ["window-spend", "costs/window-spend"],
    ["quota-windows", "costs/quota-windows"],
  ] as const) {
    addCompanyGet(cost, name, tCli("Get {{name}} cost data", { name: tCli(name) }), path);
  }

  addCommonClientOptions(
    cost
      .command("issue")
      .description(tCli("Get cost summary for an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/issues/${issueId}/cost-summary`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCompanyPostJson(cost, "event:create", tCli("Record a cost event"), "cost-events");

  const finance = program.command("finance").description(tCli("Finance event and summary operations"));
  addCompanyPostJson(finance, "event:create", tCli("Record a finance event"), "finance-events");
  addCompanyGet(finance, "events", tCli("List finance events"), "costs/finance-events");
  addCompanyGet(finance, "summary", tCli("Get finance summary"), "costs/finance-summary");
  addCompanyGet(finance, "by-biller", tCli("Get finance summary by biller"), "costs/finance-by-biller");
  addCompanyGet(finance, "by-kind", tCli("Get finance summary by kind"), "costs/finance-by-kind");

  const budget = program.command("budget").description(tCli("Budget policy and incident operations"));
  addCompanyGet(budget, "overview", tCli("Get budget overview"), "budgets/overview");
  addCompanyPostJson(budget, "policy:upsert", tCli("Create or update a budget policy"), "budgets/policies");

  addCommonClientOptions(
    budget
      .command("company:update")
      .description(tCli("Update company budget"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateBudget JSON payload"))
      .action(async (opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const result = await ctx.api.patch(apiPath`/api/companies/${ctx.companyId}/budgets`, parseJson(opts.payloadJson));
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    budget
      .command("agent:update")
      .description(tCli("Update agent budget"))
      .argument("<agentId>", tCli("Agent ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateBudget JSON payload"))
      .action(async (agentId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.patch(apiPath`/api/agents/${agentId}/budgets`, parseJson(opts.payloadJson));
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    budget
      .command("incident:resolve")
      .description(tCli("Resolve a budget incident"))
      .argument("<incidentId>", tCli("Budget incident ID"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .option("--payload-json <json>", tCli("ResolveBudgetIncident JSON payload"), "{}")
      .action(async (incidentId: string, opts: IncidentOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const result = await ctx.api.post(
            apiPath`/api/companies/${ctx.companyId}/budget-incidents/${incidentId}/resolve`,
            parseJson(opts.payloadJson ?? "{}"),
          );
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
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

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
