import { tCli } from "../../i18n.js";
import { Command } from "commander";
import {
  createApprovalSchema,
  requestApprovalRevisionSchema,
  resolveApprovalSchema,
  resubmitApprovalSchema,
  type Approval,
  type ApprovalComment,
} from "@paperclipai/shared";
import {
  addCommonClientOptions,
  apiPath,
  formatInlineRecord,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface ApprovalListOptions extends BaseClientOptions {
  companyId?: string;
  status?: string;
}

interface ApprovalDecisionOptions extends BaseClientOptions {
  decisionNote?: string;
  decidedByUserId?: string;
}

interface ApprovalCreateOptions extends BaseClientOptions {
  companyId?: string;
  type: string;
  requestedByAgentId?: string;
  payload: string;
  issueIds?: string;
}

interface ApprovalResubmitOptions extends BaseClientOptions {
  payload?: string;
}

interface ApprovalCommentOptions extends BaseClientOptions {
  body: string;
}

export function registerApprovalCommands(program: Command): void {
  const approval = program.command("approval").description(tCli("Approval operations"));

  addCommonClientOptions(
    approval
      .command("list")
      .description(tCli("List approvals for a company"))
      .requiredOption("-C, --company-id <id>", tCli("Company ID"))
      .option("--status <status>", tCli("Status filter"))
      .action(async (opts: ApprovalListOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const params = new URLSearchParams();
          if (opts.status) params.set("status", opts.status);
          const query = params.toString();
          const rows =
            (await ctx.api.get<Approval[]>(
              `${apiPath`/api/companies/${ctx.companyId}/approvals`}${query ? `?${query}` : ""}`,
            )) ?? [];

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
                type: row.type,
                status: row.status,
                requestedByAgentId: row.requestedByAgentId,
                requestedByUserId: row.requestedByUserId,
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
    approval
      .command("get")
      .description(tCli("Get one approval"))
      .argument("<approvalId>", tCli("Approval ID"))
      .action(async (approvalId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const row = await ctx.api.get<Approval>(apiPath`/api/approvals/${approvalId}`);
          printOutput(row, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    approval
      .command("create")
      .description(tCli("Create an approval request"))
      .requiredOption("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--type <type>", tCli("Approval type (hire_agent|approve_ceo_strategy)"))
      .requiredOption("--payload <json>", tCli("Approval payload as JSON object"))
      .option("--requested-by-agent-id <id>", tCli("Requesting agent ID"))
      .option("--issue-ids <csv>", tCli("Comma-separated linked issue IDs"))
      .action(async (opts: ApprovalCreateOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payloadJson = parseJsonObject(opts.payload, "payload");
          const payload = createApprovalSchema.parse({
            type: opts.type,
            payload: payloadJson,
            requestedByAgentId: opts.requestedByAgentId,
            issueIds: parseCsv(opts.issueIds),
          });
          const created = await ctx.api.post<Approval>(apiPath`/api/companies/${ctx.companyId}/approvals`, payload);
          printOutput(created, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    approval
      .command("approve")
      .description(tCli("Approve an approval request"))
      .argument("<approvalId>", tCli("Approval ID"))
      .option("--decision-note <text>", tCli("Decision note"))
      .option("--decided-by-user-id <id>", tCli("Decision actor user ID"))
      .action(async (approvalId: string, opts: ApprovalDecisionOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = resolveApprovalSchema.parse({
            decisionNote: opts.decisionNote,
            decidedByUserId: opts.decidedByUserId,
          });
          const updated = await ctx.api.post<Approval>(apiPath`/api/approvals/${approvalId}/approve`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    approval
      .command("reject")
      .description(tCli("Reject an approval request"))
      .argument("<approvalId>", tCli("Approval ID"))
      .option("--decision-note <text>", tCli("Decision note"))
      .option("--decided-by-user-id <id>", tCli("Decision actor user ID"))
      .action(async (approvalId: string, opts: ApprovalDecisionOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = resolveApprovalSchema.parse({
            decisionNote: opts.decisionNote,
            decidedByUserId: opts.decidedByUserId,
          });
          const updated = await ctx.api.post<Approval>(apiPath`/api/approvals/${approvalId}/reject`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    approval
      .command("request-revision")
      .description(tCli("Request revision for an approval"))
      .argument("<approvalId>", tCli("Approval ID"))
      .option("--decision-note <text>", tCli("Decision note"))
      .option("--decided-by-user-id <id>", tCli("Decision actor user ID"))
      .action(async (approvalId: string, opts: ApprovalDecisionOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = requestApprovalRevisionSchema.parse({
            decisionNote: opts.decisionNote,
            decidedByUserId: opts.decidedByUserId,
          });
          const updated = await ctx.api.post<Approval>(apiPath`/api/approvals/${approvalId}/request-revision`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    approval
      .command("resubmit")
      .description(tCli("Resubmit an approval (optionally with new payload)"))
      .argument("<approvalId>", tCli("Approval ID"))
      .option("--payload <json>", tCli("Payload JSON object"))
      .action(async (approvalId: string, opts: ApprovalResubmitOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = resubmitApprovalSchema.parse({
            payload: opts.payload ? parseJsonObject(opts.payload, "payload") : undefined,
          });
          const updated = await ctx.api.post<Approval>(apiPath`/api/approvals/${approvalId}/resubmit`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    approval
      .command("comment")
      .description(tCli("Add comment to an approval"))
      .argument("<approvalId>", tCli("Approval ID"))
      .requiredOption("--body <text>", tCli("Comment body"))
      .action(async (approvalId: string, opts: ApprovalCommentOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const created = await ctx.api.post<ApprovalComment>(apiPath`/api/approvals/${approvalId}/comments`, {
            body: opts.body,
          });
          printOutput(created, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const rows = value.split(",").map((v) => v.trim()).filter(Boolean);
  return rows.length > 0 ? rows : undefined;
}

function parseJsonObject(value: string, name: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(tCli("{{name}} must be a JSON object", { name: name }));
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(tCli("Invalid {{name}} JSON: {{value1}}", { name: name, value1: err instanceof Error ? err.message : String(err) }));
  }
}
