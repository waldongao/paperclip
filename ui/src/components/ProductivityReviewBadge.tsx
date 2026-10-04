import { Eye } from "lucide-react";
import type { IssueProductivityReview } from "@paperclipai/shared";
import { Link } from "../lib/router";
import { cn } from "../lib/utils";
import { createIssueDetailPath } from "../lib/issueDetailBreadcrumb";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useTranslation } from "@/i18n";
import { t } from "@/i18n";

const TRIGGER_LABELS: Record<string, string> = {
  no_comment_streak: t("no_comment_streak_15089f"),
  long_active_duration: t("long_active_duration"),
  high_churn: t("high_churn"),
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  todo: t("open"),
  in_progress: t("in_progress_b6bd42"),
  in_review: t("in_review_c49bce"),
  blocked: t("blocked"),
  backlog: t("open"),
};

export function productivityReviewTriggerLabel(
  trigger: IssueProductivityReview["trigger"],
): string {
  if (!trigger) return t("productivity_review");
  return TRIGGER_LABELS[trigger] ?? t("productivity_review");
}

export function ProductivityReviewBadge({
  review,
  className,
  hideLabel = false,
}: {
  review: IssueProductivityReview;
  className?: string;
  hideLabel?: boolean;
}) {
  const { t } = useTranslation();
  const label = productivityReviewTriggerLabel(review.trigger);
  const reviewIdentifier = review.reviewIdentifier ?? review.reviewIssueId.slice(0, 8);
  const reviewPath = createIssueDetailPath(review.reviewIdentifier ?? review.reviewIssueId);
  const statusLabel = REVIEW_STATUS_LABELS[review.status] ?? review.status.replace(/_/g, " ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={reviewPath}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-(length:--text-nano) font-medium text-amber-700 dark:text-amber-300 shrink-0 hover:bg-amber-500/20 transition-colors",
            className,
          )}
          aria-label={t("zhComponents.message_5642cafa57", { value1: reviewIdentifier, value2: label })}
        >
          <Eye className="h-3 w-3" aria-hidden />
          {hideLabel ? null : <span>{t("under_review")}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-xs">
          <div className="font-semibold">{t("productivity_review_open")}</div>
          <div>
            <span className="text-muted-foreground">{t("trigger")}</span> {label}
          </div>
          {typeof review.noCommentStreak === "number" && review.noCommentStreak > 0 ? (
            <div>
              <span className="text-muted-foreground">{t("no_comment_streak")}</span>{" "}
              {review.noCommentStreak} {t("zhComponents.text_71b3f0bbe7")}
            </div>
          ) : null}
          <div>
            <span className="text-muted-foreground">{t("review_da7e8a")}</span> {reviewIdentifier} ({statusLabel})
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
