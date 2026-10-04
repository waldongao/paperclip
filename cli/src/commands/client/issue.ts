import { tCli, translateCliDisplayMessage } from "../../i18n.js";
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import {
  addIssueCommentSchema,
  acceptIssueThreadInteractionSchema,
  cancelIssueThreadInteractionSchema,
  checkoutIssueSchema,
  createChildIssueSchema,
  createIssueLabelSchema,
  createIssueSchema,
  createIssueThreadInteractionSchema,
  createIssueTreeHoldSchema,
  createIssueWorkProductSchema,
  type FeedbackTrace,
  type HeartbeatRun,
  linkIssueApprovalSchema,
  previewIssueTreeControlSchema,
  rejectIssueThreadInteractionSchema,
  releaseIssueTreeHoldSchema,
  respondIssueThreadInteractionSchema,
  resolveIssueRecoveryActionSchema,
  restoreIssueDocumentRevisionSchema,
  updateIssueSchema,
  updateIssueWorkProductSchema,
  type Issue,
  type IssueComment,
  upsertIssueDocumentSchema,
  upsertIssueFeedbackVoteSchema,
} from "@paperclipai/shared";
import {
  addCommonClientOptions,
  apiPath,
  formatInlineRecord,
  handleCommandError,
  inferContentTypeFromPath,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";
import {
  buildFeedbackTraceQuery,
  normalizeFeedbackTraceExportFormat,
  serializeFeedbackTraces,
} from "./feedback.js";

interface IssueBaseOptions extends BaseClientOptions {
  status?: string;
  assigneeAgentId?: string;
  projectId?: string;
  match?: string;
}

interface IssueCreateOptions extends BaseClientOptions {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeAgentId?: string;
  projectId?: string;
  goalId?: string;
  parentId?: string;
  requestDepth?: string;
  billingCode?: string;
}

interface IssueUpdateOptions extends BaseClientOptions {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeAgentId?: string;
  projectId?: string;
  goalId?: string;
  parentId?: string;
  requestDepth?: string;
  billingCode?: string;
  comment?: string;
  hiddenAt?: string;
}

interface IssueCommentOptions extends BaseClientOptions {
  body: string;
  reopen?: boolean;
  resume?: boolean;
}

interface IssueCommentListOptions extends BaseClientOptions {
  afterCommentId?: string;
  order?: string;
  limit?: string;
}

interface IssueCheckoutOptions extends BaseClientOptions {
  agentId: string;
  expectedStatuses?: string;
}

interface IssueFeedbackOptions extends BaseClientOptions {
  targetType?: string;
  vote?: string;
  status?: string;
  from?: string;
  to?: string;
  sharedOnly?: boolean;
  includePayload?: boolean;
  out?: string;
  format?: string;
}

interface IssueDeleteOptions extends BaseClientOptions {
  yes?: boolean;
}

interface JsonPayloadOptions extends BaseClientOptions {
  payloadJson: string;
}

interface IssueDocumentPutOptions extends BaseClientOptions {
  title?: string;
  format?: string;
  body?: string;
  bodyFile?: string;
  changeSummary?: string;
  baseRevisionId?: string;
}

interface IssueAttachmentUploadOptions extends BaseClientOptions {
  companyId?: string;
  file: string;
  commentId?: string;
}

interface IssueAttachmentDownloadOptions extends BaseClientOptions {
  out?: string;
}

interface IssueLabelCreateOptions extends BaseClientOptions {
  companyId?: string;
  name: string;
  color: string;
}

interface IssueRecoveryResolveOptions extends BaseClientOptions {
  actionId?: string;
  outcome: string;
  sourceIssueStatus: string;
  resolutionNote?: string;
}

interface InteractionAcceptOptions extends BaseClientOptions {
  selectedClientKeys?: string;
  selectedOptionIds?: string;
}

interface InteractionReasonOptions extends BaseClientOptions {
  reason?: string;
}

interface InteractionRespondOptions extends BaseClientOptions {
  answersJson: string;
  summaryMarkdown?: string;
}

interface TreeHoldListOptions extends BaseClientOptions {
  status?: string;
  mode?: string;
  includeMembers?: boolean;
}

export function registerIssueCommands(program: Command): void {
  const issue = program.command("issue").description(tCli("Issue operations"));

  addCommonClientOptions(
    issue
      .command("list")
      .description(tCli("List issues for a company"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .option("--status <csv>", tCli("Comma-separated statuses"))
      .option("--assignee-agent-id <id>", tCli("Filter by assignee agent ID"))
      .option("--project-id <id>", tCli("Filter by project ID"))
      .option("--match <text>", tCli("Local text match on identifier/title/description"))
      .action(async (opts: IssueBaseOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const params = new URLSearchParams();
          if (opts.status) params.set("status", opts.status);
          if (opts.assigneeAgentId) params.set("assigneeAgentId", opts.assigneeAgentId);
          if (opts.projectId) params.set("projectId", opts.projectId);

          const query = params.toString();
          const path = `${apiPath`/api/companies/${ctx.companyId}/issues`}${query ? `?${query}` : ""}`;
          const rows = (await ctx.api.get<Issue[]>(path)) ?? [];

          const filtered = filterIssueRows(rows, opts.match);
          if (ctx.json) {
            printOutput(filtered, { json: true });
            return;
          }

          if (filtered.length === 0) {
            printOutput([], { json: false });
            return;
          }

          for (const item of filtered) {
            console.log(
              formatInlineRecord({
                identifier: item.identifier,
                id: item.id,
                status: item.status,
                priority: item.priority,
                assigneeAgentId: item.assigneeAgentId,
                title: item.title,
                projectId: item.projectId,
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
    issue
      .command("get")
      .description(tCli("Get an issue by UUID or identifier (e.g. PC-12)"))
      .argument("<idOrIdentifier>", tCli("Issue ID or identifier"))
      .action(async (idOrIdentifier: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const row = await ctx.api.get<Issue>(apiPath`/api/issues/${idOrIdentifier}`);
          printOutput(row, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("delete")
      .description(tCli("Delete an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .option("--yes", tCli("Confirm deletion"))
      .action(async (issueId: string, opts: IssueDeleteOptions) => {
        try {
          if (!opts.yes) throw new Error(tCli("Refusing to delete without --yes"));
          const ctx = resolveCommandContext(opts);
          const deleted = await ctx.api.delete<Issue>(apiPath`/api/issues/${issueId}`);
          printOutput(deleted, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("heartbeat-context")
      .description(tCli("Get heartbeat context for an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const context = await ctx.api.get(apiPath`/api/issues/${issueId}/heartbeat-context`);
          printOutput(context, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("create")
      .description(tCli("Create an issue"))
      .requiredOption("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--title <title>", tCli("Issue title"))
      .option("--description <text>", tCli("Issue description"))
      .option("--status <status>", tCli("Issue status"))
      .option("--priority <priority>", tCli("Issue priority"))
      .option("--assignee-agent-id <id>", tCli("Assignee agent ID"))
      .option("--project-id <id>", tCli("Project ID"))
      .option("--goal-id <id>", tCli("Goal ID"))
      .option("--parent-id <id>", tCli("Parent issue ID"))
      .option("--request-depth <n>", tCli("Request depth integer"))
      .option("--billing-code <code>", tCli("Billing code"))
      .action(async (opts: IssueCreateOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payload = createIssueSchema.parse({
            title: opts.title,
            description: opts.description,
            status: opts.status,
            priority: opts.priority,
            assigneeAgentId: opts.assigneeAgentId,
            projectId: opts.projectId,
            goalId: opts.goalId,
            parentId: opts.parentId,
            requestDepth: parseOptionalInt(opts.requestDepth),
            billingCode: opts.billingCode,
          });

          const created = await ctx.api.post<Issue>(apiPath`/api/companies/${ctx.companyId}/issues`, payload);
          printOutput(created, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    issue
      .command("update")
      .description(tCli("Update an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .option("--title <title>", tCli("Issue title"))
      .option("--description <text>", tCli("Issue description"))
      .option("--status <status>", tCli("Issue status"))
      .option("--priority <priority>", tCli("Issue priority"))
      .option("--assignee-agent-id <id>", tCli("Assignee agent ID"))
      .option("--project-id <id>", tCli("Project ID"))
      .option("--goal-id <id>", tCli("Goal ID"))
      .option("--parent-id <id>", tCli("Parent issue ID"))
      .option("--request-depth <n>", tCli("Request depth integer"))
      .option("--billing-code <code>", tCli("Billing code"))
      .option("--comment <text>", tCli("Optional comment to add with update"))
      .option("--hidden-at <iso8601|null>", tCli("Set hiddenAt timestamp or literal 'null'"))
      .action(async (issueId: string, opts: IssueUpdateOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateIssueSchema.parse({
            title: opts.title,
            description: opts.description,
            status: opts.status,
            priority: opts.priority,
            assigneeAgentId: opts.assigneeAgentId,
            projectId: opts.projectId,
            goalId: opts.goalId,
            parentId: opts.parentId,
            requestDepth: parseOptionalInt(opts.requestDepth),
            billingCode: opts.billingCode,
            comment: opts.comment,
            hiddenAt: parseHiddenAt(opts.hiddenAt),
          });

          const updated = await ctx.api.patch<Issue & { comment?: IssueComment | null }>(apiPath`/api/issues/${issueId}`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("comment")
      .description(tCli("Add comment to issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .requiredOption("--body <text>", tCli("Comment body"))
      .option("--reopen", tCli("Reopen if issue is done/cancelled"))
      .option("--resume", tCli("Request explicit follow-up and wake the assignee when resumable"))
      .action(async (issueId: string, opts: IssueCommentOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = addIssueCommentSchema.parse({
            body: opts.body,
            reopen: opts.reopen,
            resume: opts.resume,
          });
          const comment = await ctx.api.post<IssueComment>(apiPath`/api/issues/${issueId}/comments`, payload);
          printOutput(comment, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("comments")
      .description(tCli("List issue comments"))
      .argument("<issueId>", tCli("Issue ID"))
      .option("--after-comment-id <id>", tCli("Only return comments after this comment ID"))
      .option("--order <order>", tCli("asc or desc"))
      .option("--limit <n>", tCli("Maximum comments to return"))
      .action(async (issueId: string, opts: IssueCommentListOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const params = new URLSearchParams();
          if (opts.afterCommentId) params.set("afterCommentId", opts.afterCommentId);
          if (opts.order) params.set("order", opts.order);
          if (opts.limit) params.set("limit", opts.limit);
          const query = params.toString();
          const comments = (await ctx.api.get<IssueComment[]>(
            `${apiPath`/api/issues/${issueId}/comments`}${query ? `?${query}` : ""}`,
          )) ?? [];
          printOutput(comments, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("comment:get")
      .description(tCli("Get one issue comment"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<commentId>", tCli("Comment ID"))
      .action(async (issueId: string, commentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const comment = await ctx.api.get<IssueComment>(apiPath`/api/issues/${issueId}/comments/${commentId}`);
          printOutput(comment, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("comment:delete")
      .description(tCli("Delete or cancel one issue comment"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<commentId>", tCli("Comment ID"))
      .action(async (issueId: string, commentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const deleted = await ctx.api.delete<IssueComment>(apiPath`/api/issues/${issueId}/comments/${commentId}`);
          printOutput(deleted, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("approvals")
      .description(tCli("List approvals linked to an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const approvals = await ctx.api.get(apiPath`/api/issues/${issueId}/approvals`);
          printOutput(approvals, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("approval:link")
      .description(tCli("Link an approval to an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<approvalId>", tCli("Approval ID"))
      .action(async (issueId: string, approvalId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = linkIssueApprovalSchema.parse({ approvalId });
          const approvals = await ctx.api.post(apiPath`/api/issues/${issueId}/approvals`, payload);
          printOutput(approvals, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("approval:unlink")
      .description(tCli("Unlink an approval from an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<approvalId>", tCli("Approval ID"))
      .action(async (issueId: string, approvalId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.delete(apiPath`/api/issues/${issueId}/approvals/${approvalId}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addIssuePostDeleteMarkerCommand(issue, "read", tCli("Mark an issue as read"), "post", "/read");
  addIssuePostDeleteMarkerCommand(issue, "unread", tCli("Mark an issue as unread"), "delete", "/read");
  addIssuePostDeleteMarkerCommand(issue, "archive", tCli("Archive an issue from the inbox"), "post", "/inbox-archive");
  addIssuePostDeleteMarkerCommand(issue, "unarchive", tCli("Unarchive an issue from the inbox"), "delete", "/inbox-archive");

  addCommonClientOptions(
    issue
      .command("recovery-actions")
      .description(tCli("List active recovery actions for an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.get(apiPath`/api/issues/${issueId}/recovery-actions`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("recovery:resolve")
      .description(tCli("Resolve an issue recovery action"))
      .argument("<issueId>", tCli("Issue ID"))
      .requiredOption("--outcome <outcome>", tCli("restored, false_positive, blocked, or cancelled"))
      .requiredOption("--source-issue-status <status>", tCli("todo, done, or in_review for restored outcomes; blocked is only valid for blocked outcomes"))
      .option("--action-id <id>", tCli("Specific recovery action ID"))
      .option("--resolution-note <text>", tCli("Resolution note"))
      .action(async (issueId: string, opts: IssueRecoveryResolveOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = resolveIssueRecoveryActionSchema.parse({
            actionId: opts.actionId,
            outcome: opts.outcome,
            sourceIssueStatus: opts.sourceIssueStatus,
            resolutionNote: opts.resolutionNote,
          });
          const result = await ctx.api.post(apiPath`/api/issues/${issueId}/recovery-actions/resolve`, payload);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("child:create")
      .description(tCli("Create a child issue from a JSON payload"))
      .argument("<issueId>", tCli("Parent issue ID"))
      .requiredOption("--payload-json <json>", tCli("CreateChildIssue JSON payload"))
      .action(async (issueId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = createChildIssueSchema.parse(parseJson(opts.payloadJson));
          const child = await ctx.api.post<Issue>(apiPath`/api/issues/${issueId}/children`, payload);
          printOutput(child, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("force-release")
      .description(tCli("Force-release an issue from an agent checkout"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.post(apiPath`/api/issues/${issueId}/admin/force-release`, {});
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("work-products")
      .description(tCli("List issue work products"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const rows = await ctx.api.get(apiPath`/api/issues/${issueId}/work-products`);
          printOutput(rows, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("work-product:create")
      .description(tCli("Create an issue work product from JSON"))
      .argument("<issueId>", tCli("Issue ID"))
      .requiredOption("--payload-json <json>", tCli("CreateIssueWorkProduct JSON payload"))
      .action(async (issueId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = createIssueWorkProductSchema.parse(parseJson(opts.payloadJson));
          const product = await ctx.api.post(apiPath`/api/issues/${issueId}/work-products`, payload);
          printOutput(product, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("work-product:update")
      .description(tCli("Update a work product from JSON"))
      .argument("<workProductId>", tCli("Work product ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateIssueWorkProduct JSON payload"))
      .action(async (workProductId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateIssueWorkProductSchema.parse(parseJson(opts.payloadJson));
          const product = await ctx.api.patch(apiPath`/api/work-products/${workProductId}`, payload);
          printOutput(product, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("work-product:delete")
      .description(tCli("Delete a work product"))
      .argument("<workProductId>", tCli("Work product ID"))
      .action(async (workProductId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const product = await ctx.api.delete(apiPath`/api/work-products/${workProductId}`);
          printOutput(product, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("documents")
      .description(tCli("List issue documents"))
      .argument("<issueId>", tCli("Issue ID"))
      .option("--include-system", tCli("Include system documents"))
      .action(async (issueId: string, opts: BaseClientOptions & { includeSystem?: boolean }) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = opts.includeSystem ? "?includeSystem=true" : "";
          const docs = await ctx.api.get(`${apiPath`/api/issues/${issueId}/documents`}${query}`);
          printOutput(docs, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("document:get")
      .description(tCli("Get an issue document"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<key>", tCli("Document key"))
      .action(async (issueId: string, key: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const doc = await ctx.api.get(apiPath`/api/issues/${issueId}/documents/${key}`);
          printOutput(doc, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("document:put")
      .description(tCli("Create or update an issue document"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<key>", tCli("Document key"))
      .option("--title <title>", tCli("Document title"))
      .option("--format <format>", tCli("Document format"), "markdown")
      .option("--body <markdown>", tCli("Document body"))
      .option("--body-file <path>", tCli("Read document body from a file"))
      .option("--change-summary <text>", tCli("Change summary"))
      .option("--base-revision-id <id>", tCli("Expected base revision ID"))
      .action(async (issueId: string, key: string, opts: IssueDocumentPutOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const body = opts.bodyFile ? await readFile(opts.bodyFile, "utf8") : opts.body;
          const payload = upsertIssueDocumentSchema.parse({
            title: opts.title,
            format: opts.format,
            body,
            changeSummary: opts.changeSummary,
            baseRevisionId: opts.baseRevisionId,
          });
          const doc = await ctx.api.put(apiPath`/api/issues/${issueId}/documents/${key}`, payload);
          printOutput(doc, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("interactions")
      .description(tCli("List issue thread interactions"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const interactions = await ctx.api.get(apiPath`/api/issues/${issueId}/interactions`);
          printOutput(interactions, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("interaction:create")
      .description(tCli("Create an issue thread interaction from JSON"))
      .argument("<issueId>", tCli("Issue ID"))
      .requiredOption("--payload-json <json>", tCli("CreateIssueThreadInteraction JSON payload"))
      .action(async (issueId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = createIssueThreadInteractionSchema.parse(parseJson(opts.payloadJson));
          const interaction = await ctx.api.post(apiPath`/api/issues/${issueId}/interactions`, payload);
          printOutput(interaction, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("interaction:accept")
      .description(tCli("Accept an issue thread interaction"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<interactionId>", tCli("Interaction ID"))
      .option("--selected-client-keys <csv>", tCli("Client keys to accept"))
      .option("--selected-option-ids <csv>", tCli("Checkbox option IDs to accept"))
      .action(async (issueId: string, interactionId: string, opts: InteractionAcceptOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = acceptIssueThreadInteractionSchema.parse({
            selectedClientKeys: opts.selectedClientKeys === undefined ? undefined : parseCsv(opts.selectedClientKeys),
            selectedOptionIds: opts.selectedOptionIds === undefined ? undefined : parseCsv(opts.selectedOptionIds),
          });
          const interaction = await ctx.api.post(apiPath`/api/issues/${issueId}/interactions/${interactionId}/accept`, payload);
          printOutput(interaction, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  for (const [name, action, schema, description] of [
    ["interaction:reject", "reject", rejectIssueThreadInteractionSchema, tCli("Reject an issue thread interaction")],
    ["interaction:cancel", "cancel", cancelIssueThreadInteractionSchema, tCli("Cancel an issue thread interaction")],
  ] as const) {
    addCommonClientOptions(
      issue
        .command(name)
        .description(description)
        .argument("<issueId>", tCli("Issue ID"))
        .argument("<interactionId>", tCli("Interaction ID"))
        .option("--reason <text>", tCli("Reason"))
        .action(async (issueId: string, interactionId: string, opts: InteractionReasonOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            const payload = schema.parse({ reason: opts.reason });
            const interaction = await ctx.api.post(`${apiPath`/api/issues/${issueId}/interactions/${interactionId}`}/${action}`, payload);
            printOutput(interaction, { json: ctx.json });
          } catch (err) {
            handleCommandError(err);
          }
        }),
    );
  }

  addCommonClientOptions(
    issue
      .command("interaction:respond")
      .description(tCli("Respond to an issue question interaction"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<interactionId>", tCli("Interaction ID"))
      .requiredOption("--answers-json <json>", tCli("Answers array JSON"))
      .option("--summary-markdown <markdown>", tCli("Optional response summary"))
      .action(async (issueId: string, interactionId: string, opts: InteractionRespondOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = respondIssueThreadInteractionSchema.parse({
            answers: parseJson(opts.answersJson),
            summaryMarkdown: opts.summaryMarkdown,
          });
          const interaction = await ctx.api.post(apiPath`/api/issues/${issueId}/interactions/${interactionId}/respond`, payload);
          printOutput(interaction, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("tree-state")
      .description(tCli("Get issue tree control state"))
      .argument("<issueId>", tCli("Root issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const state = await ctx.api.get(apiPath`/api/issues/${issueId}/tree-control/state`);
          printOutput(state, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("tree-preview")
      .description(tCli("Preview issue tree control changes"))
      .argument("<issueId>", tCli("Root issue ID"))
      .requiredOption("--payload-json <json>", tCli("PreviewIssueTreeControl JSON payload"))
      .action(async (issueId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = previewIssueTreeControlSchema.parse(parseJson(opts.payloadJson));
          const preview = await ctx.api.post(apiPath`/api/issues/${issueId}/tree-control/preview`, payload);
          printOutput(preview, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("tree-holds")
      .description(tCli("List issue tree holds"))
      .argument("<issueId>", tCli("Root issue ID"))
      .option("--status <status>", tCli("active or released"))
      .option("--mode <mode>", tCli("pause, resume, cancel, or restore"))
      .option("--include-members", tCli("Include hold members"))
      .action(async (issueId: string, opts: TreeHoldListOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const params = new URLSearchParams();
          if (opts.status) params.set("status", opts.status);
          if (opts.mode) params.set("mode", opts.mode);
          if (opts.includeMembers) params.set("includeMembers", "true");
          const query = params.toString();
          const holds = await ctx.api.get(`${apiPath`/api/issues/${issueId}/tree-holds`}${query ? `?${query}` : ""}`);
          printOutput(holds, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("tree-hold:create")
      .description(tCli("Create an issue tree hold from JSON"))
      .argument("<issueId>", tCli("Root issue ID"))
      .requiredOption("--payload-json <json>", tCli("CreateIssueTreeHold JSON payload"))
      .action(async (issueId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = createIssueTreeHoldSchema.parse(parseJson(opts.payloadJson));
          const hold = await ctx.api.post(apiPath`/api/issues/${issueId}/tree-holds`, payload);
          printOutput(hold, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("tree-hold:get")
      .description(tCli("Get an issue tree hold"))
      .argument("<issueId>", tCli("Root issue ID"))
      .argument("<holdId>", tCli("Hold ID"))
      .action(async (issueId: string, holdId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const hold = await ctx.api.get(apiPath`/api/issues/${issueId}/tree-holds/${holdId}`);
          printOutput(hold, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("tree-hold:release")
      .description(tCli("Release an issue tree hold"))
      .argument("<issueId>", tCli("Root issue ID"))
      .argument("<holdId>", tCli("Hold ID"))
      .option("--payload-json <json>", tCli("ReleaseIssueTreeHold JSON payload"), "{}")
      .action(async (issueId: string, holdId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = releaseIssueTreeHoldSchema.parse(parseJson(opts.payloadJson));
          const hold = await ctx.api.post(apiPath`/api/issues/${issueId}/tree-holds/${holdId}/release`, payload);
          printOutput(hold, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("attachments")
      .description(tCli("List issue attachments"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const attachments = await ctx.api.get(apiPath`/api/issues/${issueId}/attachments`);
          printOutput(attachments, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("attachment:upload")
      .description(tCli("Upload an issue attachment"))
      .argument("<issueId>", tCli("Issue ID"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--file <path>", tCli("File to upload"))
      .option("--comment-id <id>", tCli("Attach to an issue comment"))
      .action(async (issueId: string, opts: IssueAttachmentUploadOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const attachment = await uploadAttachment(ctx.api.apiBase, ctx.api.apiKey, {
            companyId: ctx.companyId ?? "",
            issueId,
            filePath: opts.file,
            commentId: opts.commentId,
            runId: ctx.api.runId,
          });
          printOutput(attachment, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    issue
      .command("attachment:download")
      .description(tCli("Download an attachment"))
      .argument("<attachmentId>", tCli("Attachment ID"))
      .option("--out <path>", tCli("Output file path; prints to stdout when omitted"))
      .action(async (attachmentId: string, opts: IssueAttachmentDownloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const bytes = await downloadAttachment(ctx.api.apiBase, ctx.api.apiKey, attachmentId);
          if (opts.out) {
            await writeFile(opts.out, bytes);
            if (ctx.json) printOutput({ out: opts.out, bytes: bytes.byteLength }, { json: true });
            else console.log(tCli("Wrote {{byteLength}} byte(s) to {{out}}", { byteLength: bytes.byteLength, out: opts.out }));
            return;
          }
          process.stdout.write(bytes);
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("attachment:delete")
      .description(tCli("Delete an attachment"))
      .argument("<attachmentId>", tCli("Attachment ID"))
      .action(async (attachmentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.delete(apiPath`/api/attachments/${attachmentId}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("label:list")
      .description(tCli("List issue labels in a company"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const labels = await ctx.api.get(apiPath`/api/companies/${ctx.companyId}/labels`);
          printOutput(labels, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    issue
      .command("label:create")
      .description(tCli("Create an issue label"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .requiredOption("--name <name>", tCli("Label name"))
      .requiredOption("--color <hex>", tCli("Label color, e.g. #4f46e5"))
      .action(async (opts: IssueLabelCreateOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payload = createIssueLabelSchema.parse({ name: opts.name, color: opts.color });
          const label = await ctx.api.post(apiPath`/api/companies/${ctx.companyId}/labels`, payload);
          printOutput(label, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    issue
      .command("label:delete")
      .description(tCli("Delete an issue label"))
      .argument("<labelId>", tCli("Label ID"))
      .action(async (labelId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.delete(apiPath`/api/labels/${labelId}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("feedback:votes")
      .description(tCli("List feedback votes for an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const votes = await ctx.api.get(apiPath`/api/issues/${issueId}/feedback-votes`);
          printOutput(votes, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("feedback:vote")
      .description(tCli("Create or update a feedback vote"))
      .argument("<issueId>", tCli("Issue ID"))
      .requiredOption("--payload-json <json>", tCli("UpsertIssueFeedbackVote JSON payload"))
      .action(async (issueId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = upsertIssueFeedbackVoteSchema.parse(parseJson(opts.payloadJson));
          const vote = await ctx.api.post(apiPath`/api/issues/${issueId}/feedback-votes`, payload);
          printOutput(vote, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  for (const [name, pathSuffix, description] of [
    ["document:delete", "", tCli("Delete an issue document")],
    ["document:lock", "/lock", tCli("Lock an issue document")],
    ["document:unlock", "/unlock", tCli("Unlock an issue document")],
  ] as const) {
    addCommonClientOptions(
      issue
        .command(name)
        .description(description)
        .argument("<issueId>", tCli("Issue ID"))
        .argument("<key>", tCli("Document key"))
        .action(async (issueId: string, key: string, opts: BaseClientOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            const path = `${apiPath`/api/issues/${issueId}/documents/${key}`}${pathSuffix}`;
            const result = name === "document:delete" ? await ctx.api.delete(path) : await ctx.api.post(path, {});
            printOutput(result, { json: ctx.json });
          } catch (err) {
            handleCommandError(err);
          }
        }),
    );
  }

  addCommonClientOptions(
    issue
      .command("document:revisions")
      .description(tCli("List issue document revisions"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<key>", tCli("Document key"))
      .action(async (issueId: string, key: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const revisions = await ctx.api.get(apiPath`/api/issues/${issueId}/documents/${key}/revisions`);
          printOutput(revisions, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("document:restore")
      .description(tCli("Restore an issue document revision"))
      .argument("<issueId>", tCli("Issue ID"))
      .argument("<key>", tCli("Document key"))
      .argument("<revisionId>", tCli("Revision ID"))
      .action(async (issueId: string, key: string, revisionId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = restoreIssueDocumentRevisionSchema.parse({});
          const doc = await ctx.api.post(
            apiPath`/api/issues/${issueId}/documents/${key}/revisions/${revisionId}/restore`,
            payload,
          );
          printOutput(doc, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("feedback:list")
      .description(tCli("List feedback traces for an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .option("--target-type <type>", tCli("Filter by target type"))
      .option("--vote <vote>", tCli("Filter by vote value"))
      .option("--status <status>", tCli("Filter by trace status"))
      .option("--from <iso8601>", tCli("Only include traces created at or after this timestamp"))
      .option("--to <iso8601>", tCli("Only include traces created at or before this timestamp"))
      .option("--shared-only", tCli("Only include traces eligible for sharing/export"))
      .option("--include-payload", tCli("Include stored payload snapshots in the response"))
      .action(async (issueId: string, opts: IssueFeedbackOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const traces = (await ctx.api.get<FeedbackTrace[]>(
            `${apiPath`/api/issues/${issueId}/feedback-traces`}${buildFeedbackTraceQuery(opts)}`,
          )) ?? [];
          if (ctx.json) {
            printOutput(traces, { json: true });
            return;
          }
          printOutput(
            traces.map((trace) => ({
              id: trace.id,
              issue: trace.issueIdentifier ?? trace.issueId,
              vote: trace.vote,
              status: trace.status,
              targetType: trace.targetType,
              target: trace.targetSummary.label,
            })),
            { json: false },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("runs")
      .description(tCli("List heartbeat runs associated with an issue"))
      .argument("<issueId>", tCli("Issue ID or identifier"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const rows = (await ctx.api.get<unknown[]>(apiPath`/api/issues/${issueId}/runs`)) ?? [];
          printOutput(rows, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("live-runs")
      .description(tCli("List queued and running heartbeat runs associated with an issue"))
      .argument("<issueId>", tCli("Issue ID or identifier"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const rows = (await ctx.api.get<HeartbeatRun[]>(apiPath`/api/issues/${issueId}/live-runs`)) ?? [];
          printOutput(rows, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("active-run")
      .description(tCli("Show the active heartbeat run associated with an issue"))
      .argument("<issueId>", tCli("Issue ID or identifier"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const run = await ctx.api.get<HeartbeatRun | null>(apiPath`/api/issues/${issueId}/active-run`);
          printOutput(run, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("feedback:export")
      .description(tCli("Export feedback traces for an issue"))
      .argument("<issueId>", tCli("Issue ID"))
      .option("--target-type <type>", tCli("Filter by target type"))
      .option("--vote <vote>", tCli("Filter by vote value"))
      .option("--status <status>", tCli("Filter by trace status"))
      .option("--from <iso8601>", tCli("Only include traces created at or after this timestamp"))
      .option("--to <iso8601>", tCli("Only include traces created at or before this timestamp"))
      .option("--shared-only", tCli("Only include traces eligible for sharing/export"))
      .option("--include-payload", tCli("Include stored payload snapshots in the export"))
      .option("--out <path>", tCli("Write export to a file path instead of stdout"))
      .option("--format <format>", tCli("Export format: json or ndjson"), "ndjson")
      .action(async (issueId: string, opts: IssueFeedbackOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const traces = (await ctx.api.get<FeedbackTrace[]>(
            `${apiPath`/api/issues/${issueId}/feedback-traces`}${buildFeedbackTraceQuery(opts, opts.includePayload ?? true)}`,
          )) ?? [];
            const serialized = serializeFeedbackTraces(traces, opts.format);
            if (opts.out?.trim()) {
              await writeFile(opts.out, serialized, "utf8");
              if (ctx.json) {
                printOutput(
                  { out: opts.out, count: traces.length, format: normalizeFeedbackTraceExportFormat(opts.format) },
                  { json: true },
                );
                return;
              }
              console.log(tCli("Wrote {{count}} feedback trace(s) to {{out}}", { count: traces.length, out: opts.out }));
            return;
          }
          process.stdout.write(`${serialized}${serialized.endsWith("\n") ? "" : "\n"}`);
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("checkout")
      .description(tCli("Checkout issue for an agent"))
      .argument("<issueId>", tCli("Issue ID"))
      .requiredOption("--agent-id <id>", tCli("Agent ID"))
      .option(
        "--expected-statuses <csv>",
        tCli("Expected current statuses"),
        "todo,backlog,blocked",
      )
      .action(async (issueId: string, opts: IssueCheckoutOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = checkoutIssueSchema.parse({
            agentId: opts.agentId,
            expectedStatuses: parseCsv(opts.expectedStatuses),
          });
          const updated = await ctx.api.post<Issue>(apiPath`/api/issues/${issueId}/checkout`, payload);
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    issue
      .command("release")
      .description(tCli("Release issue back to todo and clear assignee"))
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const updated = await ctx.api.post<Issue>(apiPath`/api/issues/${issueId}/release`, {});
          printOutput(updated, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function addIssuePostDeleteMarkerCommand(
  issue: Command,
  name: string,
  description: string,
  method: "post" | "delete",
  pathSuffix: string,
): void {
  addCommonClientOptions(
    issue
      .command(name)
      .description(description)
      .argument("<issueId>", tCli("Issue ID"))
      .action(async (issueId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = method === "post"
            ? await ctx.api.post(`${apiPath`/api/issues/${issueId}`}${pathSuffix}`, {})
            : await ctx.api.delete(`${apiPath`/api/issues/${issueId}`}${pathSuffix}`);
          printOutput(result, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(tCli("Invalid integer value: {{value}}", { value: value }));
  }
  return parsed;
}

function parseHiddenAt(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value.trim().toLowerCase() === "null") return null;
  return value;
}

function filterIssueRows(rows: Issue[], match: string | undefined): Issue[] {
  if (!match?.trim()) return rows;
  const needle = match.trim().toLowerCase();
  return rows.filter((row) => {
    const text = [row.identifier, row.title, row.description]
      .filter((part): part is string => Boolean(part))
      .join("\n")
      .toLowerCase();
    return text.includes(needle);
  });
}

function buildApiUrl(apiBase: string, path: string): string {
  const url = new URL(apiBase);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  return url.toString();
}

async function uploadAttachment(
  apiBase: string,
  apiKey: string | undefined,
  input: { companyId: string; issueId: string; filePath: string; commentId?: string; runId?: string },
): Promise<unknown> {
  const bytes = await readFile(input.filePath);
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: inferContentTypeFromPath(input.filePath) }), input.filePath.split(/[\\/]/).pop() ?? "attachment");
  if (input.commentId) form.set("issueCommentId", input.commentId);
  // This multipart upload uses a hand-rolled fetch rather than PaperclipApiClient,
  // so it must forward the agent run-id header itself — otherwise an
  // agent-authenticated upload is rejected with "401 Agent run id required"
  // (the client injects x-paperclip-run-id automatically for JSON requests).
  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (input.runId) headers["x-paperclip-run-id"] = input.runId;
  const response = await fetch(buildApiUrl(apiBase, apiPath`/api/companies/${input.companyId}/issues/${input.issueId}/attachments`), {
    method: "POST",
    headers,
    body: form,
  });
  return parseFetchResponse(response);
}

async function downloadAttachment(
  apiBase: string,
  apiKey: string | undefined,
  attachmentId: string,
): Promise<Buffer> {
  const response = await fetch(buildApiUrl(apiBase, apiPath`/api/attachments/${attachmentId}/content`), {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!response.ok) {
    await parseFetchResponse(response);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function parseFetchResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const parsed = text.trim() ? safeJson(text) : null;
  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed !== null && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : tCli("Request failed with status {{status}}", { status: response.status });
    throw new Error(tCli("API error {{status}}: {{message}}", { status: response.status, message: translateCliDisplayMessage(message) }));
  }
  return parsed;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
