import { tCli, translateCliDisplayMessage } from "../i18n.js";
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import pc from "picocolors";
import { ApiRequestError } from "../client/http.js";
import {
  addCommonClientOptions,
  apiPath,
  formatInlineRecord,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
  type ResolvedClientContext,
} from "./client/common.js";

type JsonObject = Record<string, unknown>;

type PipelineStage = {
  id: string;
  key: string;
  name: string;
  kind: string;
  position: number;
  config?: JsonObject;
};

type PipelineSummary = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  enforceTransitions?: boolean;
  stageCount?: number;
  openCaseCount?: number;
};

type PipelineDetail = PipelineSummary & {
  stages?: PipelineStage[];
  transitions?: Array<{ fromStageId: string; toStageId: string; label?: string | null }>;
  documentKeys?: Array<{ key: string; documentId: string }>;
};

type PipelineCase = {
  id: string;
  caseKey: string;
  title: string;
  summary?: string | null;
  pipelineId: string;
  stageId: string;
  version: number;
  terminalKind?: string | null;
  childCount?: number;
  terminalChildCount?: number;
  pendingSuggestion?: JsonObject | null;
};

type CaseListRow = {
  case: PipelineCase;
  stage: PipelineStage;
};

type CaseDetail = CaseListRow & {
  pipeline: PipelineSummary;
  allowedNextStages?: PipelineStage[];
  blockers?: unknown[];
  blocks?: unknown[];
  links?: unknown[];
  childrenSummary?: JsonObject;
  pendingSuggestion?: JsonObject | null;
};

interface PipelineOptions extends BaseClientOptions {
  companyId?: string;
}

interface CreateOptions extends PipelineOptions {
  key: string;
  name: string;
  description?: string;
  projectId?: string;
  enforceTransitions?: boolean;
  stagesJson?: string;
  stagesFile?: string;
}

interface TransitionSetOptions extends PipelineOptions {
  file: string;
  enforce?: boolean;
}

interface GuidancePutOptions extends PipelineOptions {
  file?: string;
  body?: string;
  title?: string;
}

interface AutomationOptions extends PipelineOptions {
  stage: string;
  routine: string;
  note?: string;
}

interface IngestOptions extends PipelineOptions {
  caseKey?: string;
  title: string;
  summary?: string;
  fieldsJson?: string;
  fieldsFile?: string;
  stage?: string;
  parentCase?: string;
  workspaceRefJson?: string;
  blockedBy?: string;
  blockedByKey?: string;
}

interface IngestBatchOptions extends PipelineOptions {
  file: string;
}

interface CasesOptions extends PipelineOptions {
  stage?: string;
  parent?: string;
  terminal?: boolean;
  q?: string;
}

interface EditOptions extends PipelineOptions {
  expectedVersion?: string;
  title?: string;
  summary?: string;
  fieldsJson?: string;
  fieldsFile?: string;
  workspaceRefJson?: string;
  parentCase?: string;
  leaseToken?: string;
}

interface ClaimOptions extends PipelineOptions {
  leaseSeconds?: string;
}

interface ReleaseOptions extends PipelineOptions {
  leaseToken?: string;
  force?: boolean;
}

interface CaseTransitionOptions extends PipelineOptions {
  to: string;
  expectedVersion: string;
  reason?: string;
  leaseToken?: string;
  acceptSuggestion?: string;
}

interface SuggestOptions extends PipelineOptions {
  to: string;
  rationale: string;
  confidence?: string;
}

interface ResolveSuggestionOptions extends PipelineOptions {
  suggestion: string;
  accept?: boolean;
  dismiss?: boolean;
  expectedVersion?: string;
  reason?: string;
  leaseToken?: string;
}

interface ReviewOptions extends PipelineOptions {
  approve?: boolean;
  reject?: boolean;
  requestChanges?: boolean;
  reason?: string;
  expectedVersion: string;
  editsJson?: string;
  editsFile?: string;
  title?: string;
  summary?: string;
  fieldsJson?: string;
  fieldsFile?: string;
  leaseToken?: string;
}

interface BlockOptions extends PipelineOptions {
  by: string;
}

interface ReviewInboxOptions extends PipelineOptions {
  pipeline?: string;
  parent?: string;
}

interface ReviewBulkOptions extends PipelineOptions {
  file: string;
}

export function registerPipelineCommands(program: Command): void {
  const pipelines = program.command("pipelines").description(tCli("Pipeline and case operations"));

  addPipelineOptions(
    pipelines
      .command("create")
      .description(tCli("Create a pipeline"))
      .requiredOption("--key <key>", tCli("Pipeline key"))
      .requiredOption("--name <name>", tCli("Pipeline name"))
      .option("--description <text>", tCli("Pipeline description"))
      .option("--project-id <id>", tCli("Project ID"))
      .option("--enforce-transitions", tCli("Only allow configured transitions"))
      .option("--stages-json <json>", tCli("Pipeline stage array as JSON"))
      .option("--stages-file <path>", tCli("Read pipeline stage array from JSON file"))
      .action((opts: CreateOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body: JsonObject = {
          key: opts.key,
          name: opts.name,
        };
        setIfDefined(body, "description", opts.description);
        setIfDefined(body, "projectId", opts.projectId);
        setIfDefined(body, "enforceTransitions", opts.enforceTransitions);
        const stages = await readJsonFromOptions(opts.stagesJson, opts.stagesFile);
        if (stages !== undefined) body.stages = stages;
        printPipeline(await ctx.api.post<PipelineDetail>(apiPath`/api/companies/${ctx.companyId}/pipelines`, body), ctx);
      })),
  );

  addPipelineOptions(
    pipelines
      .command("list")
      .description(tCli("List pipelines"))
      .action((opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const rows = await ctx.api.get<PipelineSummary[]>(apiPath`/api/companies/${ctx.companyId}/pipelines`) ?? [];
        if (ctx.json) return printOutput(rows, { json: true });
        if (rows.length === 0) return printOutput([]);
        rows.forEach((row) => console.log(formatPipeline(row)));
      })),
  );

  addPipelineOptions(
    pipelines
      .command("get")
      .description(tCli("Get a pipeline by ID or key"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .action((pipeline: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printPipeline(await getPipeline(ctx, pipeline), ctx);
      })),
  );

  addPipelineOptions(
    pipelines
      .command("set-transitions")
      .description(tCli("Replace a pipeline transition edge set"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .requiredOption("--file <path>", tCli("JSON file with transition array or { transitions }"))
      .option("--enforce", tCli("Enable transition enforcement"))
      .action((pipeline: string, opts: TransitionSetOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const input = await readJsonFile(opts.file);
        const body = Array.isArray(input) ? { transitions: input } : asObject(input);
        if (opts.enforce !== undefined) body.enforceTransitions = true;
        printOutput(await ctx.api.put(apiPath`/api/pipelines/${pipelineId}/transitions`, body), { json: ctx.json });
      })),
  );

  const guidance = pipelines.command("guidance").description(tCli("Pipeline guidance document operations"));
  addPipelineOptions(
    guidance
      .command("get")
      .description(tCli("Get pipeline guidance"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .action((pipeline: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const result = await ctx.api.get(apiPath`/api/pipelines/${pipelineId}/documents/guidance`);
        printOutput(result, { json: ctx.json });
      })),
  );
  addPipelineOptions(
    guidance
      .command("put")
      .description(tCli("Create or replace pipeline guidance"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .option("--file <path>", tCli("Markdown file"))
      .option("--body <markdown>", tCli("Markdown body"))
      .option("--title <title>", tCli("Document title"))
      .action((pipeline: string, opts: GuidancePutOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const body = opts.body ?? (opts.file ? await readFile(opts.file, "utf8") : undefined);
        if (body === undefined) throw new Error(tCli("Guidance body is required. Pass --file or --body."));
        printOutput(await ctx.api.put(apiPath`/api/pipelines/${pipelineId}/documents/guidance`, {
          title: opts.title ?? tCli("Pipeline guidance"),
          body,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("set-automation")
      .description(tCli("Set a run_routine onEnter automation on a stage"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .requiredOption("--stage <key>", tCli("Stage key"))
      .requiredOption("--routine <id>", tCli("Routine ID"))
      .option("--note <text>", tCli("Automation note"))
      .action((pipeline: string, opts: AutomationOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const detail = await getPipeline(ctx, pipeline);
        const stage = detail.stages?.find((item) => item.key === opts.stage);
        if (!stage) throw new Error(tCli("Stage not found on pipeline {{value1}}: {{value2}}", { value1: String(detail.key), value2: String(opts.stage) }));
        const config = {
          ...(stage.config ?? {}),
          onEnter: {
            ...(asOptionalObject(stage.config?.onEnter) ?? {}),
            type: "run_routine",
            routineId: opts.routine,
            ...(opts.note ? { note: opts.note } : {}),
          },
        };
        printOutput(await ctx.api.patch(apiPath`/api/pipelines/${detail.id}/stages/${stage.id}`, { config }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("ingest")
      .description(tCli("Ingest one case into a pipeline"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .option("--case-key <key>", tCli("Case idempotency key"))
      .requiredOption("--title <title>", tCli("Case title"))
      .option("--summary <text>", tCli("Case summary"))
      .option("--fields-json <json>", tCli("Case fields JSON object"))
      .option("--fields-file <path>", tCli("Read case fields JSON object from file"))
      .option("--stage <key>", tCli("Initial stage key"))
      .option("--parent-case <id>", tCli("Parent case ID"))
      .option("--workspace-ref-json <json>", tCli("Workspace ref JSON object"))
      .option("--blocked-by <csv>", tCli("Comma-separated blocker case IDs"))
      .option("--blocked-by-key <csv>", tCli("Comma-separated blocker case keys"))
      .action((pipeline: string, opts: IngestOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const body = await buildIngestBody(opts);
        printOutput(await ctx.api.post(apiPath`/api/pipelines/${pipelineId}/cases`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("ingest-batch")
      .description(tCli("Ingest a batch of cases"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .requiredOption("--file <path>", tCli("JSON file containing an array or { items }"))
      .action((pipeline: string, opts: IngestBatchOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const input = await readJsonFile(opts.file);
        const body = Array.isArray(input) ? { items: input } : asObject(input);
        printOutput(await ctx.api.post(apiPath`/api/pipelines/${pipelineId}/cases/batch`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("cases")
      .description(tCli("List cases in a pipeline"))
      .argument("<pipeline>", tCli("Pipeline ID or key"))
      .option("--stage <key>", tCli("Filter by stage key"))
      .option("--parent <caseId>", tCli("Filter by parent case ID"))
      .option("--terminal", tCli("Only terminal cases"))
      .option("--q <text>", tCli("Search title/summary"))
      .action((pipeline: string, opts: CasesOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const params = new URLSearchParams();
        if (opts.stage) params.set("stageKey", opts.stage);
        if (opts.parent) params.set("parentCaseId", opts.parent);
        if (opts.terminal) params.set("terminal", "true");
        if (opts.q) params.set("q", opts.q);
        const query = params.toString();
        const rows = await ctx.api.get<CaseListRow[]>(`${apiPath`/api/pipelines/${pipelineId}/cases`}${query ? `?${query}` : ""}`) ?? [];
        printCases(rows, ctx);
      })),
  );

  const caseCommand = pipelines.command("case").description(tCli("Pipeline case operations"));
  registerCaseCommands(caseCommand);

  addPipelineOptions(
    pipelines
      .command("review-inbox")
      .description(tCli("List cases waiting in review stages"))
      .option("--pipeline <idOrKey>", tCli("Filter to one pipeline"))
      .option("--parent <caseId>", tCli("Filter by parent case ID"))
      .action((opts: ReviewInboxOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const params = new URLSearchParams();
        if (opts.pipeline) params.set("pipelineId", await resolvePipelineId(ctx, opts.pipeline));
        if (opts.parent) params.set("parentCaseId", opts.parent);
        const query = params.toString();
        const rows = await ctx.api.get<CaseListRow[]>(`${apiPath`/api/companies/${ctx.companyId}/review-cases`}${query ? `?${query}` : ""}`) ?? [];
        printCases(rows, ctx);
      })),
  );

  addPipelineOptions(
    pipelines
      .command("review-bulk")
      .description(tCli("Apply bulk review decisions: approve, reject, or request_changes"))
      .requiredOption("--file <path>", tCli("JSON file containing an array or { items }"))
      .action((opts: ReviewBulkOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const input = await readJsonFile(opts.file);
        const body = Array.isArray(input) ? { items: input } : asObject(input);
        printOutput(await ctx.api.post(apiPath`/api/companies/${ctx.companyId}/review-cases/bulk`, body), { json: ctx.json });
      })),
  );
}

function registerCaseCommands(caseCommand: Command): void {
  addPipelineOptions(
    caseCommand
      .command("get")
      .description(tCli("Get a case"))
      .argument("<caseId>", tCli("Case ID"))
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printCaseDetail(await ctx.api.get<CaseDetail>(apiPath`/api/cases/${caseId}`), ctx);
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("events")
      .description(tCli("List case events"))
      .argument("<caseId>", tCli("Case ID"))
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.get(apiPath`/api/cases/${caseId}/events`), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("rollup")
      .description(tCli("Get recursive case rollup"))
      .argument("<caseId>", tCli("Case ID"))
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.get(apiPath`/api/cases/${caseId}/rollup`), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("edit")
      .description(tCli("Edit case content"))
      .argument("<caseId>", tCli("Case ID"))
      .option("--expected-version <n>", tCli("Expected case version"))
      .option("--title <title>", tCli("New title"))
      .option("--summary <text>", tCli("New summary"))
      .option("--fields-json <json>", tCli("Replacement fields JSON object"))
      .option("--fields-file <path>", tCli("Read replacement fields from JSON file"))
      .option("--workspace-ref-json <json>", tCli("Workspace ref JSON object"))
      .option("--parent-case <id>", tCli("Parent case ID"))
      .option("--lease-token <token>", tCli("Lease token"))
      .action((caseId: string, opts: EditOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body: JsonObject = {};
        setIfDefined(body, "title", opts.title);
        setIfDefined(body, "summary", opts.summary);
        setIfDefined(body, "parentCaseId", opts.parentCase);
        setIfDefined(body, "leaseToken", opts.leaseToken);
        if (opts.expectedVersion) body.expectedVersion = parsePositiveInt(opts.expectedVersion, tCli("expected version"));
        const fields = await readJsonFromOptions(opts.fieldsJson, opts.fieldsFile);
        if (fields !== undefined) body.fields = fields;
        if (opts.workspaceRefJson) body.workspaceRef = parseJson(opts.workspaceRefJson);
        printOutput(await ctx.api.patch(apiPath`/api/cases/${caseId}`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("claim")
      .description(tCli("Claim a case lease"))
      .argument("<caseId>", tCli("Case ID"))
      .option("--lease-seconds <n>", tCli("Lease duration in seconds"))
      .action((caseId: string, opts: ClaimOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body = opts.leaseSeconds ? { leaseSeconds: parsePositiveInt(opts.leaseSeconds, tCli("lease seconds")) } : {};
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/claim`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("release")
      .description(tCli("Release a case lease"))
      .argument("<caseId>", tCli("Case ID"))
      .option("--lease-token <token>", tCli("Lease token"))
      .option("--force", tCli("Force release as board/user"))
      .action((caseId: string, opts: ReleaseOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/release`, {
          leaseToken: opts.leaseToken,
          force: opts.force,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("transition")
      .description(tCli("Transition a case to another stage"))
      .argument("<caseId>", tCli("Case ID"))
      .requiredOption("--to <stageKey>", tCli("Target stage key"))
      .requiredOption("--expected-version <n>", tCli("Expected case version"))
      .option("--reason <text>", tCli("Transition reason"))
      .option("--lease-token <token>", tCli("Lease token"))
      .option("--accept-suggestion <id>", tCli("Accepted suggestion ID"))
      .action((caseId: string, opts: CaseTransitionOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/transition`, {
          toStageKey: opts.to,
          expectedVersion: parsePositiveInt(opts.expectedVersion, tCli("expected version")),
          reason: opts.reason,
          leaseToken: opts.leaseToken,
          acceptSuggestionId: opts.acceptSuggestion,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("suggest")
      .description(tCli("Suggest a transition without moving the case"))
      .argument("<caseId>", tCli("Case ID"))
      .requiredOption("--to <stageKey>", tCli("Target stage key"))
      .requiredOption("--rationale <text>", tCli("Suggestion rationale"))
      .option("--confidence <n>", tCli("Confidence 0..1"))
      .action((caseId: string, opts: SuggestOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body: JsonObject = {
          toStageKey: opts.to,
          rationale: opts.rationale,
        };
        if (opts.confidence) body.confidence = Number(opts.confidence);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/suggest-transition`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("resolve-suggestion")
      .description(tCli("Accept or dismiss a pending transition suggestion"))
      .argument("<caseId>", tCli("Case ID"))
      .requiredOption("--suggestion <id>", tCli("Suggestion ID"))
      .option("--accept", tCli("Accept the suggestion"))
      .option("--dismiss", tCli("Dismiss the suggestion"))
      .option("--expected-version <n>", tCli("Expected case version"))
      .option("--reason <text>", tCli("Decision reason"))
      .option("--lease-token <token>", tCli("Lease token"))
      .action((caseId: string, opts: ResolveSuggestionOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const decision = exactlyOneFlag(opts.accept, opts.dismiss, "--accept", "--dismiss") === "--accept" ? "accept" : "dismiss";
        const body: JsonObject = {
          suggestionId: opts.suggestion,
          resolution: decision,
          reason: opts.reason,
          leaseToken: opts.leaseToken,
        };
        if (opts.expectedVersion) body.expectedVersion = parsePositiveInt(opts.expectedVersion, tCli("expected version"));
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/resolve-suggestion`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("review")
      .description(tCli("Approve, reject, or request changes for a case in a review stage"))
      .argument("<caseId>", tCli("Case ID"))
      .option("--approve", tCli("Approve the case"))
      .option("--reject", tCli("Reject the case"))
      .option("--request-changes", tCli("Request changes for the case"))
      .option("--reason <text>", tCli("Decision reason"))
      .requiredOption("--expected-version <n>", tCli("Expected case version"))
      .option("--edits-json <json>", tCli("Review edits JSON"))
      .option("--edits-file <path>", tCli("Read review edits JSON from file"))
      .option("--title <title>", tCli("Edit title before decision"))
      .option("--summary <text>", tCli("Edit summary before decision"))
      .option("--fields-json <json>", tCli("Edit fields before decision"))
      .option("--fields-file <path>", tCli("Read edit fields from JSON file"))
      .option("--lease-token <token>", tCli("Lease token"))
      .action((caseId: string, opts: ReviewOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const decision = reviewDecisionFromOptions(opts);
        const edits = await buildReviewEdits(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/review`, {
          decision,
          reason: opts.reason,
          edits,
          expectedVersion: parsePositiveInt(opts.expectedVersion, tCli("expected version")),
          leaseToken: opts.leaseToken,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("block")
      .description(tCli("Replace a case blocker set"))
      .argument("<caseId>", tCli("Case ID"))
      .requiredOption("--by <csv>", tCli("Comma-separated blocker case IDs, or empty string to clear"))
      .action((caseId: string, opts: BlockOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.put(apiPath`/api/cases/${caseId}/blockers`, {
          blockedByCaseIds: parseCsv(opts.by),
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("open-conversation")
      .description(tCli("Open or return the case conversation issue"))
      .argument("<caseId>", tCli("Case ID"))
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/open-conversation`, {}), { json: ctx.json });
      })),
  );
}

function addPipelineOptions(command: Command): Command {
  return addCommonClientOptions(command, { includeCompany: true });
}

function resolvePipelineContext(opts: PipelineOptions): ResolvedClientContext & { companyId: string } {
  return resolveCommandContext(opts, { requireCompany: true }) as ResolvedClientContext & { companyId: string };
}

async function resolvePipelineId(ctx: ResolvedClientContext & { companyId: string }, pipeline: string): Promise<string> {
  if (looksLikeUuid(pipeline)) return pipeline;
  const rows = await ctx.api.get<PipelineSummary[]>(apiPath`/api/companies/${ctx.companyId}/pipelines`) ?? [];
  const match = rows.find((row) => row.key === pipeline || row.id === pipeline);
  if (!match) throw new Error(tCli("Pipeline not found by key or id: {{value1}}", { value1: String(pipeline) }));
  return match.id;
}

async function getPipeline(ctx: ResolvedClientContext & { companyId: string }, pipeline: string): Promise<PipelineDetail> {
  const pipelineId = await resolvePipelineId(ctx, pipeline);
  const detail = await ctx.api.get<PipelineDetail>(apiPath`/api/pipelines/${pipelineId}`);
  if (!detail) throw new Error(tCli("Pipeline not found: {{value1}}", { value1: String(pipeline) }));
  return detail;
}

async function buildIngestBody(opts: IngestOptions): Promise<JsonObject> {
  const body: JsonObject = { title: opts.title };
  setIfDefined(body, "caseKey", opts.caseKey);
  setIfDefined(body, "summary", opts.summary);
  setIfDefined(body, "stageKey", opts.stage);
  setIfDefined(body, "parentCaseId", opts.parentCase);
  if (opts.fieldsJson || opts.fieldsFile) body.fields = await readJsonFromOptions(opts.fieldsJson, opts.fieldsFile);
  if (opts.workspaceRefJson) body.workspaceRef = parseJson(opts.workspaceRefJson);
  if (opts.blockedBy) body.blockedByCaseIds = parseCsv(opts.blockedBy);
  if (opts.blockedByKey) body.blockedByCaseKeys = parseCsv(opts.blockedByKey);
  return body;
}

async function buildReviewEdits(opts: ReviewOptions): Promise<JsonObject | undefined> {
  const fromFile = await readJsonFromOptions(opts.editsJson, opts.editsFile);
  const edits = fromFile === undefined ? {} : asObject(fromFile);
  setIfDefined(edits, "title", opts.title);
  setIfDefined(edits, "summary", opts.summary);
  const fields = await readJsonFromOptions(opts.fieldsJson, opts.fieldsFile);
  if (fields !== undefined) edits.fields = fields;
  return Object.keys(edits).length ? edits : undefined;
}

async function readJsonFromOptions(json?: string, file?: string): Promise<unknown | undefined> {
  if (json && file) throw new Error(tCli("Pass either inline JSON or a JSON file, not both."));
  if (json) return parseJson(json);
  if (file) return readJsonFile(file);
  return undefined;
}

async function readJsonFile(file: string): Promise<unknown> {
  return parseJson(await readFile(file, "utf8"));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(tCli("Invalid JSON: {{value1}}", { value1: String(error instanceof Error ? error.message : String(error)) }));
  }
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(tCli("Expected a JSON object."));
  }
  return value as JsonObject;
}

function asOptionalObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function parsePositiveInt(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(tCli("Invalid {{value1}}: {{value2}}", { value1: String(label), value2: String(value) }));
  return parsed;
}

function parseCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function setIfDefined(target: JsonObject, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function exactlyOneFlag(first: boolean | undefined, second: boolean | undefined, firstName: string, secondName: string): string {
  if (Boolean(first) === Boolean(second)) throw new Error(tCli("Pass exactly one of {{value1}} or {{value2}}.", { value1: String(firstName), value2: String(secondName) }));
  return first ? firstName : secondName;
}

function reviewDecisionFromOptions(opts: ReviewOptions): "approve" | "reject" | "request_changes" {
  const selected = [
    opts.approve ? { flag: "--approve", decision: "approve" as const } : null,
    opts.reject ? { flag: "--reject", decision: "reject" as const } : null,
    opts.requestChanges ? { flag: "--request-changes", decision: "request_changes" as const } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  if (selected.length !== 1) {
    throw new Error(tCli("Pass exactly one of --approve, --reject, or --request-changes."));
  }
  return selected[0]!.decision;
}

function printPipeline(row: PipelineDetail | PipelineSummary | null, ctx: ResolvedClientContext): void {
  if (!row) return printOutput(null, { json: ctx.json });
  if (ctx.json) return printOutput(row, { json: true });
  console.log(formatPipeline(row));
  if ("stages" in row && row.stages?.length) {
    console.log(pc.bold(tCli("Stages")));
    row.stages.forEach((stage) => {
      console.log(`  ${formatInlineRecord({
        id: stage.id,
        key: stage.key,
        name: stage.name,
        kind: stage.kind,
        position: stage.position,
      })}`);
    });
  }
}

function formatPipeline(row: PipelineSummary): string {
  return formatInlineRecord({
    id: row.id,
    key: row.key,
    name: row.name,
    enforceTransitions: row.enforceTransitions,
    stageCount: row.stageCount,
    openCaseCount: row.openCaseCount,
  });
}

function printCases(rows: CaseListRow[], ctx: ResolvedClientContext): void {
  if (ctx.json) return printOutput(rows, { json: true });
  if (rows.length === 0) return printOutput([]);
  rows.forEach((row) => console.log(formatCase(row.case, row.stage)));
}

function printCaseDetail(detail: CaseDetail | null, ctx: ResolvedClientContext): void {
  if (!detail) return printOutput(null, { json: ctx.json });
  if (ctx.json) return printOutput(detail, { json: true });
  console.log(formatCase(detail.case, detail.stage, detail.pipeline));
  console.log(JSON.stringify({
    pendingSuggestion: detail.pendingSuggestion ?? detail.case.pendingSuggestion ?? null,
    childrenSummary: detail.childrenSummary,
    blockers: detail.blockers,
    blocks: detail.blocks,
    links: detail.links,
  }, null, 2));
}

function formatCase(row: PipelineCase, stage: PipelineStage, pipeline?: PipelineSummary): string {
  return formatInlineRecord({
    id: row.id,
    caseKey: row.caseKey,
    title: row.title,
    pipeline: pipeline?.key,
    stage: stage.key,
    stageKind: stage.kind,
    version: row.version,
    terminalKind: row.terminalKind,
    children: row.childCount === undefined ? undefined : `${row.terminalChildCount ?? 0}/${row.childCount}`,
  });
}

async function withPipelineErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    handlePipelineError(error);
  }
}

function handlePipelineError(error: unknown): never {
  if (error instanceof ApiRequestError) {
    const body = asOptionalObject(error.body);
    const details = asOptionalObject(error.details);
    const code = stringValue(details?.code) ?? stringValue(body?.code);
    const stage = details?.stage ?? details?.currentStage ?? details?.currentStageKey ?? details?.stageKey;
    const version = details?.version ?? details?.currentVersion;
    const parts = [tCli("API error {{value1}}: {{value2}}", { value1: String(error.status), value2: translateCliDisplayMessage(error.message) })];
    if (code) parts.push(`code=${code}`);
    if (version !== undefined) parts.push(`currentVersion=${String(version)}`);
    if (stage !== undefined) parts.push(`currentStage=${formatStageForError(stage)}`);
    console.error(pc.red(parts.join(" ")));
    if (error.status === 409) {
      console.error(pc.yellow(tCli("Recovery: re-read the case with `paperclipai pipelines case get <case-id> --json`, then retry with the current version/stage.")));
    }
    if (error.details !== undefined && !code) console.error(pc.dim(`details=${JSON.stringify(error.details)}`));
    process.exit(1);
  }
  console.error(pc.red(translateCliDisplayMessage(error instanceof Error ? error.message : String(error))));
  process.exit(1);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function formatStageForError(stage: unknown): string {
  if (typeof stage === "string") return stage;
  if (stage && typeof stage === "object" && "key" in stage) return String((stage as { key: unknown }).key);
  return JSON.stringify(stage);
}
