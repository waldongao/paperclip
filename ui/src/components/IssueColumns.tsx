import type { ReactNode } from "react";
import { deriveOriginatingActor, type Issue } from "@paperclipai/shared";
import { Columns3 } from "lucide-react";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAssigneeUserLabel } from "../lib/assignees";
import type { InboxIssueColumn } from "../lib/inbox";
import { cn } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { Identity } from "./Identity";
import { StatusIcon } from "./StatusIcon";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import { t } from "@/i18n";

export const issueTrailingColumns: InboxIssueColumn[] = ["assignee", "kickedOffBy", "project", "workspace", "parent", "labels", "updated"];

const issueColumnLabels: Record<InboxIssueColumn, string> = {
  status: t("status"),
  id: "ID",
  assignee: t("responsible"),
  kickedOffBy: t("kicked_off_by_68bebf"),
  project: t("project"),
  workspace: t("workspace"),
  parent: t("parent_task"),
  labels: t("tags"),
  updated: t("last_updated"),
};

const issueColumnDescriptions: Record<InboxIssueColumn, string> = {
  status: t("task_state_chip_on_the_left_edge"),
  id: t("ticket_identifier_like_pap_1009"),
  assignee: t("responsible_agent_or_board_user"),
  kickedOffBy: t("board_user_or_agent_who_created_the_task"),
  project: t("linked_project_pill_with_its_color"),
  workspace: t("execution_or_project_workspace_used_for_the_task"),
  parent: t("parent_task_identifier_and_title"),
  labels: t("task_labels_and_tags"),
  updated: t("latest_visible_activity_time"),
};

export function issueColumnDescription(
  column: InboxIssueColumn,
  presentation: "legacy" | "task" = "legacy",
): string {
  if (column === "id" && presentation === "task") {
    return t("task_identifier_like_pap_1009_on_the_trailing_ed");
  }
  if (column === "status" && presentation === "task") {
    return t("task_state_icon_on_the_leading_edge");
  }
  return issueColumnDescriptions[column];
}

export function issueActivityTimestamp(issue: Issue): string {
  return timeAgo(issue.lastActivityAt ?? issue.lastExternalCommentAt ?? issue.updatedAt);
}

export function issueActivityText(issue: Issue): string {
  return t("zhComponents.message_918dc39f9f", { value1: issueActivityTimestamp(issue) });
}

function issueTrailingGridTemplate(columns: InboxIssueColumn[]): string {
  return columns
    .map((column) => {
      if (column === "assignee") return t("minmax_6rem_8rem");
      if (column === "kickedOffBy") return t("minmax_6rem_8rem");
      if (column === "project") return t("minmax_4_5rem_7rem");
      if (column === "workspace") return t("minmax_6rem_9rem");
      if (column === "parent") return t("minmax_3_5rem_5_5rem");
      if (column === "labels") return t("minmax_3rem_6rem");
      return t("minmax_3_5rem_4_5rem");
    })
    .join(" ");
}

export function IssueColumnPicker({
  availableColumns,
  visibleColumnSet,
  onToggleColumn,
  showDateGroupSeparators,
  onToggleDateGroupSeparators,
  onResetColumns,
  title,
  iconOnly = false,
  rowPresentation = "legacy",
}: {
  availableColumns: InboxIssueColumn[];
  visibleColumnSet: ReadonlySet<InboxIssueColumn>;
  onToggleColumn: (column: InboxIssueColumn, enabled: boolean) => void;
  showDateGroupSeparators?: boolean;
  onToggleDateGroupSeparators?: (enabled: boolean) => void;
  onResetColumns: () => void;
  title: string;
  iconOnly?: boolean;
  rowPresentation?: "legacy" | "task";
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={iconOnly ? "outline" : "ghost"}
          size={iconOnly ? "icon" : "sm"}
          className={iconOnly ? "h-8 w-8 shrink-0" : "hidden h-8 shrink-0 px-2 text-xs sm:inline-flex"}
          title={t("columns")}
        >
          <Columns3 className={iconOnly ? "h-3.5 w-3.5" : "mr-1 h-3.5 w-3.5"} />
          {!iconOnly && t("columns")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-(--sz-300px) rounded-xl border-border/70 p-1.5 shadow-xl shadow-black/10">
        <DropdownMenuLabel className="px-2 pb-1 pt-1.5">
          <div className="space-y-1">
            <div className="text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
              {t("desktop_task_rows")}
            </div>
            <div className="text-sm font-medium text-foreground">
              {title}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={visibleColumnSet.has(column)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onToggleColumn(column, checked === true)}
            className="items-start rounded-lg px-3 py-2.5 pl-8"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {issueColumnLabels[column]}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {issueColumnDescription(column, rowPresentation)}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {showDateGroupSeparators !== undefined && onToggleDateGroupSeparators ? (
          <DropdownMenuCheckboxItem
            checked={showDateGroupSeparators}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onToggleDateGroupSeparators(checked === true)}
            className="items-start rounded-lg px-3 py-2.5 pl-8"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {t("date_group_separators")}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("show_today_yesterday_and_earlier_rules_on_newest")}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onResetColumns}
          className="rounded-lg px-3 py-2 text-sm"
        >
          {t("reset_defaults")}
          <span className="ml-auto text-xs text-muted-foreground">{t("status_id_updated")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InboxIssueMetaLeading({
  issue,
  isLive,
  subtreeLiveCount = 0,
  showSubtreeLiveChip = true,
  showStatus = true,
  showIdentifier = true,
  statusSlot,
  checklistStepNumber = null,
}: {
  issue: Issue;
  isLive: boolean;
  subtreeLiveCount?: number;
  showSubtreeLiveChip?: boolean;
  showStatus?: boolean;
  showIdentifier?: boolean;
  statusSlot?: ReactNode;
  checklistStepNumber?: number | string | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      {showStatus ? (
        <span className="hidden shrink-0 items-center sm:inline-flex">
          {statusSlot ?? <StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} />}
        </span>
      ) : null}
      {checklistStepNumber !== null ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground" aria-hidden="true">
          {checklistStepNumber}.
        </span>
      ) : null}
      {showIdentifier ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {issue.identifier ?? issue.id.slice(0, 8)}
        </span>
      ) : null}
      {isLive && (
        <Badge variant="ghost"
          className={cn(
            "px-1.5 sm:gap-1.5 sm:px-2",
            "bg-blue-500/10",
          )}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" />
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                "bg-blue-500",
              )}
            />
          </span>
          <span
            className={cn(
              "hidden text-(length:--text-micro) font-medium sm:inline",
              "text-blue-600 dark:text-blue-400",
            )}
          >
            {t("live")}
          </span>
        </Badge>
      )}
      {showSubtreeLiveChip && !isLive && subtreeLiveCount > 0 && (
        <Badge variant="outline"
          className={cn(
            "px-1.5 sm:gap-1.5 sm:px-2",
            "border-border bg-transparent",
          )}
          title={t("zhComponents.message_663923e0c4", { count: subtreeLiveCount, value1: subtreeLiveCount })}
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full border",
              "border-muted-foreground/60 bg-transparent",
            )}
            aria-hidden="true"
          />
          <span className="hidden text-(length:--text-micro) font-medium text-muted-foreground sm:inline">
            {subtreeLiveCount} {t("live_below")}
          </span>
        </Badge>
      )}
    </>
  );
}

export function InboxIssueTrailingColumns({
  issue,
  columns,
  projectName,
  projectColor,
  workspaceId,
  workspaceName,
  assigneeName,
  assigneeUserName,
  assigneeUserAvatarUrl,
  creatorAgentName,
  creatorUserName,
  creatorUserAvatarUrl,
  viaAgentName,
  currentUserId,
  parentIdentifier,
  parentTitle,
  assigneeContent,
  onFilterWorkspace,
}: {
  issue: Issue;
  columns: InboxIssueColumn[];
  projectName: string | null;
  projectColor: string | null;
  workspaceId?: string | null;
  workspaceName: string | null;
  assigneeName: string | null;
  assigneeUserName?: string | null;
  assigneeUserAvatarUrl?: string | null;
  creatorAgentName?: string | null;
  creatorUserName?: string | null;
  creatorUserAvatarUrl?: string | null;
  viaAgentName?: string | null;
  currentUserId: string | null;
  parentIdentifier: string | null;
  parentTitle: string | null;
  assigneeContent?: ReactNode;
  onFilterWorkspace?: (workspaceId: string) => void;
}) {
  const { t } = useTranslation();
  const activityText = issueActivityTimestamp(issue);
  const userLabel = assigneeUserName ?? formatAssigneeUserLabel(issue.assigneeUserId, currentUserId) ?? t("user");
  const originatingActor = deriveOriginatingActor(issue);
  const originatingUserId = originatingActor?.kind === "user" ? originatingActor.id : null;
  const creatorUserLabel = creatorUserName ?? formatAssigneeUserLabel(originatingUserId, currentUserId) ?? t("user");

  return (
    <span
      className="grid items-center gap-2"
      style={{ gridTemplateColumns: issueTrailingGridTemplate(columns) }}
    >
      {columns.map((column) => {
        if (column === "assignee") {
          if (assigneeContent) {
            return <span key={column} className="min-w-0">{assigneeContent}</span>;
          }

          if (issue.assigneeAgentId) {
            return (
              <span key={column} className="min-w-0 text-xs text-foreground">
                <Identity
                  name={assigneeName ?? issue.assigneeAgentId.slice(0, 8)}
                  size="sm"
                  shape="square"
                  className="min-w-0"
                />
              </span>
            );
          }

          if (issue.assigneeUserId) {
            return (
              <span key={column} className="min-w-0 text-xs text-foreground">
                <Identity
                  name={userLabel}
                  avatarUrl={assigneeUserAvatarUrl}
                  size="sm"
                  className="min-w-0"
                />
              </span>
            );
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground">
              {t("unassigned")}
            </span>
          );
        }

        if (column === "kickedOffBy") {
          if (originatingActor?.kind === "agent") {
            const name = creatorAgentName ?? originatingActor.id.slice(0, 8);
            return (
              <Tooltip key={column}>
                <TooltipTrigger asChild>
                  <span className="min-w-0 text-xs text-foreground">
                    <Identity
                      name={name}
                      size="sm"
                      shape="square"
                      className="min-w-0"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{name}</TooltipContent>
              </Tooltip>
            );
          }

          if (originatingActor?.kind === "user") {
            const tooltipText = viaAgentName ? t("zhComponents.message_012e7f8c3d", { value1: creatorUserLabel, value2: viaAgentName }) : creatorUserLabel;
            return (
              <Tooltip key={column}>
                <TooltipTrigger asChild>
                  <span className="min-w-0 text-xs text-foreground">
                    <Identity
                      name={creatorUserLabel}
                      avatarUrl={creatorUserAvatarUrl}
                      size="sm"
                      className="min-w-0"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{tooltipText}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground">
              {t("unknown")}
            </span>
          );
        }

        if (column === "project") {
          if (projectName) {
            // token-extraction: allowlisted — accentColor also feeds pickTextColorForPillBg() contrast math; a var() string can't be parsed as a hex color there.
            const accentColor = projectColor ?? "#64748b";
            return (
              <span
                key={column}
                className="inline-flex min-w-0 items-center gap-2 text-xs font-medium"
                style={{ color: pickTextColorForPillBg(accentColor, 0.12) }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="truncate">{projectName}</span>
              </span>
            );
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground">
              {t("no_project")}
            </span>
          );
        }

        if (column === "labels") {
          if ((issue.labels ?? []).length > 0) {
            return (
              <span key={column} className="flex min-w-0 items-center gap-1 overflow-hidden">
                {(issue.labels ?? []).slice(0, 2).map((label) => (
                  <Badge variant="outline"
                    key={label.id}
                    className="min-w-0 max-w-full px-1.5 py-0 text-(length:--text-nano)"
                    style={{
                      borderColor: label.color,
                      color: pickTextColorForPillBg(label.color, 0.12),
                      backgroundColor: `${label.color}1f`,
                    }}
                  >
                    <span className="truncate">{label.name}</span>
                  </Badge>
                ))}
                {(issue.labels ?? []).length > 2 ? (
                  <span className="shrink-0 text-(length:--text-nano) font-medium text-muted-foreground">
                    +{(issue.labels ?? []).length - 2}
                  </span>
                ) : null}
              </span>
            );
          }

          return <span key={column} className="min-w-0" aria-hidden="true" />;
        }

        if (column === "workspace") {
          if (!workspaceName) {
            return <span key={column} className="min-w-0" aria-hidden="true" />;
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground">
              {workspaceId && onFilterWorkspace ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="truncate rounded-sm text-left text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onFilterWorkspace(workspaceId);
                      }}
                    >
                      {workspaceName}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    {t("filter_by_workspace")}
                  </TooltipContent>
                </Tooltip>
              ) : (
                workspaceName
              )}
            </span>
          );
        }

        if (column === "parent") {
          if (!issue.parentId) {
            return <span key={column} className="min-w-0" aria-hidden="true" />;
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground" title={parentTitle ?? undefined}>
              {parentIdentifier ? (
                <span className="font-mono">{parentIdentifier}</span>
              ) : (
                <span className="italic">{t("sub_task")}</span>
              )}
            </span>
          );
        }

        if (column === "updated") {
          return (
            <span key={column} className="min-w-0 truncate text-right text-(length:--text-micro) font-medium text-muted-foreground">
              {activityText}
            </span>
          );
        }

        return null;
      })}
    </span>
  );
}
