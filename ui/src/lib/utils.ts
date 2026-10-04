import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { deriveAgentUrlKey, deriveProjectUrlKey, normalizeProjectUrlKey, hasNonAsciiContent } from "@paperclipai/shared";
import type { BillingType, FinanceDirection, FinanceEventKind } from "@paperclipai/shared";
import { t, i18n } from "@/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Classes for a sidebar row label when the sidebar is collapsed to the icon rail
 * (PAP-10676). Unlike `sr-only` (which is `position: absolute` and therefore
 * removes the label from flow), this keeps the label in flow so it still
 * contributes its line-height to the row. That guarantees a row is the *exact*
 * same height collapsed as expanded, so the icons never shift vertically between
 * states. The label is clipped to zero visible width and rendered transparent,
 * but stays in the DOM and the a11y tree as the link's accessible name.
 */
export const SIDEBAR_RAIL_HIDDEN_LABEL =
  "block w-0 min-w-0 overflow-hidden whitespace-nowrap text-transparent select-none";

export function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(i18n.resolvedLanguage ?? i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString(i18n.resolvedLanguage ?? i18n.language);
}

/**
 * Format a project's budget for the projects list view (IA Phase 4 — PAP-60).
 * Monthly budgets render a `/mo` suffix; lifetime budgets show the bare amount.
 */
export function formatProjectBudget(budget: { amountCents: number; windowKind: string }): string {
  const amount = formatCents(budget.amountCents);
  return budget.windowKind === "calendar_month_utc" ? t("zhSupport.monthlyPrice", { amount }) : amount;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString(i18n.resolvedLanguage ?? i18n.language, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleString(i18n.resolvedLanguage ?? i18n.language, {
    month: "short",
    day: "numeric",
  });
}

export function relativeTime(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return t("just_now");
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t("zhSupport.time.minutesAgo", { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t("zhSupport.time.hoursAgo", { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return t("zhSupport.time.daysAgo", { count: diffDay });
  return formatDate(date);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Humanize a millisecond duration into a compact `1h 2m`, `45m 12s`, `12s` string. */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return t("zhSupport.time.seconds", { count: 0 });
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return t("zhSupport.time.seconds", { count: totalSeconds });
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? t("zhSupport.time.minutesSeconds", { minutes, seconds }) : t("zhSupport.time.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? t("zhSupport.time.hoursMinutes", { hours, minutes: remainingMinutes }) : t("zhSupport.time.hours", { count: hours });
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? t("zhSupport.time.daysHours", { days, hours: remainingHours }) : t("zhSupport.time.days", { count: days });
}

/** Map a raw provider slug to a display-friendly name. */
export function providerDisplayName(provider: string): string {
  const map: Record<string, string> = {
    anthropic: t("anthropic"),
    aws_bedrock: t("aws_bedrock"),
    openai: t("openai"),
    openrouter: t("openrouter"),
    chatgpt: t("chatgpt"),
    google: t("google"),
    cursor: t("cursor"),
    jetbrains: t("jetbrains_ai"),
  };
  return map[provider.toLowerCase()] ?? provider;
}

export function billingTypeDisplayName(billingType: BillingType): string {
  const map: Record<BillingType, string> = {
    metered_api: t("metered_api"),
    subscription_included: t("subscription"),
    subscription_overage: t("subscription_overage"),
    credits: t("credits"),
    fixed: t("fixed"),
    unknown: t("unknown"),
  };
  return map[billingType];
}

export function quotaSourceDisplayName(source: string): string {
  const map: Record<string, string> = {
    "anthropic-oauth": t("anthropic_oauth"),
    "claude-cli": t("claude_cli"),
    "bedrock": t("aws_bedrock"),
    "codex-rpc": t("codex_app_server"),
    "codex-wham": t("chatgpt_wham"),
  };
  return map[source] ?? source;
}

function coerceBillingType(value: unknown): BillingType | null {
  if (
    value === "metered_api" ||
    value === "subscription_included" ||
    value === "subscription_overage" ||
    value === "credits" ||
    value === "fixed" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function readRunCostUsd(payload: Record<string, unknown> | null): number {
  if (!payload) return 0;
  for (const key of ["costUsd", "cost_usd", "total_cost_usd"] as const) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

export function visibleRunCostUsd(
  usage: Record<string, unknown> | null,
  result: Record<string, unknown> | null = null,
): number {
  const billingType = coerceBillingType(usage?.billingType) ?? coerceBillingType(result?.billingType);
  if (billingType === "subscription_included") return 0;
  return readRunCostUsd(usage) || readRunCostUsd(result);
}

export function financeEventKindDisplayName(eventKind: FinanceEventKind): string {
  const map: Record<FinanceEventKind, string> = {
    inference_charge: t("inference_charge"),
    platform_fee: t("platform_fee"),
    credit_purchase: t("credit_purchase"),
    credit_refund: t("credit_refund"),
    credit_expiry: t("credit_expiry"),
    byok_fee: t("byok_fee"),
    gateway_overhead: t("gateway_overhead"),
    log_storage_charge: t("log_storage"),
    logpush_charge: t("logpush"),
    provisioned_capacity_charge: t("provisioned_capacity"),
    training_charge: t("training"),
    custom_model_import_charge: t("custom_model_import"),
    custom_model_storage_charge: t("custom_model_storage"),
    manual_adjustment: t("manual_adjustment"),
  };
  return map[eventKind];
}

export function financeDirectionDisplayName(direction: FinanceDirection): string {
  return direction === "credit" ? t("credit") : t("debit");
}

/** Build an issue URL using the human-readable identifier when available. */
export function issueUrl(issue: { id: string; identifier?: string | null }): string {
  return `/issues/${issue.identifier ?? issue.id}`;
}

/** Build an agent route URL using the short URL key when available. */
export function agentRouteRef(agent: { id: string; urlKey?: string | null; name?: string | null }): string {
  return agent.urlKey ?? deriveAgentUrlKey(agent.name, agent.id);
}

/** Build an agent URL using the short URL key when available. */
export function agentUrl(agent: { id: string; urlKey?: string | null; name?: string | null }): string {
  return `/agents/${agentRouteRef(agent)}`;
}

/** Build a project route reference, falling back to UUID when the derived key is ambiguous. */
export function projectRouteRef(project: { id: string; urlKey?: string | null; name?: string | null }): string {
  const key = project.urlKey ?? deriveProjectUrlKey(project.name, project.id);
  // Guard for rolling deploys or legacy data where the server returned a bare slug without UUID suffix.
  if (key === normalizeProjectUrlKey(project.name) && hasNonAsciiContent(project.name)) return project.id;
  return key;
}

/** Build a project URL using the short URL key when available. */
export function projectUrl(project: { id: string; urlKey?: string | null; name?: string | null }): string {
  return `/projects/${projectRouteRef(project)}`;
}

/** Build a project workspace URL scoped under its project. */
export function projectWorkspaceUrl(
  project: { id: string; urlKey?: string | null; name?: string | null },
  workspaceId: string,
): string {
  return `${projectUrl(project)}/workspaces/${workspaceId}`;
}
