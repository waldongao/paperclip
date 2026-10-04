import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { brandChipBadge, type BrandChipColor } from "@/lib/status-colors";
import { t } from "@/i18n";

/**
 * The load-bearing visual grammar for the built-in bundle status panel
 * (Reflection Coach — [PAP-13099], ux-spec §4). Each variant double-encodes
 * state as glyph + word + color so it never relies on color alone
 * (WCAG 1.4.1). Colors route through the shared `brandChipBadge` families — no
 * bespoke tints are minted here (ux-spec §10).
 *
 * A single resource shows at most one readiness chip and at most one drift
 * chip; when both a readiness problem and a drift state coexist, the caller
 * suppresses the drift chip until readiness is `ready` (ux-spec §4).
 */
export type ResourceStatusVariant =
  | "ready"
  | "needs_setup"
  | "missing"
  | "error"
  | "update_available"
  | "drifted"
  | "schedule_off"
  | "schedule_on"
  | "pending_approval"
  | "proposal_pending";

interface VariantSpec {
  color: BrandChipColor;
  glyph: string;
  label: string;
  title: string;
}

const VARIANTS: Record<ResourceStatusVariant, VariantSpec> = {
  ready: { color: "green", glyph: "●", label: t("ready"), title: t("materialized_and_matches_the_shipped_default") },
  needs_setup: { color: "amber", glyph: "⚠", label: t("needs_setup"), title: t("present_but_not_usable_yet") },
  missing: { color: "amber", glyph: "⚠", label: t("missing"), title: t("expected_resource_absent_reconcile_will_recreate") },
  error: { color: "red", glyph: "✕", label: t("error"), title: t("failed_to_load_or_reconcile") },
  update_available: {
    color: "blue",
    glyph: "↑",
    label: t("update_available"),
    title: t("unedited_a_newer_shipped_default_can_be_applied"),
  },
  drifted: {
    color: "gray",
    glyph: "✎",
    label: t("drifted"),
    title: t("youve_edited_this_your_changes_are_kept_not_over"),
  },
  schedule_off: {
    color: "gray",
    glyph: "◌",
    label: t("schedule_off"),
    title: t("no_background_work_runs_until_you_enable_it_cost"),
  },
  schedule_on: { color: "green", glyph: "●", label: t("weekly"), title: t("runs_on_the_weekly_schedule") },
  pending_approval: {
    color: "amber",
    glyph: "⚠",
    label: t("pending_approval"),
    title: t("waiting_on_board_hire_approval_before_it_can_run"),
  },
  proposal_pending: {
    color: "blue",
    glyph: "↑",
    label: t("proposal_pending"),
    title: t("a_proposed_update_is_waiting_for_your_review"),
  },
};

export function ResourceStatusChip({
  variant,
  label,
  compact = false,
  className,
}: {
  variant: ResourceStatusVariant;
  /** Override the default label (e.g. "Weekly · Mon 09:00 UTC"). */
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const spec = VARIANTS[variant];
  return (
    <Badge
      variant="outline"
      className={cn(
        brandChipBadge[spec.color],
        "font-medium",
        compact && "px-1.5 py-0 text-(length:--text-nano)",
        className,
      )}
      title={spec.title}
    >
      <span aria-hidden="true">{spec.glyph}</span>
      {label ?? spec.label}
    </Badge>
  );
}
