import { getDisplayLabel } from "@/lib/display-labels";
import { useMemo } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  buildReusableExecutionWorkspaceOptionGroups,
  reusableWorkspaceOptionMatches,
  scoreReusableWorkspaceOptionMatch,
  type ReusableExecutionWorkspaceLike,
  type ReusableWorkspaceOption,
} from "@/lib/reusable-execution-workspaces";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";
import { t } from "@/i18n";

const COMPACT_TRIGGER_CLASS = "h-8 px-2 py-1.5 text-xs font-normal";

interface ReusableExecutionWorkspaceSelectProps<TWorkspace extends ReusableExecutionWorkspaceLike> {
  value: string;
  workspaces: readonly TWorkspace[];
  onValueChange: (workspaceId: string, option: ReusableWorkspaceOption<TWorkspace>) => void;
  placeholder?: string;
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  disablePortal?: boolean;
}

export function ReusableExecutionWorkspaceSelect<TWorkspace extends ReusableExecutionWorkspaceLike>({
  value,
  workspaces,
  onValueChange,
  placeholder = t("choose_an_existing_workspace"),
  loading = false,
  error = false,
  disabled = false,
  className,
  triggerClassName,
  disablePortal,
}: ReusableExecutionWorkspaceSelectProps<TWorkspace>) {
  const { t } = useTranslation();
  const groups = useMemo(() => buildReusableExecutionWorkspaceOptionGroups(workspaces), [workspaces]);

  return (
    <SearchableSelect<string, ReusableWorkspaceOption<TWorkspace>>
      value={value}
      groups={groups}
      onValueChange={onValueChange}
      placeholder={placeholder}
      searchPlaceholder={t("search_workspaces")}
      emptyMessage={error ? t("workspaces_failed_to_load") : t("no_matching_workspaces")}
      loadingMessage={t("loading_workspaces")}
      loading={loading}
      disabled={disabled}
      className={className}
      triggerClassName={cn(COMPACT_TRIGGER_CLASS, triggerClassName)}
      filterOption={reusableWorkspaceOptionMatches}
      scoreOption={scoreReusableWorkspaceOptionMatch}
      disablePortal={disablePortal}
      renderOption={(option, { selected }) => (
        <span className="flex min-w-0 flex-col">
          <span className={cn("truncate", selected && "font-medium")}>{option.label}</span>
          <span className="truncate text-(length:--text-micro) text-muted-foreground">
            {option.workspace.status ? `${getDisplayLabel(option.workspace.status, "raw")} - ` : ""}
            {option.description}
          </span>
        </span>
      )}
    />
  );
}
