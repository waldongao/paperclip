import { getCountNoun } from "@/components/localized-count";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Box,
  Clock3,
  Database,
  FileCheck2,
  FilePenLine,
  FileText,
  GitBranch,
  ListChecks,
  PackageCheck,
  Search,
  ShieldCheck,
  TerminalSquare,
  Users,
} from "lucide-react";
import type {
  TaskChatMaterializedResourceItem,
  TaskChatProtocolItem,
  TaskChatProviderActivityItem,
  TaskChatWorkspaceChangeItem,
  TaskChatWorkspaceFileItem,
} from "./task-chat-model";
import {
  humanizeToolName,
  isGenericToolName,
  mcpToolIdentity,
  toolActivityPresentation,
  type ToolIcon,
} from "./tool-taxonomy";
import { t } from "@/i18n";

export interface TaskChatActivityPresentation {
  icon: ToolIcon;
  runningLabel: string;
  completedLabel: string;
  failedLabel?: string;
  interruptedLabel?: string;
  detail?: string;
}

function providerDetail(item: TaskChatProviderActivityItem, ...labels: string[]): string | undefined {
  return item.details.find((entry) => labels.includes(entry.label))?.value;
}

function meaningfulToolDetail(value: string | undefined): string | undefined {
  if (!value || isGenericToolName(value) || /^tool(?:\s+|_)call\b/i.test(value)) return undefined;
  return value;
}

export function providerActivityPresentation(item: TaskChatProviderActivityItem): TaskChatActivityPresentation {
  const detail = item.summary
    ?? providerDetail(item, t("query"), "URL", t("target"), t("name"), t("reference"), t("reason"), t("summary"));
  switch (item.family) {
    case "research": {
      const action = providerDetail(item, t("action"))?.toLowerCase();
      if (action === "open_page") {
        return { icon: Search, runningLabel: t("opening_a_web_page"), completedLabel: t("opened_a_web_page"), failedLabel: t("couldn_t_open_the_web_page"), interruptedLabel: t("stopped_opening_the_web_page"), detail };
      }
      if (action === "find_in_page") {
        return { icon: Search, runningLabel: t("searching_the_page"), completedLabel: t("searched_the_page"), failedLabel: t("page_search_failed"), interruptedLabel: t("page_search_stopped"), detail };
      }
      return { icon: Search, runningLabel: t("searching_the_web"), completedLabel: t("searched_the_web"), failedLabel: t("web_search_failed"), interruptedLabel: t("web_search_stopped"), detail };
    }
    case "tool_execution": {
      const name = providerDetail(item, t("name"));
      const target = providerDetail(item, t("target"));
      const progress = providerDetail(item, t("progress"));
      const tool = toolActivityPresentation({
        name,
        transport: providerDetail(item, t("transport")),
        namespace: providerDetail(item, t("namespace")),
        operation: providerDetail(item, t("operation")),
        target,
        progress,
      });
      const boundedActivity = meaningfulToolDetail(item.summary)
        ?? meaningfulToolDetail(progress)
        ?? meaningfulToolDetail(target);
      const activityIsIdentity = Boolean(
        boundedActivity && name && humanizeToolName(boundedActivity) === humanizeToolName(name),
      );
      const technicalName = name ? mcpToolIdentity(name)?.name ?? name : tool.displayName;
      const source = tool.sourceLabel
        ? `${tool.sourceLabel} · ${technicalName}`
        : name && !isGenericToolName(name) && humanizeToolName(name) !== tool.runningLabel.replace(/^Running /, "")
          ? name
          : undefined;
      return {
        icon: tool.icon,
        runningLabel: tool.runningLabel,
        completedLabel: tool.completedLabel,
        failedLabel: tool.failedLabel,
        interruptedLabel: tool.interruptedLabel,
        detail: [activityIsIdentity ? undefined : boundedActivity, source].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "plan":
      return { icon: ListChecks, runningLabel: t("updating_the_plan"), completedLabel: t("updated_the_plan"), failedLabel: t("plan_update_failed"), interruptedLabel: t("plan_update_stopped"), detail };
    case "delegation": {
      const action = providerDetail(item, t("action"))?.toLowerCase();
      if (action === "message") return { icon: Users, runningLabel: t("messaging_a_subagent"), completedLabel: t("messaged_a_subagent"), failedLabel: t("subagent_message_failed"), interruptedLabel: t("subagent_message_stopped"), detail };
      if (action === "resume") return { icon: Users, runningLabel: t("resuming_a_subagent"), completedLabel: t("resumed_a_subagent"), failedLabel: t("couldn_t_resume_the_subagent"), interruptedLabel: t("subagent_resume_stopped"), detail };
      if (action === "close") return { icon: Users, runningLabel: t("closing_a_subagent"), completedLabel: t("closed_a_subagent"), failedLabel: t("couldn_t_close_the_subagent"), interruptedLabel: t("subagent_close_stopped"), detail };
      if (action === "wait") return { icon: Users, runningLabel: t("waiting_for_subagents"), completedLabel: t("finished_waiting_for_subagents"), failedLabel: t("subagent_wait_failed"), interruptedLabel: t("stopped_waiting_for_subagents"), detail };
      return { icon: Users, runningLabel: t("starting_a_subagent"), completedLabel: t("started_a_subagent"), failedLabel: t("subagent_start_failed"), interruptedLabel: t("subagent_start_stopped"), detail };
    }
    case "model_identity":
      return item.eventType === "model.route.changed"
        ? { icon: Bot, runningLabel: t("switching_models"), completedLabel: t("switched_models"), failedLabel: t("model_switch_failed"), interruptedLabel: t("model_switch_stopped"), detail }
        : { icon: Bot, runningLabel: t("verifying_the_model"), completedLabel: t("verified_the_model"), failedLabel: t("model_verification_failed"), interruptedLabel: t("model_verification_stopped"), detail };
    case "context":
      return { icon: Database, runningLabel: t("compacting_context"), completedLabel: t("compacted_context"), failedLabel: t("context_compaction_failed"), interruptedLabel: t("context_compaction_stopped"), detail };
    case "artifact": {
      const viewed = item.eventType === "artifact.viewed";
      return viewed
        ? { icon: Box, runningLabel: t("viewing_an_artifact"), completedLabel: t("viewed_an_artifact"), failedLabel: t("couldn_t_view_the_artifact"), interruptedLabel: t("artifact_view_stopped"), detail }
        : { icon: Box, runningLabel: t("generating_an_artifact"), completedLabel: t("generated_an_artifact"), failedLabel: t("artifact_generation_failed"), interruptedLabel: t("artifact_generation_stopped"), detail };
    }
    case "review": {
      const state = providerDetail(item, t("state"))?.toLowerCase();
      return state === "exited"
        ? { icon: FileCheck2, runningLabel: t("leaving_review_mode"), completedLabel: t("left_review_mode"), failedLabel: t("couldn_t_leave_review_mode"), interruptedLabel: t("review_mode_change_stopped"), detail }
        : { icon: FileCheck2, runningLabel: t("entering_review_mode"), completedLabel: t("entered_review_mode"), failedLabel: t("couldn_t_enter_review_mode"), interruptedLabel: t("review_mode_change_stopped"), detail };
    }
    case "hook":
      return { icon: GitBranch, runningLabel: t("running_a_hook"), completedLabel: t("ran_a_hook"), failedLabel: t("hook_failed"), interruptedLabel: t("hook_stopped"), detail };
    case "memory":
      return { icon: BookOpen, runningLabel: t("checking_memory"), completedLabel: t("referenced_memory"), failedLabel: t("memory_lookup_failed"), interruptedLabel: t("memory_lookup_stopped"), detail };
    case "safety":
      return { icon: ShieldCheck, runningLabel: t("reviewing_safety"), completedLabel: t("reviewed_safety"), failedLabel: t("safety_review_failed"), interruptedLabel: t("safety_review_stopped"), detail };
    case "terminal":
      return { icon: TerminalSquare, runningLabel: t("sending_terminal_input"), completedLabel: t("sent_terminal_input"), failedLabel: t("terminal_input_failed"), interruptedLabel: t("terminal_input_stopped"), detail };
    case "wait":
      return { icon: Clock3, runningLabel: t("waiting"), completedLabel: t("finished_waiting"), failedLabel: t("wait_failed"), interruptedLabel: t("wait_stopped"), detail };
    case "provider_notice":
      return { icon: AlertTriangle, runningLabel: t("provider_notice"), completedLabel: t("provider_notice"), failedLabel: t("provider_error"), interruptedLabel: t("provider_notice"), detail };
  }
}

function workspaceChangePresentation(item: TaskChatWorkspaceChangeItem): TaskChatActivityPresentation {
  const count = item.totals.files || item.files.length;
  const detail = count > 0 ? `${count} ${getCountNoun(count, "file")}` : undefined;
  return { icon: FilePenLine, runningLabel: t("editing_files"), completedLabel: t("edited_files"), detail };
}

function workspaceFilePresentation(item: TaskChatWorkspaceFileItem): TaskChatActivityPresentation {
  return {
    icon: FileText,
    runningLabel: t("referencing_a_file"),
    completedLabel: t("referenced_a_file"),
    detail: item.line == null ? item.path : `${item.path}:${item.line}`,
  };
}

function resourcePresentation(item: TaskChatMaterializedResourceItem): TaskChatActivityPresentation {
  return {
    icon: item.resourceKind === "document" ? FileText : PackageCheck,
    runningLabel: t("saving_a_resource"),
    completedLabel: item.resourceKind === "document" ? t("added_a_document") : t("added_a_deliverable"),
    detail: item.title,
  };
}

export function protocolActivityPresentation(item: TaskChatProtocolItem): TaskChatActivityPresentation | null {
  switch (item.surface) {
    case "provider_activity": return providerActivityPresentation(item);
    case "workspace_change": return workspaceChangePresentation(item);
    case "workspace_file": return workspaceFilePresentation(item);
    case "resource": return resourcePresentation(item);
    case "runtime_request":
    case "run_result":
    case "run_terminal":
      return null;
  }
}

export function protocolActivityIsRunning(item: TaskChatProtocolItem): boolean {
  if (item.surface === "provider_activity") return item.status === "running";
  if (item.surface === "workspace_change") return !item.complete;
  return false;
}

export function protocolActivityLabel(item: TaskChatProtocolItem, presentation: TaskChatActivityPresentation): string {
  if (item.surface !== "provider_activity") {
    return protocolActivityIsRunning(item) ? presentation.runningLabel : presentation.completedLabel;
  }
  if (item.status === "failed") return presentation.failedLabel ?? t("zhComponents.message_06470a8a55", { value1: presentation.completedLabel });
  if (item.status === "interrupted") return presentation.interruptedLabel ?? t("zhComponents.message_3290d69fd3", { value1: presentation.completedLabel });
  return item.status === "running" ? presentation.runningLabel : presentation.completedLabel;
}
