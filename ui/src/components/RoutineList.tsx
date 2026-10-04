import { i18n } from "@/i18n";
import { getDisplayLabel } from "@/lib/display-labels";
import type { ReactNode } from "react";
import { MoreHorizontal, Play } from "lucide-react";
import { Link } from "@/lib/router";
import { AgentIcon } from "@/components/AgentIconPicker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useTranslation } from "@/i18n";
import { t } from "@/i18n";

export type RoutineListProjectSummary = {
  name: string;
  color?: string | null;
};

export type RoutineListAgentSummary = {
  name: string;
  icon?: string | null;
};

export type RoutineListRowItem = {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  assigneeAgentId: string | null;
  lastRun?: {
    triggeredAt?: Date | string | null;
    status?: string | null;
  } | null;
};

export function formatLastRunTimestamp(value: Date | string | null | undefined) {
  if (!value) return t("never");
  return new Date(value).toLocaleString(i18n.resolvedLanguage ?? i18n.language);
}

export function formatRoutineRunStatus(value: string | null | undefined) {
  if (!value) return null;
  return value.replaceAll("_", " ");
}

export function nextRoutineStatus(currentStatus: string, enabled: boolean) {
  if (currentStatus === "archived" && enabled) return "active";
  return enabled ? "active" : "paused";
}

export function RoutineListRow<TRoutine extends RoutineListRowItem>({
  routine,
  projectById,
  agentById,
  runningRoutineId,
  statusMutationRoutineId,
  href,
  configureLabel = t("edit"),
  managedByLabel,
  secondaryDetails,
  runNowButton = false,
  disableRunNow = false,
  disableToggle = false,
  hideArchiveAction = false,
  divider = true,
  selected = false,
  selectMode = false,
  extraMenuItems,
  onSelectChange,
  onRunNow,
  onToggleEnabled,
  onToggleArchived,
}: {
  routine: TRoutine;
  projectById: Map<string, RoutineListProjectSummary>;
  agentById: Map<string, RoutineListAgentSummary>;
  runningRoutineId: string | null;
  statusMutationRoutineId: string | null;
  href: string;
  configureLabel?: string;
  managedByLabel?: string | null;
  secondaryDetails?: ReactNode;
  runNowButton?: boolean;
  disableRunNow?: boolean;
  disableToggle?: boolean;
  hideArchiveAction?: boolean;
  /** Render a bottom divider between consecutive rows. Off when the group is its own card. */
  divider?: boolean;
  selected?: boolean;
  selectMode?: boolean;
  extraMenuItems?: ReactNode;
  onSelectChange?: (routine: TRoutine, selected: boolean) => void;
  onRunNow: (routine: TRoutine) => void;
  onToggleEnabled: (routine: TRoutine, enabled: boolean) => void;
  onToggleArchived?: (routine: TRoutine) => void;
}) {
  const { t } = useTranslation();
  const enabled = routine.status === "active";
  const isArchived = routine.status === "archived";
  const isStatusPending = statusMutationRoutineId === routine.id;
  const project = routine.projectId ? projectById.get(routine.projectId) ?? null : null;
  const agent = routine.assigneeAgentId ? agentById.get(routine.assigneeAgentId) ?? null : null;
  const isDraft = !isArchived && !routine.assigneeAgentId;
  const runDisabled = runningRoutineId === routine.id || isArchived || disableRunNow;

  return (
    <Link
      to={href}
      className={`group flex flex-col gap-3 px-3 py-3 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center no-underline text-inherit${
        divider ? " border-b border-border last:border-b-0" : ""
      }`}
    >
      {selectMode ? (
        <div
          className="flex items-start pt-0.5 sm:pt-1"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={selected}
            aria-label={t("zhComponents.message_97494a97c9", { value1: routine.title })}
            onChange={(event) => onSelectChange?.(routine, event.target.checked)}
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{routine.title}</span>
          {(isArchived || routine.status === "paused" || isDraft) ? (
            <span className="text-xs text-muted-foreground">
              {getDisplayLabel(isArchived ? "archived" : isDraft ? "draft" : "paused", "raw")}
            </span>
          ) : null}
          {managedByLabel ? (
            <span className="text-xs text-muted-foreground">{managedByLabel}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: project?.color ?? "var(--project-none)" }}
            />
            <span>{routine.projectId ? (project?.name ?? t("unknown_project")) : t("no_project")}</span>
          </span>
          <span className="flex items-center gap-2">
            {agent?.icon ? <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0" /> : null}
            <span>{routine.assigneeAgentId ? (agent?.name ?? t("unknown_agent")) : t("no_default_agent")}</span>
          </span>
          <span>
            {formatLastRunTimestamp(routine.lastRun?.triggeredAt)}
            {routine.lastRun ? ` · ${formatRoutineRunStatus(routine.lastRun.status)}` : ""}
          </span>
        </div>
        {secondaryDetails ? (
          <div className="text-xs text-muted-foreground">{secondaryDetails}</div>
        ) : null}
      </div>

      <div className="flex items-center gap-3" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        {runNowButton ? (
          <Button
            variant="outline"
            size="sm"
            disabled={runDisabled}
            onClick={() => onRunNow(routine)}
          >
            <Play className="h-3.5 w-3.5" />
            {runningRoutineId === routine.id ? t("running_126eda") : t("run_now")}
          </Button>
        ) : null}

        <div className="flex items-center gap-3">
          <ToggleSwitch
            size="lg"
            checked={enabled}
            onCheckedChange={() => onToggleEnabled(routine, enabled)}
            disabled={isStatusPending || isArchived || disableToggle}
            aria-label={enabled ? t("zhComponents.message_a0b22e61f5", { value1: routine.title }) : t("zhComponents.message_e80c1b2aa4", { value1: routine.title })}
          />
          <span className="w-12 text-xs text-muted-foreground">
            {isArchived ? t("archived") : isDraft ? t("draft") : enabled ? t("on") : t("off")}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("zhComponents.message_906a28203d", { value1: routine.title })}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={href}>{configureLabel}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={runDisabled}
              onClick={() => onRunNow(routine)}
            >
              {runningRoutineId === routine.id ? t("running_126eda") : t("run_now")}
            </DropdownMenuItem>
            {extraMenuItems ? (
              <>
                <DropdownMenuSeparator />
                {extraMenuItems}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggleEnabled(routine, enabled)}
              disabled={isStatusPending || isArchived || disableToggle}
            >
              {enabled ? t("pause") : t("enable")}
            </DropdownMenuItem>
            {!hideArchiveAction && onToggleArchived ? (
              <DropdownMenuItem
                onClick={() => onToggleArchived(routine)}
                disabled={isStatusPending}
              >
                {routine.status === "archived" ? t("restore") : t("archive")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  );
}
