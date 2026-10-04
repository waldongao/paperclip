import { getCountNoun } from "@/components/localized-count";
import { getDisplayLabel } from "@/lib/display-labels";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MinusCircle,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { decisionEffectTargetIssueIds, type DecisionEffect, type DecisionOption } from "@paperclipai/shared";
import type {
  Decision,
  DecisionEffectExecution,
  DecisionTargetSnapshot,
} from "../api/decisions";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { MarkdownBody } from "./MarkdownBody";
import { useTranslation } from "@/i18n";
import { t } from "@/i18n";

/**
 * Presentational card for a single Decisions-v1 decision (PAP-14966 / PAP-14939
 * §4), modeled on {@link IssueThreadInteractionCard}. It renders every state —
 * pending / stale-target / destructive cancel-tree / decided / partial / failed
 * / expired / cancelled / dismissed — and delegates the actual decide / dismiss
 * mutations to the parent (the feed's `DecisionResolver`, or the history view).
 * It never fetches: issue labels + the cancel-tree preview arrive via resolvers
 * so the same component drives the live feed and the screenshot harness.
 */

export interface DecisionIssueRef {
  id: string;
  identifier: string | null;
  title: string | null;
  href: string;
  status?: string | null;
}

export interface DecisionCardProps {
  decision: Decision;
  /** Per-effect execution rows (present once decided). */
  executions?: DecisionEffectExecution[] | null;
  /** Which target issues drifted since the snapshot (open decisions only). */
  targetChanged?: Record<string, boolean> | null;
  /** Resolve an issue id to a display ref (identifier / title / link). */
  resolveIssue?: (issueId: string) => DecisionIssueRef | null;
  /** Full sub-tree that a `cancel_issue_tree` option would cancel. */
  cancelTreePreview?: (targetIssueId: string) => DecisionIssueRef[] | null;
  originAgentName?: string | null;
  originIssue?: DecisionIssueRef | null;
  runHref?: string | null;
  busy?: boolean;
  errorMessage?: string | null;
  onDecide?: (optionId: string, inputValues: Record<string, string>) => void;
  onDismiss?: (reason?: string) => void;
  className?: string;
}

// --- small helpers ----------------------------------------------------------

function humanStatus(status: string | null | undefined): string {
  return getDisplayLabel(status, "raw");
}

function issueLabel(ref: DecisionIssueRef | null, fallbackId: string): string {
  if (ref?.identifier) return ref.identifier;
  if (ref?.title) return ref.title;
  return t("zhComponents.message_e8dd5e075f", { value1: fallbackId.slice(0, 8) });
}

function pluralize(count: number, singular: string): string {
  return `${count} ${getCountNoun(count, singular)}`;
}

function isDestructiveOption(option: DecisionOption): boolean {
  return option.style === "destructive" || option.effects.some((effect) => effect.type === "cancel_issue_tree");
}

function cancelTreeEffect(option: DecisionOption): Extract<DecisionEffect, { type: "cancel_issue_tree" }> | null {
  return (option.effects.find((effect) => effect.type === "cancel_issue_tree") ?? null) as
    | Extract<DecisionEffect, { type: "cancel_issue_tree" }>
    | null;
}

/** One-line feed-forward preview of what an effect will do, before you commit. */
function effectSummary(
  effect: DecisionEffect,
  resolve: (id: string) => DecisionIssueRef | null,
  snapshots: Record<string, DecisionTargetSnapshot>,
): string {
  const target = issueLabel(resolve(effect.targetIssueId), effect.targetIssueId);
  switch (effect.type) {
    case "comment_on_issue":
      return t("zhComponents.message_7554a5a096", { value1: target });
    case "create_issue": {
      const parent = effect.draft.parentId
        ? issueLabel(resolve(effect.draft.parentId), effect.draft.parentId)
        : target;
      return t("zhComponents.message_5aac1b7f51", { value1: effect.draft.title, value2: parent });
    }
    case "update_issue_status":
      return t("zhComponents.message_399ebb5704", { value1: target, value2: humanStatus(effect.status) });
    case "assign_issue":
      return t("zhComponents.message_70542b7647", { value1: target });
    case "resolve_blocker":
      return t("zhComponents.message_1aea7770c3", { value1: target, value2: pluralize(effect.removeBlockedByIssueIds.length, "blocker") });
    case "cancel_issue_tree": {
      const snapshot = snapshots[effect.targetIssueId];
      const descendantCount = snapshot?.descendantCount ?? snapshot?.descendantIds?.length ?? snapshot?.childCount ?? 0;
      return t("zhComponents.message_b9aa6d1e54", { value1: target, value2: pluralize(descendantCount + 1, "issue") });
    }
    default:
      return t("apply_effect");
  }
}

const FAILURE_CAUSE: Record<string, string> = {
  deny_decision_intersection: t("zhComponents.text_c2be49b3dd"),
  invalid_effect_reference: t("a_referenced_issue_no_longer_exists"),
  target_changed: t("the_target_changed_since_this_was_proposed"),
  effect_execution_failed: t("the_effect_errored_while_running"),
};

interface ResultRow {
  key: string;
  status: DecisionEffectExecution["status"];
  summary: string;
  link: DecisionIssueRef | null;
}

function executionRow(
  execution: DecisionEffectExecution,
  resolve: (id: string) => DecisionIssueRef | null,
): ResultRow {
  const targetRef = resolve(execution.targetIssueId);
  const target = issueLabel(targetRef, execution.targetIssueId);
  const result = execution.result ?? {};
  if (execution.status === "skipped") {
    return { key: execution.id, status: "skipped", summary: t("zhComponents.message_6d9f311df7", { value1: target }), link: targetRef };
  }
  if (execution.status === "failed") {
    const cause = FAILURE_CAUSE[execution.error ?? ""] ?? execution.error ?? t("the_effect_could_not_run");
    return { key: execution.id, status: "failed", summary: t("zhComponents.message_0e34ccfde3", { value1: target, value2: cause }), link: targetRef };
  }
  if (execution.status === "claimed") {
    return { key: execution.id, status: "claimed", summary: t("zhComponents.message_3dc64672e7", { value1: target }), link: targetRef };
  }
  // executed
  switch (execution.effectType) {
    case "comment_on_issue":
      return { key: execution.id, status: "executed", summary: t("zhComponents.message_d7033d7b6c", { value1: target }), link: targetRef };
    case "create_issue": {
      const createdId = typeof result.issueId === "string" ? result.issueId : null;
      const created = createdId ? resolve(createdId) : null;
      return {
        key: execution.id,
        status: "executed",
        summary: t("zhComponents.message_559f04a8b3", { value1: created ? issueLabel(created, createdId!) : t("a_new_issue") }),
        link: created ?? targetRef,
      };
    }
    case "update_issue_status":
      return { key: execution.id, status: "executed", summary: t("zhComponents.message_df10ccae04", { value1: target, value2: humanStatus(typeof result.status === "string" ? result.status : null) }), link: targetRef };
    case "assign_issue":
      return { key: execution.id, status: "executed", summary: t("zhComponents.message_a3a82a5796", { value1: target }), link: targetRef };
    case "resolve_blocker": {
      const removed = Array.isArray(result.removedBlockedByIssueIds) ? result.removedBlockedByIssueIds.length : 0;
      return { key: execution.id, status: "executed", summary: t("zhComponents.message_dbf7e83c7d", { value1: pluralize(removed, "blocker"), value2: target }), link: targetRef };
    }
    case "cancel_issue_tree": {
      const cancelled = Array.isArray(result.cancelledIssueIds) ? result.cancelledIssueIds.length : 0;
      return { key: execution.id, status: "executed", summary: t("zhComponents.message_e65d20d594", { value1: pluralize(cancelled, "issue"), value2: target }), link: targetRef };
    }
    default:
      return { key: execution.id, status: "executed", summary: t("zhComponents.message_817eb617e0", { value1: target }), link: targetRef };
  }
}

// --- shell / badge palette (matches IssueThreadInteractionCard) --------------

type CardTone = "pending" | "destructive" | "success" | "partial" | "failed" | "neutral";

const SHELL: Record<CardTone, string> = {
  pending: "border-sky-500/70",
  destructive: "border-2 border-rose-500/80",
  success: "border-emerald-400/70",
  partial: "border-amber-400/70",
  failed: "border-rose-400/70",
  neutral: "border-border/60",
};

const BADGE: Record<CardTone, string> = {
  pending: "border-sky-500/60 bg-sky-500/10 text-sky-900 dark:bg-sky-500/15 dark:text-sky-100",
  destructive: "border-rose-500/60 bg-rose-500/10 text-rose-800 dark:bg-rose-500/15 dark:text-rose-100",
  success: "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100",
  partial: "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
  failed: "border-rose-500/60 bg-rose-500/10 text-rose-800 dark:bg-rose-500/15 dark:text-rose-100",
  neutral: "border-border/70 bg-muted/50 text-muted-foreground",
};

function IssueLink({ ref: link }: { ref: DecisionIssueRef | null }) {
  if (!link) return null;
  return (
    <a
      href={link.href}
      className="inline-flex items-center gap-1 rounded-sm border border-border/70 bg-background px-1.5 py-0.5 text-xs font-medium text-foreground hover:border-sky-500/70 hover:text-sky-700 dark:hover:text-sky-300"
    >
      {issueLabel(link, link.id)}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

const RESULT_ICON: Record<ResultRow["status"], ReactNode> = {
  executed: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />,
  failed: <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />,
  skipped: <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />,
  claimed: <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />,
};

export function DecisionCard({
  decision,
  executions,
  targetChanged,
  resolveIssue = () => null,
  cancelTreePreview,
  originAgentName,
  originIssue,
  runHref,
  busy = false,
  errorMessage,
  onDecide,
  onDismiss,
  className,
}: DecisionCardProps) {
  const { t } = useTranslation();
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [confirmOptionId, setConfirmOptionId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const open = decision.status === "open";
  const dismissed =
    decision.chosenOptionId === "dismissed" || (decision.metadata as { dismissed?: boolean } | null)?.dismissed === true;
  const snapshots = (decision.targetSnapshots ?? {}) as Record<string, DecisionTargetSnapshot>;

  const staleTargetIds = useMemo(
    () => (open ? Object.entries(targetChanged ?? {}).filter(([, changed]) => changed).map(([id]) => id) : []),
    [open, targetChanged],
  );
  const staleTargetIdSet = useMemo(() => new Set(staleTargetIds), [staleTargetIds]);
  const isStale = staleTargetIds.length > 0;
  const hasCancelTree = decision.options.some((option) => option.effects.some((effect) => effect.type === "cancel_issue_tree"));

  const tone: CardTone = open
    ? hasCancelTree
      ? "destructive"
      : "pending"
    : decision.status !== "decided"
      ? "neutral" // expired / cancelled
      : dismissed
        ? "neutral"
        : decision.executionStatus === "succeeded"
          ? "success"
          : decision.executionStatus === "partial"
            ? "partial"
            : "failed";

  const badgeLabel = open
    ? t("pending")
    : decision.status === "expired"
      ? t("expired")
      : decision.status === "cancelled"
        ? t("cancelled")
        : dismissed
          ? t("dismissed")
          : decision.executionStatus === "succeeded"
            ? t("decided_55615a")
            : decision.executionStatus === "partial"
              ? t("partial")
              : t("failed");

  const requiredUnmet = (decision.inputs ?? []).some(
    (field) => field.required && !(inputValues[field.id] ?? "").trim(),
  );

  const runOption = (option: DecisionOption) => {
    if (busy) return;
    const cancelTree = cancelTreeEffect(option);
    if (cancelTree && confirmOptionId !== option.id) {
      setConfirmOptionId(option.id);
      setConfirmText("");
      return;
    }
    onDecide?.(option.id, inputValues);
  };

  const dimmed = decision.status === "expired" || decision.status === "cancelled";
  const expiredReason = (decision.metadata as { expiredReason?: string } | null)?.expiredReason;

  // The issues this decision acts on. The origin issue is only where the agent
  // was running when it proposed the decision — the queue links there, but the
  // decision may target a different issue entirely, so name the targets
  // explicitly or the card is undiscoverable from the issue it applies to.
  const targetRefs = useMemo(() => {
    const ids = new Set<string>();
    for (const option of decision.options) {
      for (const effect of option.effects) {
        for (const id of decisionEffectTargetIssueIds(effect)) ids.add(id);
      }
    }
    if (originIssue?.id) ids.delete(originIssue.id);
    return [...ids].map((id) => ({ id, ref: resolveIssue(id) }));
  }, [decision.options, originIssue?.id, resolveIssue]);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-background/82 p-4 text-sm",
        SHELL[tone],
        dimmed && "opacity-80",
        className,
      )}
      data-decision-state={badgeLabel.toLowerCase()}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-base font-semibold text-foreground">{decision.title}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {open && hasCancelTree && (
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-(length:--text-micro) font-semibold uppercase tracking-wide", BADGE.destructive)}>
              <ShieldAlert className="h-3 w-3" aria-hidden /> {t("destructive")}
            </span>
          )}
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-(length:--text-micro) font-semibold uppercase tracking-wide", BADGE[tone])}>
            {badgeLabel}
          </span>
        </div>
      </div>

      {/* Provenance */}
      <p className="mt-1 text-xs text-muted-foreground">
        {t("proposed_by_788df0")} <span className="font-medium text-foreground">{originAgentName ?? t("an_agent")}</span>
        {originIssue && (
          <>
            {" "}{t("while_running")}{" "}
            <a href={originIssue.href} className="font-medium text-primary underline-offset-2 hover:underline">
              {issueLabel(originIssue, originIssue.id)}
            </a>
          </>
        )}
        {targetRefs.length > 0 && (
          <>
            {t("applies_to")}
            {targetRefs.map(({ id, ref }, index) => (
              <span key={id}>
                {index > 0 && ", "}
                {ref ? (
                  <a href={ref.href} className="font-medium text-primary underline-offset-2 hover:underline">
                    {issueLabel(ref, id)}
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{issueLabel(null, id)}</span>
                )}
              </span>
            ))}
          </>
        )}
        {runHref && (
          <>
            {" · "}
            <a href={runHref} className="hover:underline">{t("view_run")}</a>
          </>
        )}
      </p>

      {/* Body */}
      {decision.body?.trim() && (
        <div className="mt-3 text-sm leading-6 text-foreground/90">
          <MarkdownBody>{decision.body}</MarkdownBody>
        </div>
      )}

      {/* Stale-target warning (open only) */}
      {open && isStale && (
        <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {pluralize(staleTargetIds.length, "target")} {t("changed_since_this_was_proposed")}
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-900/90 dark:text-amber-100/90">
            {staleTargetIds.map((id) => {
              const ref = resolveIssue(id);
              const from = snapshots[id];
              return (
                <li key={id} className="flex flex-wrap items-center gap-1">
                  <span className="font-medium">{issueLabel(ref, id)}:</span>
                  <span className="tabular-nums">{humanStatus(from?.status)}</span>
                  <ArrowRight className="h-3 w-3" aria-hidden />
                  <span className="tabular-nums">{humanStatus(ref?.status) || t("changed")}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-xs text-amber-800/80 dark:text-amber-200/80">
            {t("options_that_require_an_unchanged_target_are_dis")}
          </p>
        </div>
      )}

      {/* Inputs (open only) */}
      {open && (decision.inputs ?? []).length > 0 && (
        <div className="mt-3 space-y-2">
          {(decision.inputs ?? []).map((field) => (
            <label key={field.id} className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {field.label}
                {field.required && <span className="text-rose-500"> *</span>}
              </span>
              <Textarea
                value={inputValues[field.id] ?? ""}
                onChange={(event) => setInputValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
                placeholder={field.placeholder ?? undefined}
                maxLength={field.maxLength ?? undefined}
                className="mt-1 min-h-16 bg-background text-sm"
              />
            </label>
          ))}
        </div>
      )}

      {/* Options (open only) */}
      {open && (
        <div className="mt-3 space-y-2">
          {decision.options.map((option) => {
            const destructive = isDestructiveOption(option);
            const blockedStale = option.effects.some(
              (effect) => effect.staleness === "strict" && decisionEffectTargetIssueIds(effect).some((id) => staleTargetIdSet.has(id)),
            );
            const disabled = busy || requiredUnmet || blockedStale;
            const cancelTree = cancelTreeEffect(option);
            const confirming = confirmOptionId === option.id;
            const previewRows = cancelTree && cancelTreePreview ? cancelTreePreview(cancelTree.targetIssueId) : null;
            const confirmRef = cancelTree ? resolveIssue(cancelTree.targetIssueId) : null;
            const confirmToken = confirmRef?.identifier ?? confirmRef?.id ?? cancelTree?.targetIssueId ?? "";
            return (
              <div key={option.id} className="space-y-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => runOption(option)}
                  className={cn(
                    "w-full rounded-sm border px-4 py-3 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                    disabled && "cursor-not-allowed opacity-60",
                    destructive
                      ? "border-rose-500/70 bg-rose-500/5 text-foreground hover:border-rose-500 hover:bg-rose-500/10"
                      : "border-border/70 bg-transparent text-foreground hover:border-sky-500/70 hover:bg-sky-500/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm font-medium", destructive && "text-rose-700 dark:text-rose-300")}>
                      {option.label}
                    </span>
                    {blockedStale && (
                      <span className="shrink-0 rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-(length:--text-micro) font-medium text-amber-800 dark:text-amber-200">
                        {t("blocked_stale")}
                      </span>
                    )}
                  </div>
                  {option.description && (
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">{option.description}</div>
                  )}
                  {option.effects.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {option.effects.map((effect, index) => (
                        <li
                          key={index}
                          className={cn(
                            "flex items-start gap-1.5 text-xs",
                            effect.type === "cancel_issue_tree" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground",
                          )}
                        >
                          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {effectSummary(effect, resolveIssue, snapshots)}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>

                {/* Destructive cancel-tree confirm gate */}
                {confirming && cancelTree && (
                  <div className="rounded-lg border border-rose-500/50 bg-rose-500/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                      <Ban className="h-4 w-4" aria-hidden /> {t("this_cancels_an_entire_issue_tree")}
                    </div>
                    {previewRows && previewRows.length > 0 ? (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pluralize(previewRows.length, "issue")} {t("will_be_cancelled")}
                        </p>
                        <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto text-xs">
                          {previewRows.map((row) => (
                            <li key={row.id} className="flex items-center gap-1.5">
                              <Ban className="h-3 w-3 shrink-0 text-rose-500" aria-hidden />
                              <span className="font-medium">{issueLabel(row, row.id)}</span>
                              {row.title && row.identifier && (
                                <span className="truncate text-muted-foreground">{row.title}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("this_issue_and_every_sub_issue_beneath_it_will_b")}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("type")} <span className="font-mono font-medium text-foreground">{confirmToken}</span> {t("to_confirm")}
                    </p>
                    <Input
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      placeholder={confirmToken}
                      aria-label={t("type_the_issue_identifier_to_confirm")}
                      autoFocus
                      className="mt-1"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setConfirmOptionId(null);
                          setConfirmText("");
                        }}
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy || confirmText.trim() !== confirmToken}
                        onClick={() => onDecide?.(option.id, inputValues)}
                      >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {previewRows ? t("zhComponents.message_e6b22d3ea2", { value1: pluralize(previewRows.length, "issue") }) : t("cancel_tree")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Always-present zero-effect Dismiss (telemetered "no", distinct from expiry) */}
          {!decision.options.some((option) => option.effects.length === 0) && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground">{t("not_now_5f263e")}</span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDismiss?.()}>
                {t("dismiss_no_effects")}
              </Button>
            </div>
          )}
          {errorMessage && <p className="text-xs text-rose-600 dark:text-rose-400">{errorMessage}</p>}
        </div>
      )}

      {/* Terminal states */}
      {!open && (
        <div className="mt-3 space-y-2">
          {decision.status === "expired" && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Clock className="h-4 w-4" aria-hidden /> {t("the_decision_window_closed")}
              </div>
              <p className="mt-1">
                {expiredReason === "target_gone"
                  ? t("a_target_issue_was_cancelled_before_this_was_dec")
                  : expiredReason === "target_completed"
                    ? t("all_target_issues_were_completed_before_this_was")
                    : t("no_response_before_the_expiry_deadline")}
                {decision.continuationPolicy === "wake_origin_agent" && t("the_proposer_was_re_woken")}
              </p>
            </div>
          )}
          {decision.status === "cancelled" && (
            <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("this_decision_was_withdrawn_by_the_proposer_befo")}
            </p>
          )}
          {decision.status === "decided" && dismissed && (
            <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("dismissed_no_effects_were_run")}
            </p>
          )}
          {decision.status === "decided" && !dismissed && (executions ?? []).length > 0 && (
            <>
              <ul className="space-y-1.5">
                {(executions ?? []).map((execution) => {
                  const row = executionRow(execution, resolveIssue);
                  return (
                    <li key={row.key} className="flex items-start gap-2">
                      {RESULT_ICON[row.status]}
                      <span className="min-w-0 flex-1 text-sm text-foreground/90">{row.summary}</span>
                      <IssueLink ref={row.link} />
                    </li>
                  );
                })}
              </ul>
              {decision.executionStatus !== "succeeded" && (
                <p className="text-xs text-muted-foreground">
                  {t("some_effects_may_already_have_been_applied_revie")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
