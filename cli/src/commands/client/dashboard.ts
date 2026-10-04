import { tCli } from "../../i18n.js";
import { Command } from "commander";
import type { DashboardSummary } from "@paperclipai/shared";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface DashboardGetOptions extends BaseClientOptions {
  companyId?: string;
}

export function registerDashboardCommands(program: Command): void {
  const dashboard = program.command("dashboard").description(tCli("Dashboard summary operations"));

  addCommonClientOptions(
    dashboard
      .command("get")
      .description(tCli("Get dashboard summary for a company"))
      .requiredOption("-C, --company-id <id>", tCli("Company ID"))
      .action(async (opts: DashboardGetOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const row = await ctx.api.get<DashboardSummary>(apiPath`/api/companies/${ctx.companyId}/dashboard`);
          printOutput(row, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
