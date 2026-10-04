/**
 * Provider-neutral tool vocabulary shared by live status, transcript rows,
 * and canonical provider activity. Exact semantic tools get purpose-specific
 * copy; ACP kinds and normalized name prefixes cover future adapters.
 */
import {
  BookOpen,
  Brain,
  ChevronsLeftRightEllipsis,
  CircleHelp,
  Clock3,
  FilePenLine,
  Image,
  ListChecks,
  MessageSquareReply,
  Network,
  Search,
  SearchCode,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { McpIcon } from "./McpIcon";
import { t } from "@/i18n";

/** Lucide icons and hand-rolled SVGs (the MCP logo) share this shape. */
export type ToolIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type ToolFamily =
  | "terminal"
  | "grep"
  | "search"
  | "read"
  | "edit"
  | "web"
  | "plan"
  | "question"
  | "agent"
  | "safety"
  | "image"
  | "wait"
  | "mcp"
  | "other";

export interface ToolTaxonomyEntry {
  family: ToolFamily;
  icon: ToolIcon;
  /** Progressive verb for the status pill, without the trailing ellipsis. */
  verbLabel: string;
}

export type ToolClassificationConfidence = "exact" | "kind" | "inferred" | "fallback" | "unnamed";

export interface ToolActivityPresentationInput {
  name?: string | null;
  transport?: string | null;
  namespace?: string | null;
  /** ACP kind or canonical operation. */
  operation?: string | null;
  target?: string | null;
  progress?: string | null;
}

export interface ToolSummaryGroup {
  key: string;
  singular: string;
  plural: string;
}

export interface ToolActivityPresentation {
  icon: ToolIcon;
  family: ToolFamily;
  runningLabel: string;
  completedLabel: string;
  failedLabel: string;
  interruptedLabel: string;
  displayName: string;
  sourceLabel?: string;
  technicalName?: string;
  confidence: ToolClassificationConfidence;
  summaryGroup: ToolSummaryGroup;
}

/** ACPX's placeholder title must never displace real lifecycle identity. */
const GENERIC_TOOL_NAMES = new Set(["tool", "tool call", "tool_call", "acp_tool"]);

export function isGenericToolName(name: string | undefined | null): boolean {
  const raw = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\((?:pending|in[_ -]?progress|completed|failed|cancelled|canceled)\)$/, "");
  return !raw || GENERIC_TOOL_NAMES.has(raw);
}

interface McpIdentity {
  namespace: string;
  name: string;
}

export function mcpToolIdentity(name: string): McpIdentity | null {
  const doubleUnderscore = name.match(/^mcp__(.+?)__(.+)$/i);
  if (doubleUnderscore) return { namespace: doubleUnderscore[1], name: doubleUnderscore[2] };
  const dotted = name.match(/^mcp\.([^.]+)\.(.+)$/i);
  return dotted ? { namespace: dotted[1], name: dotted[2] } : null;
}

function identifierWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function sentenceCase(words: readonly string[]): string {
  if (words.length === 0) return "";
  const text = words.map((word) => {
    if (["api", "id", "lsp", "mcp", "pr", "url"].includes(word)) return word.toUpperCase();
    return word;
  }).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function humanizeToolName(name: string | undefined | null): string {
  const raw = (name ?? "").trim();
  if (isGenericToolName(raw)) return t("unnamed_tool");
  const mcp = mcpToolIdentity(raw);
  return sentenceCase(identifierWords(mcp?.name ?? raw));
}

/** Humanized MCP tool segment for both mcp__server__tool and mcp.server.tool. */
export function mcpToolSegment(name: string): string | null {
  const identity = mcpToolIdentity(name);
  return identity ? humanizeToolName(identity.name) : null;
}

type Action =
  | "read" | "list" | "search" | "fetch" | "open" | "update" | "create"
  | "delete" | "move" | "run" | "request" | "post" | "start" | "stop"
  | "wait" | "finish" | "block" | "think" | "switch" | "other";

interface ExactAction {
  action: Action;
  running?: string;
  completed?: string;
  group?: ToolSummaryGroup;
  family?: ToolFamily;
}

const group = (key: string, singular: string, plural: string): ToolSummaryGroup => ({ key, singular, plural });

const EXACT_ACTIONS: Record<string, ExactAction> = {
  bash: { action: "run" },
  terminal: { action: "run" },
  shell: { action: "run" },
  command: { action: "run" },
  run: { action: "run" },
  execute: { action: "run" },
  exec_command: { action: "run" },
  apply_patch: { action: "update", running: t("applying_a_patch"), completed: t("applied_a_patch") },
  read: { action: "read", running: t("reading_a_file"), completed: t("read_a_file") },
  write: { action: "update", running: t("writing_a_file"), completed: t("wrote_a_file") },
  edit: { action: "update", running: t("editing_a_file"), completed: t("edited_a_file") },
  notebook_read: { action: "read", running: t("reading_a_notebook"), completed: t("read_a_notebook") },
  notebook_edit: { action: "update", running: t("editing_a_notebook"), completed: t("edited_a_notebook") },
  glob: { action: "search", running: t("searching_files"), completed: t("searched_files") },
  grep: { action: "search", running: t("searching_file_contents"), completed: t("searched_file_contents"), family: "grep" },
  tool_search: { action: "search", running: t("searching_available_tools"), completed: t("searched_available_tools"), group: group("tool_search", t("tool_search"), t("tool_searches")) },
  web_search: { action: "search", running: t("searching_the_web"), completed: t("searched_the_web"), family: "web" },
  web_fetch: { action: "fetch", running: t("fetching_a_web_page"), completed: t("fetched_a_web_page"), family: "web" },
  todo_write: { action: "update", running: t("updating_the_task_list"), completed: t("updated_the_task_list"), family: "plan", group: group("task_operation", t("task_operation"), t("task_operations")) },
  task_create: { action: "create", running: t("creating_a_task"), completed: t("created_a_task"), family: "plan", group: group("task_operation", t("task_operation"), t("task_operations")) },
  task_update: { action: "update", running: t("updating_a_task"), completed: t("updated_a_task"), family: "plan", group: group("task_operation", t("task_operation"), t("task_operations")) },
  task_list: { action: "list", running: t("listing_tasks"), completed: t("listed_tasks"), family: "plan", group: group("task_operation", t("task_operation"), t("task_operations")) },
  task_get: { action: "read", running: t("reading_a_task"), completed: t("read_a_task"), family: "plan", group: group("task_operation", t("task_operation"), t("task_operations")) },
  enter_plan_mode: { action: "switch", running: t("entering_plan_mode"), completed: t("entered_plan_mode"), family: "plan" },
  exit_plan_mode: { action: "switch", running: t("leaving_plan_mode"), completed: t("left_plan_mode"), family: "plan" },
  skill: { action: "read", running: t("loading_a_skill"), completed: t("loaded_a_skill") },
  ask_user_question: { action: "request", running: t("requesting_input"), completed: t("requested_input"), family: "question" },
  request_human_input: { action: "request", running: t("requesting_input"), completed: t("requested_input"), family: "question", group: group("task_operation", t("task_operation"), t("task_operations")) },
  agent: { action: "start", running: t("starting_a_subagent"), completed: t("started_a_subagent"), family: "agent" },
  task: { action: "start", running: t("starting_a_subagent"), completed: t("started_a_subagent"), family: "agent" },
  task_output: { action: "read", running: t("checking_subagent_progress"), completed: t("checked_subagent_progress"), family: "agent" },
  task_stop: { action: "stop", running: t("stopping_a_subagent"), completed: t("stopped_a_subagent"), family: "agent" },
  send_message: { action: "post", running: t("messaging_a_subagent"), completed: t("messaged_a_subagent"), family: "agent" },
  spawn_agent: { action: "start", running: t("starting_a_subagent"), completed: t("started_a_subagent"), family: "agent" },
  wait_agent: { action: "wait", running: t("checking_subagent_progress"), completed: t("checked_subagent_progress"), family: "agent" },
  wait_threads: { action: "wait", running: t("checking_task_progress"), completed: t("checked_task_progress"), family: "agent" },
  interrupt_agent: { action: "stop", running: t("interrupting_a_subagent"), completed: t("interrupted_a_subagent"), family: "agent" },
  report_findings: { action: "post", running: t("reporting_findings"), completed: t("reported_findings"), family: "safety" },
  guardian_review: { action: "think", running: t("reviewing_safety"), completed: t("reviewed_safety"), family: "safety" },
  lsp: { action: "read", running: t("inspecting_code_intelligence"), completed: t("inspected_code_intelligence") },
  compact_conversation: { action: "think", running: t("compacting_context"), completed: t("compacted_context") },
  image_generation: { action: "create", running: t("generating_an_image"), completed: t("generated_an_image"), family: "image" },
  view_image: { action: "read", running: t("viewing_an_image"), completed: t("viewed_an_image"), family: "image" },
  multi_tool_use_parallel: { action: "run", running: t("running_tools_in_parallel"), completed: t("ran_tools_in_parallel") },
  get_task_context: { action: "read", running: t("reading_task_context"), completed: t("read_task_context") },
  get_task_history: { action: "read", running: t("reading_task_history"), completed: t("read_task_history") },
  list_documents: { action: "list", running: t("listing_documents"), completed: t("listed_documents") },
  read_document: { action: "read", running: t("reading_a_document"), completed: t("read_a_document") },
  list_document_revisions: { action: "list", running: t("listing_document_revisions"), completed: t("listed_document_revisions") },
  report_progress: { action: "post", running: t("reporting_progress"), completed: t("reported_progress") },
  answer_status_question: { action: "post", running: t("answering_a_status_question"), completed: t("answered_a_status_question") },
  write_document: { action: "update", running: t("writing_a_document"), completed: t("wrote_a_document") },
  register_deliverable: { action: "create", running: t("registering_a_deliverable"), completed: t("registered_a_deliverable") },
  finish_task: { action: "finish", running: t("reporting_completion"), completed: t("reported_completion") },
  paperclip_finish: { action: "finish", running: t("reporting_completion"), completed: t("reported_completion") },
  block_task: { action: "block", running: t("reporting_a_blocker"), completed: t("reported_a_blocker") },
  paperclip_block: { action: "block", running: t("reporting_a_blocker"), completed: t("reported_a_blocker") },
  request_review: { action: "request", running: t("requesting_review"), completed: t("requested_review") },
  list_agents: { action: "list", running: t("listing_agents"), completed: t("listed_agents") },
  get_agent: { action: "read", running: t("reading_agent_details"), completed: t("read_agent_details") },
  search_tasks: { action: "search", running: t("searching_tasks_09bc81"), completed: t("searched_tasks") },
  list_approvals: { action: "list", running: t("listing_approvals"), completed: t("listed_approvals") },
  get_approval: { action: "read", running: t("reading_an_approval"), completed: t("read_an_approval") },
  get_approval_context: { action: "read", running: t("reading_approval_context"), completed: t("read_approval_context") },
  get_workspace_runtime: { action: "read", running: t("reading_workspace_status"), completed: t("read_workspace_status") },
  control_workspace_service: { action: "run", running: t("controlling_a_workspace_service"), completed: t("controlled_a_workspace_service") },
  set_dependencies: { action: "update", running: t("updating_task_dependencies"), completed: t("updated_task_dependencies") },
  create_task: { action: "create", running: t("creating_a_task"), completed: t("created_a_task") },
  request_approval: { action: "request", running: t("requesting_approval"), completed: t("requested_approval") },
  decide_approval: { action: "update", running: t("deciding_an_approval"), completed: t("decided_an_approval") },
  comment_on_approval: { action: "post", running: t("commenting_on_an_approval"), completed: t("commented_on_an_approval") },
  schedule_wake: { action: "create", running: t("scheduling_a_wake_up"), completed: t("scheduled_a_wake_up"), family: "wait" },
  generic_api_request: { action: "request", running: t("calling_the_paperclip_api"), completed: t("called_the_paperclip_api") },
};

const ACTION_PREFIXES: Record<Action, readonly string[]> = {
  read: ["get", "read", "inspect", "view"],
  list: ["list", "glob"],
  search: ["find", "search", "grep", "query", "lookup"],
  fetch: ["fetch", "browse"],
  open: ["open"],
  update: ["write", "edit", "update", "set", "patch", "upsert", "sync"],
  create: ["create", "add", "register", "upload"],
  delete: ["delete", "remove"],
  move: ["move", "rename"],
  run: ["run", "execute", "bash", "shell", "command"],
  request: ["request", "ask", "prompt"],
  post: ["send", "message", "comment", "report", "answer"],
  start: ["start", "spawn", "delegate"],
  stop: ["stop", "cancel", "interrupt"],
  wait: ["wait", "sleep", "poll"],
  finish: ["finish", "complete"],
  block: ["block"],
  think: ["think", "reason", "compact", "review"],
  switch: ["switch", "enter", "exit"],
  other: [],
};

const OPERATION_ACTIONS: Record<string, Action> = {
  read: "read",
  edit: "update",
  delete: "delete",
  move: "move",
  search: "search",
  list: "list",
  execute: "run",
  think: "think",
  fetch: "fetch",
  switch_mode: "switch",
};

function normalizedKey(name: string): string {
  return identifierWords(name).join("_");
}

function inferredAction(words: readonly string[]): Action | null {
  const first = words[0];
  if (!first) return null;
  for (const [action, prefixes] of Object.entries(ACTION_PREFIXES) as Array<[Action, readonly string[]]>) {
    if (prefixes.includes(first)) return action;
  }
  return null;
}

function actionFamily(action: Action): ToolFamily {
  if (action === "run") return "terminal";
  if (action === "read" || action === "list") return "read";
  if (action === "search") return "search";
  if (action === "fetch" || action === "open") return "web";
  if (["update", "create", "delete", "move"].includes(action)) return "edit";
  if (action === "request") return "question";
  if (action === "start" || action === "stop") return "agent";
  if (action === "wait") return "wait";
  return "other";
}

const FAMILY_ICONS: Record<ToolFamily, ToolIcon> = {
  terminal: Terminal,
  grep: SearchCode,
  search: Search,
  read: BookOpen,
  edit: FilePenLine,
  web: ChevronsLeftRightEllipsis,
  plan: ListChecks,
  question: CircleHelp,
  agent: Network,
  safety: ShieldCheck,
  image: Image,
  wait: Clock3,
  mcp: McpIcon,
  other: Wrench,
};

function actionCopy(action: Action, object: string | undefined): { running: string; completed: string } {
  const suffix = object ? ` ${object}` : "";
  switch (action) {
    case "read": return { running: t("zhComponents.extra_f23fe9465f", { value1: suffix || t("zhComponents.toolObject.data") }), completed: t("zhComponents.extra_0f242b8377", { value1: suffix || t("zhComponents.toolObject.data") }) };
    case "list": return { running: t("zhComponents.extra_a37ff674f0", { value1: suffix || t("zhComponents.toolObject.items") }), completed: t("zhComponents.extra_eb521b7bed", { value1: suffix || t("zhComponents.toolObject.items") }) };
    case "search": return { running: t("zhComponents.extra_5cd36f2d9a", { value1: suffix || "" }), completed: t("zhComponents.extra_0d4a316e3c", { value1: suffix || "" }) };
    case "fetch": return { running: t("zhComponents.extra_42384534f7", { value1: suffix || t("zhComponents.toolObject.data") }), completed: t("zhComponents.extra_5628d8ba33", { value1: suffix || t("zhComponents.toolObject.data") }) };
    case "open": return { running: t("zhComponents.extra_9214d75c6d", { value1: suffix || t("an_item") }), completed: t("zhComponents.extra_1822d39f96", { value1: suffix || t("an_item") }) };
    case "update": return { running: t("zhComponents.extra_3bade4075f", { value1: suffix || t("zhComponents.toolObject.data") }), completed: t("zhComponents.extra_ca861e060f", { value1: suffix || t("zhComponents.toolObject.data") }) };
    case "create": return { running: t("zhComponents.extra_6849e7b078", { value1: suffix || t("an_item") }), completed: t("zhComponents.extra_a1f1f66c34", { value1: suffix || t("an_item") }) };
    case "delete": return { running: t("zhComponents.extra_ed73ef4688", { value1: suffix || t("an_item") }), completed: t("zhComponents.extra_cb15d36bfb", { value1: suffix || t("an_item") }) };
    case "move": return { running: t("zhComponents.extra_ebe984de5f", { value1: suffix || t("an_item") }), completed: t("zhComponents.extra_a04d38ad16", { value1: suffix || t("an_item") }) };
    case "run": return { running: t("running_a_command"), completed: t("ran_a_command") };
    case "request": return { running: t("zhComponents.extra_1abb937bf1", { value1: suffix || t("zhComponents.toolObject.input") }), completed: t("zhComponents.extra_3f874c0612", { value1: suffix || t("zhComponents.toolObject.input") }) };
    case "post": return { running: t("zhComponents.extra_821c1c5ff1", { value1: suffix || t("an_update") }), completed: t("zhComponents.extra_f0e5bb3332", { value1: suffix || t("an_update") }) };
    case "start": return { running: t("zhComponents.extra_3e132da248", { value1: suffix || t("an_operation") }), completed: t("zhComponents.extra_7821cd7a71", { value1: suffix || t("an_operation") }) };
    case "stop": return { running: t("zhComponents.extra_72108acf6d", { value1: suffix || t("an_operation") }), completed: t("zhComponents.extra_30ba7a0e30", { value1: suffix || t("an_operation") }) };
    case "wait": return { running: t("waiting"), completed: t("finished_waiting") };
    case "finish": return { running: t("reporting_completion"), completed: t("reported_completion") };
    case "block": return { running: t("reporting_a_blocker"), completed: t("reported_a_blocker") };
    case "think": return { running: t("thinking_d08d8d"), completed: t("finished_thinking") };
    case "switch": return { running: t("zhComponents.extra_27e4dbb6a2", { value1: suffix || t("zhComponents.toolObject.mode") }), completed: t("zhComponents.extra_c287929716", { value1: suffix || t("zhComponents.toolObject.mode") }) };
    case "other": return { running: t("running"), completed: t("ran") };
  }
}

function defaultSummaryGroup(action: Action): ToolSummaryGroup {
  switch (action) {
    case "run": return group("command", t("command"), t("commands"));
    case "read":
    case "list": return group("read", t("read"), t("reads"));
    case "search": return group("search", t("search"), t("searches"));
    case "update":
    case "create":
    case "delete":
    case "move": return group("file_change", t("file_change"), t("file_changes"));
    case "start":
    case "stop": return group("delegation", t("delegation"), t("delegations"));
    case "wait": return group("wait", t("wait"), t("waits"));
    default: return group("tool_action", t("tool_action"), t("tool_actions"));
  }
}

function paperclipSummaryGroup(action: Action): ToolSummaryGroup {
  if (action === "read" || action === "list") return group("paperclip_read", t("paperclip_read"), t("paperclip_reads"));
  return group("task_operation", t("task_operation"), t("task_operations"));
}

/**
 * Resolve one tool into status-specific copy and iconography. Precedence is:
 * exact aliases, canonical ACP operation/kind, normalized verb, then a named
 * fallback. MCP remains visible as the source icon without losing semantics.
 */
export function toolActivityPresentation(input: ToolActivityPresentationInput): ToolActivityPresentation {
  const rawName = (input.name ?? "").trim();
  const parsedMcp = mcpToolIdentity(rawName);
  const namespace = (input.namespace ?? parsedMcp?.namespace ?? "").trim();
  // The name itself is authoritative for historical ACPX records that were
  // persisted as builtin before MCP transport normalization existed.
  const transport = (parsedMcp ? "mcp" : input.transport ?? "builtin").toLowerCase();
  const semanticName = (parsedMcp?.name ?? rawName).trim();
  const words = identifierWords(semanticName);
  const key = normalizedKey(semanticName);
  const exact = EXACT_ACTIONS[key];
  const operationAction = OPERATION_ACTIONS[(input.operation ?? "").trim().toLowerCase()];
  const inferred = inferredAction(words);
  const action = exact?.action ?? operationAction ?? inferred ?? "other";
  const confidence: ToolClassificationConfidence = exact
    ? "exact"
    : operationAction
      ? "kind"
      : inferred
        ? "inferred"
        : isGenericToolName(semanticName)
          ? "unnamed"
          : "fallback";
  const displayName = isGenericToolName(semanticName) ? t("unnamed_tool") : humanizeToolName(semanticName);
  const identifierLikeName = /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(semanticName);
  const objectWords = inferred && identifierLikeName && words.length > 1 ? words.slice(1) : [];
  const object = objectWords.length ? sentenceCase(objectWords).replace(/^./, (letter) => letter.toLowerCase()) : undefined;
  const copy = exact?.running && exact.completed
    ? { running: exact.running, completed: exact.completed }
    : action === "other"
      ? isGenericToolName(semanticName)
        ? { running: t("running_an_unnamed_tool"), completed: t("ran_an_unnamed_tool") }
        : { running: t("zhComponents.message_d0d250e538", { value1: displayName }), completed: t("zhComponents.message_68e5aa542c", { value1: displayName }) }
      : actionCopy(action, exact ? undefined : object);
  const semanticFamily = exact?.family ?? actionFamily(action);
  const family = transport === "mcp" ? "mcp" : semanticFamily;
  const sourceLabel = namespace
    ? humanizeToolName(namespace)
    : transport === "mcp"
      ? "MCP"
      : undefined;
  const summaryGroup = namespace.toLowerCase() === "paperclip"
    ? paperclipSummaryGroup(action)
    : exact?.group ?? defaultSummaryGroup(action);

  return {
    icon: FAMILY_ICONS[family],
    family,
    runningLabel: copy.running,
    completedLabel: copy.completed,
    failedLabel: t("zhComponents.message_497d2b73ee", { value1: copy.completed }),
    interruptedLabel: t("zhComponents.message_186fb015e1", { value1: copy.running }),
    displayName,
    sourceLabel,
    technicalName: rawName || undefined,
    confidence,
    summaryGroup,
  };
}

/** Compact compatibility mapping used by legacy tool rows and live pills. */
export function toolTaxonomy(name: string | undefined | null): ToolTaxonomyEntry {
  const presentation = toolActivityPresentation({ name });
  return {
    family: presentation.family,
    icon: presentation.icon,
    verbLabel: presentation.runningLabel,
  };
}

/** Icons for tool-free informative statuses. */
export function statusLabelIcon(label: string | undefined | null): ToolIcon | null {
  const raw = (label ?? "").trim().toLowerCase();
  if (raw === "thinking") return Brain;
  if (raw === "responding" || raw.startsWith("responding (")) return MessageSquareReply;
  return null;
}
