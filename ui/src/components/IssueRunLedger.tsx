import { getDisplayLabel } from "@/lib/display-labels";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ActivityEvent, Issue, Agent, ProviderTraceMetadata } from "@paperclipai/shared";
import {
  isResponsibleUserDenialCode,
  responsibleUserLabel,
} from "@paperclipai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { accessApi, type CurrentBoardAccess } from "../api/access";
import {
  activityApi,
  type RunForIssue,
  type RunLivenessState,
} from "../api/activity";
import { ApiError } from "../api/client";
import {
  heartbeatsApi,
  type ActiveRunForIssue,
  type LiveRunForIssue,
  type WatchdogDecisionInput,
} from "../api/heartbeats";
import { useToastActions } from "../context/ToastContext";
import { cn, relativeTime } from "../lib/utils";
import { queryKeys } from "../lib/queryKeys";
import { keepPreviousDataForSameQueryTail } from "../lib/query-placeholder-data";
import { describeRunRetryState } from "../lib/runRetryState";
import { readSourceResolvedWatchdogFold } from "../lib/source-resolved-watchdog-fold";
import { SourceResolvedFoldBadge } from "./SourceResolvedFoldBadge";
import { ResponsibleUserDenialNotice } from "./ResponsibleUserDenialNotice";
import { RunnerInspector } from "./RunnerInspector";
import { agentsApi } from "../api/agents";
import {
  ProviderTraceStatusBadge,
  runRequestedProviderTrace,
} from "./ProviderTraceStatusBadge";
import { t, useTranslation } from "@/i18n";

type IssueRunLedgerProps = {
  issueId: string;
  companyId: string;
  issueStatus: Issue["status"];
  childIssues: Issue[];
  agentMap: ReadonlyMap<string, Agent>;
  hasLiveRuns: boolean;
  activityEvents?: ActivityEvent[];
  renderActivityEvent?: (event: ActivityEvent) => ReactNode;
  resolveUserLabel?: (userId: string) => string | null | undefined;
};

type IssueRunLedgerContentProps = {
  runs: RunForIssue[];
  liveRuns?: LiveRunForIssue[];
  activeRun?: ActiveRunForIssue | null;
  issueStatus: Issue["status"];
  childIssues: Issue[];
  agentMap: ReadonlyMap<string, Pick<Agent, "name">>;
  activityEvents?: ActivityEvent[];
  renderActivityEvent?: (event: ActivityEvent) => ReactNode;
  resolveUserLabel?: (userId: string) => string | null | undefined;
  pendingWatchdogDecision?: WatchdogDecisionInput["decision"] | null;
  canRecordWatchdogDecisions?: boolean;
  watchdogDecisionError?: string | null;
  onWatchdogDecision?: (input: WatchdogDecisionInput) => void;
  onRerunWithTrace?: (run: RunForIssue) => void;
  providerTraceMetadata?: ReadonlyMap<string, ProviderTraceMetadata>;
};

type LedgerRun = RunForIssue & {
  isLive?: boolean;
  agentName?: string;
  outputSilence?: ActiveRunForIssue["outputSilence"];
};

type LedgerFeedItem =
  | {
      kind: "run";
      id: string;
      timestamp: string;
      run: LedgerRun;
    }
  | {
      kind: "activity";
      id: string;
      timestamp: string;
      event: ActivityEvent;
    };

type LivenessCopy = {
  label: string;
  tone: string;
  description: string;
};

const LIVENESS_COPY: Record<RunLivenessState, LivenessCopy> = {
  completed: {
    label: t("completed"),
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    description: t("task_reached_a_terminal_state"),
  },
  advanced: {
    label: t("advanced"),
    tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    description: t("run_produced_concrete_evidence_of_progress"),
  },
  plan_only: {
    label: t("plan_only"),
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    description: t("run_described_future_work_without_concrete_actio"),
  },
  empty_response: {
    label: t("empty_response"),
    tone: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    description: t("run_finished_without_useful_output"),
  },
  blocked: {
    label: t("blocked"),
    tone: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    description: t("run_or_task_declared_a_blocker"),
  },
  failed: {
    label: t("failed"),
    tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    description: t("run_ended_unsuccessfully"),
  },
  needs_followup: {
    label: t("needs_follow_up"),
    tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    description:
      t("run_produced_useful_output_but_did_not_prove_con"),
  },
};

const PENDING_LIVENESS_COPY: LivenessCopy = {
  label: t("checks_after_finish"),
  tone: "border-border bg-background text-muted-foreground",
  description: t("liveness_is_evaluated_after_the_run_finishes"),
};

const RETRY_PENDING_LIVENESS_COPY: LivenessCopy = {
  label: t("retry_pending"),
  tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  description: t("paperclip_queued_an_automatic_retry_that_has_not"),
};

const MISSING_LIVENESS_COPY: LivenessCopy = {
  label: t("no_liveness_data"),
  tone: "border-border bg-background text-muted-foreground",
  description: t("this_run_has_no_persisted_liveness_classificatio"),
};

const TERMINAL_CHILD_STATUSES = new Set<Issue["status"]>(["done", "cancelled"]);
const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);

type RunOutputSilenceLevel = NonNullable<
  ActiveRunForIssue["outputSilence"]
>["level"];

type RunOutputSilenceCopy = {
  label: string;
  tone: string;
};

const RUN_OUTPUT_SILENCE_COPY: Partial<
  Record<RunOutputSilenceLevel, RunOutputSilenceCopy>
> = {
  suspicious: {
    label: t("output_silence"),
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  critical: {
    label: t("critical_silence"),
    tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  },
  snoozed: {
    label: t("silence_snoozed"),
    tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDuration(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
) {
  if (!start) return null;
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60)
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function liveRunToLedgerRun(
  run: LiveRunForIssue | ActiveRunForIssue,
): LedgerRun {
  return {
    runId: run.id,
    status: run.status,
    agentId: run.agentId,
    agentName: run.agentName,
    adapterType: run.adapterType,
    startedAt: toIsoString(run.startedAt),
    finishedAt: toIsoString(run.finishedAt),
    createdAt: toIsoString(run.createdAt) ?? new Date().toISOString(),
    invocationSource: run.invocationSource,
    usageJson: null,
    resultJson: null,
    isLive: run.status === "queued" || run.status === "running",
    outputSilence: run.outputSilence,
  };
}

function mergeRuns(
  runs: RunForIssue[],
  liveRuns: LiveRunForIssue[] | undefined,
  activeRun: ActiveRunForIssue | null | undefined,
) {
  const byId = new Map<string, LedgerRun>();
  for (const run of runs) byId.set(run.runId, run);
  for (const run of liveRuns ?? []) {
    const existing = byId.get(run.id);
    byId.set(
      run.id,
      existing
        ? {
            ...existing,
            isLive: true,
            agentName: run.agentName,
            outputSilence: run.outputSilence,
          }
        : liveRunToLedgerRun(run),
    );
  }
  if (activeRun) {
    const existing = byId.get(activeRun.id);
    if (existing) {
      byId.set(activeRun.id, {
        ...existing,
        isLive: isActiveRun(existing) || isActiveRun(activeRun),
        agentName: activeRun.agentName,
        outputSilence: activeRun.outputSilence,
      });
    } else {
      byId.set(activeRun.id, liveRunToLedgerRun(activeRun));
    }
  }

  return [...byId.values()].sort((a, b) => {
    const aTime = new Date(a.startedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.startedAt ?? b.createdAt).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return b.runId.localeCompare(a.runId);
  });
}

function statusLabel(status: string) {
  return getDisplayLabel(status.replace(/_/g, " "), "raw");
}

function isActiveRun(run: Pick<LedgerRun, "status" | "isLive">) {
  return run.isLive || ACTIVE_RUN_STATUSES.has(run.status);
}

function runSummary(
  run: LedgerRun,
  agentMap: ReadonlyMap<string, Pick<Agent, "name">>,
) {
  const agentName = compactAgentName(run, agentMap);
  if (run.status === "running") return t("zhComponents.message_b42efe8939", { value1: agentName });
  if (run.status === "queued") return t("zhComponents.message_54cf83af9d", { value1: agentName });
  if (run.status === "scheduled_retry")
    return t("zhComponents.message_d4c0ffd6a9", { value1: agentName });
  return t("zhComponents.message_f77e8e500f", { value1: statusLabel(run.status), value2: agentName });
}

function livenessCopyForRun(run: LedgerRun) {
  if (run.status === "scheduled_retry") return RETRY_PENDING_LIVENESS_COPY;
  if (run.livenessState) return LIVENESS_COPY[run.livenessState];
  return isActiveRun(run) ? PENDING_LIVENESS_COPY : MISSING_LIVENESS_COPY;
}

function stopReasonLabel(run: RunForIssue) {
  const result = asRecord(run.resultJson);
  const stopReason = readString(result?.stopReason);
  const timeoutFired = result?.timeoutFired === true;
  const effectiveTimeoutSec = readNumber(result?.effectiveTimeoutSec);
  const timeoutText =
    effectiveTimeoutSec && effectiveTimeoutSec > 0
      ? t("zhComponents.message_85c2d00abc", { value1: effectiveTimeoutSec })
      : null;

  if (timeoutFired || stopReason === "timeout") {
    return timeoutText ? t("zhComponents.message_da953f7914", { value1: timeoutText }) : "timeout";
  }
  if (
    stopReason === "max_turns_exhausted" ||
    stopReason === "turn_limit_exhausted"
  )
    return t("max_turns_exhausted");
  if (stopReason === "budget_paused") return t("budget_paused");
  if (stopReason === "cancelled") return "cancelled";
  if (stopReason === "paused") return t("paused_by_board_c2c3f0");
  if (stopReason === "process_lost") return t("process_lost");
  if (stopReason === "unmanaged_background_task_stopped")
    return t("unmanaged_background_task_stopped");
  if (stopReason === "adapter_failed") return t("adapter_failed");
  if (stopReason === "completed")
    return timeoutText ? t("zhComponents.message_b19e4e9d82", { value1: timeoutText }) : "completed";
  return timeoutText;
}

function stopStatusLabel(run: LedgerRun, stopReason: string | null) {
  if (stopReason) return stopReason;
  if (run.status === "scheduled_retry") return t("retry_pending");
  if (run.status === "queued") return t("waiting_to_start");
  if (run.status === "running") return t("still_running");
  if (!run.livenessState) return t("unavailable");
  return t("no_stop_reason");
}

function lastUsefulActionLabel(run: LedgerRun) {
  if (run.status === "scheduled_retry") return t("waiting_for_next_attempt");
  if (run.lastUsefulActionAt) return relativeTime(run.lastUsefulActionAt);
  if (isActiveRun(run)) return t("no_action_recorded_yet");
  if (
    run.livenessState === "plan_only" ||
    run.livenessState === "needs_followup"
  ) {
    return t("no_concrete_action");
  }
  if (run.livenessState === "empty_response") return t("no_useful_output");
  if (!run.livenessState) return t("unavailable");
  return t("none_recorded");
}

function continuationLabel(run: LedgerRun) {
  if (!run.continuationAttempt || run.continuationAttempt <= 0) return null;
  return t("zhComponents.message_00ec297353", { value1: run.continuationAttempt });
}

function hasExhaustedContinuation(run: RunForIssue) {
  return /continuation attempts exhausted/i.test(run.livenessReason ?? "");
}

function childIssueSummary(childIssues: Issue[]) {
  const active = childIssues.filter(
    (issue) => !TERMINAL_CHILD_STATUSES.has(issue.status),
  );
  const done = childIssues.filter((issue) => issue.status === "done").length;
  const cancelled = childIssues.filter(
    (issue) => issue.status === "cancelled",
  ).length;
  return { active, done, cancelled, total: childIssues.length };
}

function compactAgentName(
  run: LedgerRun,
  agentMap: ReadonlyMap<string, Pick<Agent, "name">>,
) {
  return (
    run.agentName ?? agentMap.get(run.agentId)?.name ?? run.agentId.slice(0, 8)
  );
}

function formatSilenceAge(ms: number | null | undefined) {
  if (!ms || ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return t("under_1_minute");
  if (totalMinutes < 60)
    return t("zhComponents.message_50009614b1", { count: totalMinutes, value1: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return t("zhComponents.message_6eb6ee72ac", { count: hours, value1: hours });
  return `${hours}h ${minutes}m`;
}

function canBoardRecordWatchdogDecision(
  companyId: string,
  boardAccess: CurrentBoardAccess | undefined,
) {
  if (!boardAccess) return false;
  if (boardAccess.source === "local_implicit" || boardAccess.isInstanceAdmin)
    return true;

  const membership = boardAccess.memberships?.find(
    (item) => item.companyId === companyId && item.status === "active",
  );
  if (!membership)
    return (
      boardAccess.companyIds.includes(companyId) && !boardAccess.memberships
    );
  return (
    membership.membershipRole !== "viewer" && membership.membershipRole !== null
  );
}

function watchdogDecisionErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return t("only_the_board_or_the_assigned_recovery_owner_ca");
  }
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t("paperclip_could_not_record_the_watchdog_decision");
}

export function IssueRunLedger({
  issueId,
  companyId,
  issueStatus,
  childIssues,
  agentMap,
  hasLiveRuns,
  activityEvents,
  renderActivityEvent,
  resolveUserLabel,
}: IssueRunLedgerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [watchdogDecisionError, setWatchdogDecisionError] = useState<
    string | null
  >(null);
  const { data: boardAccess } = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    retry: false,
  });
  const { data: runs } = useQuery({
    queryKey: queryKeys.issues.runs(issueId),
    queryFn: () => activityApi.runsForIssue(issueId),
    refetchInterval:
      hasLiveRuns || issueStatus === "in_progress" ? 5000 : false,
    placeholderData: keepPreviousDataForSameQueryTail<RunForIssue[]>(issueId),
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(issueId),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issueId),
    enabled: hasLiveRuns,
    refetchInterval: 3000,
    placeholderData:
      keepPreviousDataForSameQueryTail<LiveRunForIssue[]>(issueId),
  });
  const { data: activeRun = null } = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId),
    enabled: hasLiveRuns || issueStatus === "in_progress",
    refetchInterval: hasLiveRuns ? false : 3000,
    placeholderData: keepPreviousDataForSameQueryTail<ActiveRunForIssue | null>(
      issueId,
    ),
  });
  const traceRunIds = useMemo(
    () => (runs ?? []).slice(0, 100).map((run) => run.runId),
    [runs],
  );
  const canInspectProviderTrace =
    boardAccess?.source === "local_implicit" || boardAccess?.isInstanceAdmin === true;
  const { data: providerTraceRows } = useQuery({
    queryKey: queryKeys.providerTraceMetadata(companyId, traceRunIds),
    queryFn: () => heartbeatsApi.providerTraceMetadata(companyId, traceRunIds),
    enabled: canInspectProviderTrace && traceRunIds.length > 0,
    retry: false,
  });
  const providerTraceMetadata = useMemo(
    () => new Map((providerTraceRows ?? []).map((trace) => [trace.runId, trace])),
    [providerTraceRows],
  );
  const watchdogDecision = useMutation({
    mutationFn: (input: WatchdogDecisionInput) =>
      heartbeatsApi.recordWatchdogDecision(input),
    onMutate: () => {
      setWatchdogDecisionError(null);
    },
    onSuccess: () => {
      setWatchdogDecisionError(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.activeRun(issueId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.liveRuns(issueId),
      });
    },
    onError: (error) => {
      const message = watchdogDecisionErrorMessage(error);
      const dedupeSuffix =
        error instanceof ApiError ? String(error.status) : "error";
      setWatchdogDecisionError(message);
      pushToast({
        title: t("watchdog_decision_not_recorded"),
        body: message,
        tone: "error",
        dedupeKey: `watchdog-decision:${issueId}:${dedupeSuffix}`,
      });
    },
  });
  const rerunWithTrace = useMutation({
    mutationFn: async (run: RunForIssue) => {
      const context = asRecord(run.contextSnapshot);
      const payload: Record<string, unknown> = {};
      for (const key of ["issueId", "taskId", "taskKey"] as const) {
        const value = readString(context?.[key]);
        if (value) payload[key] = value;
      }
      const result = await agentsApi.wakeup(
        run.agentId,
        {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "rerun_with_provider_trace",
          payload,
          debug: { providerTrace: "raw" },
        },
        companyId,
      );
      if (!("id" in result))
        throw new Error(result.message ?? t("trace_re_run_was_skipped"));
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.runs(issueId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.liveRuns(issueId),
      });
    },
    onError: (error) =>
      pushToast({
        title: t("trace_re_run_not_started"),
        body:
          error instanceof Error
            ? error.message
            : t("paperclip_could_not_start_the_trace_re_run"),
        tone: "error",
        dedupeKey: `provider-trace-rerun:${issueId}`,
      }),
  });

  return (
    <IssueRunLedgerContent
      runs={runs ?? []}
      liveRuns={liveRuns}
      activeRun={activeRun}
      issueStatus={issueStatus}
      childIssues={childIssues}
      agentMap={agentMap}
      activityEvents={activityEvents}
      renderActivityEvent={renderActivityEvent}
      resolveUserLabel={resolveUserLabel}
      pendingWatchdogDecision={watchdogDecision.variables?.decision ?? null}
      canRecordWatchdogDecisions={canBoardRecordWatchdogDecision(
        companyId,
        boardAccess,
      )}
      watchdogDecisionError={watchdogDecisionError}
      onWatchdogDecision={(input) => watchdogDecision.mutate(input)}
      onRerunWithTrace={
        canInspectProviderTrace
          ? (run) => rerunWithTrace.mutate(run)
          : undefined
      }
      providerTraceMetadata={providerTraceMetadata}
    />
  );
}

export function IssueRunLedgerContent({
  runs,
  liveRuns,
  activeRun,
  issueStatus,
  childIssues,
  agentMap,
  activityEvents,
  renderActivityEvent,
  resolveUserLabel,
  pendingWatchdogDecision,
  canRecordWatchdogDecisions = true,
  watchdogDecisionError,
  onWatchdogDecision,
  onRerunWithTrace,
  providerTraceMetadata = new Map(),
}: IssueRunLedgerContentProps) {
  const { t } = useTranslation();
  const [inspectedRun, setInspectedRun] = useState<LedgerRun | null>(null);
  const ledgerRuns = useMemo(
    () => mergeRuns(runs, liveRuns, activeRun),
    [activeRun, liveRuns, runs],
  );
  useEffect(() => {
    if (inspectedRun || typeof window === "undefined") return;
    const requestedRunId = new URLSearchParams(window.location.search).get("inspectRun");
    if (!requestedRunId) return;
    const requestedRun = ledgerRuns.find((run) => run.runId === requestedRunId);
    if (requestedRun) setInspectedRun(requestedRun);
  }, [inspectedRun, ledgerRuns]);
  const latestRun = ledgerRuns[0] ?? null;
  const latestSilentRun = useMemo(
    () =>
      ledgerRuns.find(
        (run) =>
          isActiveRun(run) &&
          (run.outputSilence?.level === "critical" ||
            run.outputSilence?.level === "suspicious"),
      ) ?? null,
    [ledgerRuns],
  );
  const children = childIssueSummary(childIssues);
  const canRenderActivityEvents = Boolean(renderActivityEvent);
  const feedItems = useMemo<LedgerFeedItem[]>(() => {
    const items: LedgerFeedItem[] = [];
    for (const run of ledgerRuns) {
      items.push({
        kind: "run",
        id: run.runId,
        timestamp: run.startedAt ?? run.createdAt,
        run,
      });
    }
    if (canRenderActivityEvents) {
      for (const event of activityEvents ?? []) {
        items.push({
          kind: "activity",
          id: event.id,
          timestamp:
            event.createdAt instanceof Date
              ? event.createdAt.toISOString()
              : String(event.createdAt),
          event,
        });
      }
    }
    return items.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      if (aTime !== bTime) return bTime - aTime;
      if (a.kind !== b.kind) return a.kind === "run" ? -1 : 1;
      return b.id.localeCompare(a.id);
    });
  }, [activityEvents, canRenderActivityEvents, ledgerRuns]);

  return (
    <section className="space-y-3" aria-label={t("task_run_ledger")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t("run_ledger")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {latestRun
              ? runSummary(latestRun, agentMap)
              : issueStatus === "in_progress"
                ? t("waiting_for_the_first_run_record")
                : t("no_runs_linked_yet")}
          </p>
        </div>
        {latestRun ? (
          <Link
            to={`/agents/${latestRun.agentId}/runs/${latestRun.runId}`}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("latest_run")}
          </Link>
        ) : null}
      </div>

      {children.total > 0 ? (
        <div className="rounded-md border border-border/70 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{t("child_work")}</span>
            <span className="text-muted-foreground">
              {children.active.length > 0
                ? t("zhComponents.message_8d82e14bad", { value1: children.active.length, value2: children.done, value3: children.cancelled })
                : t("zhComponents.message_d3feb4cf92", { value1: children.total, value2: children.done, value3: children.cancelled })}
            </span>
          </div>
          {children.active.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {children.active.slice(0, 4).map((child) => (
                <Link
                  key={child.id}
                  to={`/issues/${child.identifier ?? child.id}`}
                  className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-(length:--text-micro) hover:bg-accent/40"
                >
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {child.identifier ?? child.id.slice(0, 8)}
                  </span>
                  <span className="truncate">{child.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {statusLabel(child.status)}
                  </span>
                </Link>
              ))}
              {children.active.length > 4 ? (
                <span className="rounded-md border border-border px-2 py-1 text-(length:--text-micro) text-muted-foreground">
                  +{children.active.length - 4} {t("zhComponents.text_e7c95b4c28")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {latestSilentRun?.outputSilence ? (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            latestSilentRun.outputSilence.level === "critical"
              ? "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          <p className="font-medium">
            {latestSilentRun.outputSilence.level === "critical"
              ? t("critical_output_silence")
              : t("output_silence_watchdog_warning")}
          </p>
          <p className="mt-1">
            {t("latest_active_run_has_been_silent_for")}{" "}
            {formatSilenceAge(latestSilentRun.outputSilence.silenceAgeMs) ??
              t("an_extended_period")}
            .
            {latestSilentRun.outputSilence.evaluationIssueIdentifier ? (
              <>
                {" "}
                {t("review")}{" "}
                <Link
                  to={`/issues/${latestSilentRun.outputSilence.evaluationIssueIdentifier}`}
                  className="font-medium underline underline-offset-2"
                >
                  {latestSilentRun.outputSilence.evaluationIssueIdentifier}
                </Link>{" "}
                {t("for_recovery_context")}
              </>
            ) : null}
          </p>
          <p className="mt-1">
            {latestSilentRun.outputSilence.evaluationIssueIdentifier
              ? t("this_signal_is_informational_paperclip_did_not_c")
              : t("this_signal_is_informational_paperclip_did_not_c_442499")}
          </p>
          {onWatchdogDecision && canRecordWatchdogDecisions ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-md border border-border bg-background/80 px-2 py-1 text-(length:--text-micro) text-foreground hover:bg-background"
                onClick={() =>
                  onWatchdogDecision({
                    runId: latestSilentRun.runId,
                    decision: "continue",
                    evaluationIssueId:
                      latestSilentRun.outputSilence?.evaluationIssueId ?? null,
                  })
                }
                disabled={pendingWatchdogDecision != null}
              >
                {t("continue_monitoring")}
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-background/80 px-2 py-1 text-(length:--text-micro) text-foreground hover:bg-background"
                onClick={() =>
                  onWatchdogDecision({
                    runId: latestSilentRun.runId,
                    decision: "snooze",
                    evaluationIssueId:
                      latestSilentRun.outputSilence?.evaluationIssueId ?? null,
                    snoozedUntil: new Date(
                      Date.now() + 60 * 60 * 1000,
                    ).toISOString(),
                    reason: t("snoozed_from_issue_run_ledger"),
                  })
                }
                disabled={pendingWatchdogDecision != null}
              >
                {t("snooze_1h")}
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-background/80 px-2 py-1 text-(length:--text-micro) text-foreground hover:bg-background"
                onClick={() =>
                  onWatchdogDecision({
                    runId: latestSilentRun.runId,
                    decision: "dismissed_false_positive",
                    evaluationIssueId:
                      latestSilentRun.outputSilence?.evaluationIssueId ?? null,
                    reason: t("dismissed_from_issue_run_ledger"),
                  })
                }
                disabled={pendingWatchdogDecision != null}
              >
                {t("mark_false_positive")}
              </button>
            </div>
          ) : null}
          {watchdogDecisionError ? (
            <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-(length:--text-micro) text-red-900 dark:text-red-200">
              {watchdogDecisionError}
            </p>
          ) : null}
        </div>
      ) : null}

      {feedItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {renderActivityEvent
            ? t("runs_and_activity_will_appear_here_once_this_tas")
            : t("historical_runs_without_liveness_metadata_will_a")}
        </div>
      ) : (
        <div className="space-y-1.5">
          {feedItems.slice(0, 20).map((item) => {
            if (item.kind === "activity") {
              return (
                <div key={`activity:${item.id}`}>
                  {renderActivityEvent?.(item.event)}
                </div>
              );
            }
            const run = item.run;
            const liveness = livenessCopyForRun(run);
            const stopReason = stopReasonLabel(run);
            const duration = formatDuration(run.startedAt, run.finishedAt);
            const exhausted = hasExhaustedContinuation(run);
            const continuation = continuationLabel(run);
            const retryState = describeRunRetryState(run);
            const agentName = compactAgentName(run, agentMap);
            const onBehalfOfLabel = run.responsibleUserId
              ? responsibleUserLabel(resolveUserLabel?.(run.responsibleUserId))
              : null;
            const denialCode = isResponsibleUserDenialCode(run.errorCode)
              ? run.errorCode
              : null;
            const sourceResolvedFold = readSourceResolvedWatchdogFold(
              run.resultJson,
            );
            return (
              <article
                key={`run:${run.runId}`}
                className="space-y-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{t("run")}</span>
                  <Link
                    to={`/agents/${run.agentId}/runs/${run.runId}`}
                    className="min-w-0 max-w-full truncate font-mono text-foreground hover:underline"
                  >
                    {run.runId.slice(0, 8)}
                  </Link>
                  <span>{t("zhComponents.text_408158643e")} {agentName}</span>
                  {onBehalfOfLabel ? (
                    <span
                      data-testid="run-on-behalf-of"
                      className="min-w-0 max-w-full truncate text-muted-foreground"
                      title={t("zhComponents.message_ed13393a9d", { value1: onBehalfOfLabel })}
                    >
                      {t("on_behalf_of")}{" "}
                      <span className="text-foreground">{onBehalfOfLabel}</span>
                    </span>
                  ) : null}
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-(length:--text-micro) capitalize text-muted-foreground">
                    {statusLabel(run.status)}
                  </span>
                  {run.isLive ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-(length:--text-micro) text-blue-700 dark:text-blue-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {t("zhComponents.text_98aadb3708")}
                    </span>
                  ) : null}
                  <ProviderTraceStatusBadge
                    trace={providerTraceMetadata.get(run.runId)}
                    requested={runRequestedProviderTrace(run.contextSnapshot)}
                    showOff
                  />
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
                      liveness.tone,
                    )}
                    title={liveness.description}
                  >
                    {liveness.label}
                  </span>
                  {exhausted ? (
                    <span className="rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-(length:--text-micro) font-medium text-red-700 dark:text-red-300">
                      {t("exhausted")}
                    </span>
                  ) : null}
                  {continuation ? (
                    <span className="text-(length:--text-micro) text-muted-foreground">
                      {continuation}
                    </span>
                  ) : null}
                  {retryState ? (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
                        retryState.tone,
                      )}
                    >
                      {retryState.badgeLabel}
                    </span>
                  ) : null}
                  {run.outputSilence &&
                  RUN_OUTPUT_SILENCE_COPY[run.outputSilence.level] ? (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
                        RUN_OUTPUT_SILENCE_COPY[run.outputSilence.level]?.tone,
                      )}
                    >
                      {RUN_OUTPUT_SILENCE_COPY[run.outputSilence.level]?.label}
                    </span>
                  ) : null}
                  {sourceResolvedFold ? <SourceResolvedFoldBadge /> : null}
                  <span className="ml-auto shrink-0">
                    {relativeTime(item.timestamp)}
                  </span>
                  <button
                    type="button"
                    className="rounded-md border border-border px-1.5 py-0.5 text-(length:--text-micro) text-foreground hover:bg-accent/40"
                    onClick={() => setInspectedRun(run)}
                  >
                    {t("inspect_run")}
                  </button>
                </div>

                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div className="min-w-0">
                    <span className="text-foreground">{t("elapsed")}</span>{" "}
                    {duration ?? getDisplayLabel("unknown", "raw")}
                  </div>
                  <div className="min-w-0">
                    <span className="text-foreground">{t("last_useful_action")}</span>{" "}
                    {lastUsefulActionLabel(run)}
                  </div>
                  <div className="min-w-0">
                    <span className="text-foreground">{t("stop")}</span>{" "}
                    {stopStatusLabel(run, stopReason)}
                  </div>
                </div>

                {retryState ? (
                  <div className="rounded-md border border-border/70 bg-accent/20 px-2 py-2 text-xs leading-5 text-muted-foreground">
                    {retryState.detail ? <p>{retryState.detail}</p> : null}
                    {retryState.secondary ? (
                      <p>{retryState.secondary}</p>
                    ) : null}
                    {retryState.retryOfRunId ? (
                      <p>
                        {t("retry_of")}{" "}
                        <Link
                          to={`/agents/${run.agentId}/runs/${retryState.retryOfRunId}`}
                          className="font-mono text-foreground hover:underline"
                        >
                          {retryState.retryOfRunId.slice(0, 8)}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {run.livenessReason ? (
                  <p className="min-w-0 break-words text-xs leading-5 text-muted-foreground">
                    {run.livenessReason}
                  </p>
                ) : null}

                {denialCode ? (
                  <ResponsibleUserDenialNotice
                    code={denialCode}
                    userName={
                      run.responsibleUserId
                        ? resolveUserLabel?.(run.responsibleUserId)
                        : null
                    }
                  />
                ) : null}

                {run.nextAction ? (
                  <div className="min-w-0 rounded-md bg-accent/40 px-2 py-1.5 text-xs leading-5">
                    <span className="font-medium text-foreground">
                      {t("next_action_537761")}{" "}
                    </span>
                    <span className="break-words text-muted-foreground">
                      {run.nextAction}
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })}
          {feedItems.length > 20 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {feedItems.length - 20} {t("older_items_not_shown")}
            </div>
          ) : null}
        </div>
      )}
      {inspectedRun ? (
        <RunnerInspector
          runId={inspectedRun.runId}
          run={inspectedRun}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setInspectedRun(null);
          }}
          onRerunWithTrace={
            !["queued", "running"].includes(inspectedRun.status) &&
            onRerunWithTrace
              ? () => onRerunWithTrace(inspectedRun)
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
