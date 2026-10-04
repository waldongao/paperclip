import { formatDateTime } from "./utils";
import { t } from "@/i18n";
import { translateDisplayMessage } from "@/i18n/display-message";

type RetryAwareRun = {
  status: string;
  retryOfRunId?: string | null;
  scheduledRetryAt?: string | Date | null;
  scheduledRetryAttempt?: number | null;
  scheduledRetryReason?: string | null;
  retryExhaustedReason?: string | null;
};

export type RunRetryStateSummary = {
  kind: "scheduled" | "exhausted" | "attempted";
  badgeLabel: string;
  tone: string;
  detail: string | null;
  secondary: string | null;
  retryOfRunId: string | null;
};

const RETRY_REASON_LABELS: Record<string, string> = {
  transient_failure: t("transient_failure"),
  missing_issue_comment: t("missing_task_comment"),
  process_lost: t("process_lost_8e50aa"),
  assignment_recovery: t("assignment_recovery"),
  issue_continuation_needed: t("continuation_needed"),
  max_turns_continuation: t("max_turn_continuation"),
};

const ADDITIONAL_RETRY_REASON_KEYS: Record<string, string> = {
  workspace_busy: "zhSupport.finalRetryWorkspaceBusy",
  interaction_continuation_infra_retry: "zhSupport.finalRetryInteractionInfra",
  execution_review_participant_recovery: "zhSupport.finalRetryExecutionReview",
  issue_disposition_repair: "zhSupport.finalRetryDisposition",
  provider_quota_recovery: "zhSupport.finalRetryProviderQuota",
};

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function joinFragments(parts: Array<string | null>) {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(" · ") : null;
}

export function formatRetryReason(reason: string | null | undefined) {
  const normalized = readNonEmptyString(reason);
  if (!normalized) return null;
  const additionalKey = ADDITIONAL_RETRY_REASON_KEYS[normalized];
  return RETRY_REASON_LABELS[normalized] ?? (additionalKey ? t(additionalKey) : normalized.replace(/_/g, " "));
}

export function describeRunRetryState(run: RetryAwareRun): RunRetryStateSummary | null {
  const attempt =
    typeof run.scheduledRetryAttempt === "number" && Number.isFinite(run.scheduledRetryAttempt) && run.scheduledRetryAttempt > 0
      ? run.scheduledRetryAttempt
      : null;
  const attemptLabel = attempt ? t("zhSupport.retryAttempt", { attempt }) : null;
  const reasonLabel = formatRetryReason(run.scheduledRetryReason);
  const retryOfRunId = readNonEmptyString(run.retryOfRunId);
  const exhaustedReason = readNonEmptyString(run.retryExhaustedReason);
  const dueAt = run.scheduledRetryAt ? formatDateTime(run.scheduledRetryAt) : null;
  const isMaxTurnContinuation = run.scheduledRetryReason === "max_turns_continuation";
  const hasRetryMetadata =
    Boolean(retryOfRunId)
    || Boolean(reasonLabel)
    || Boolean(dueAt)
    || Boolean(attemptLabel)
    || Boolean(exhaustedReason);

  if (!hasRetryMetadata) return null;

  if (run.status === "scheduled_retry") {
    return {
      kind: "scheduled",
      badgeLabel: isMaxTurnContinuation ? t("continuation_scheduled") : t("retry_scheduled"),
      tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
      detail: joinFragments([attemptLabel, reasonLabel]),
      secondary: dueAt
        ? `${isMaxTurnContinuation ? t("next_continuation") : t("next_retry")} ${dueAt}`
        : t("zhSupport.retryPendingSchedule", { action: isMaxTurnContinuation ? t("next_continuation") : t("next_retry") }),
      retryOfRunId,
    };
  }

  if (exhaustedReason) {
    return {
      kind: "exhausted",
      badgeLabel: isMaxTurnContinuation ? t("continuation_exhausted") : t("retry_exhausted"),
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      detail: joinFragments([attemptLabel, reasonLabel, t("automatic_retries_exhausted")]),
      secondary: exhaustedReason.includes("Manual intervention required")
        ? translateDisplayMessage(exhaustedReason)
        : t("zhSupport.manualIntervention", { reason: translateDisplayMessage(exhaustedReason) }),
      retryOfRunId,
    };
  }

  return {
    kind: "attempted",
    badgeLabel: isMaxTurnContinuation ? t("continued_run") : t("retried_run"),
    tone: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    detail: joinFragments([attemptLabel, reasonLabel]),
    secondary: null,
    retryOfRunId,
  };
}
