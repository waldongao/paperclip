import { t } from "@/i18n";
import { useMemo, type CSSProperties } from "react";
import { Folder, GitBranch, GitBranchPlus, Monitor } from "lucide-react";
import type { ExecutionWorkspaceSummary } from "@paperclipai/shared";
import { SearchableSelect, type SearchableSelectOption } from "@/components/SearchableSelect";
import { orderReusableExecutionWorkspaces } from "@/lib/reusable-execution-workspaces";

interface WorktreeOption extends SearchableSelectOption {
  mode: string;
  workspaceId?: string;
  description: string;
}

interface ComposerWorktreePickerProps {
  mode: string;
  workspaceId: string;
  workspaces: readonly ExecutionWorkspaceSummary[];
  onChange: (mode: string, workspaceId: string) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  disabled?: boolean;
  mobile?: boolean;
  contentStyle?: CSSProperties;
  selectedWorkspaceLabel?: string;
}

const MODE_OPTIONS: WorktreeOption[] = [
  { key: "isolated_workspace", value: "isolated_workspace", mode: "isolated_workspace", label: t("stability.4f210afedcab", { defaultValue: "New worktree" }), description: t("stability.3bbfcd455bde", { defaultValue: "Start in an isolated checkout." }) },
  { key: "shared_workspace", value: "shared_workspace", mode: "shared_workspace", label: t("project_workspace"), description: t("stability.87c10cff3706", { defaultValue: "Use the project's shared checkout." }) },
  { key: "operator_branch", value: "operator_branch", mode: "operator_branch", label: t("stability.7f445154d634", { defaultValue: "New branch" }), description: t("stability.a18ecefdcca5", { defaultValue: "Create a branch in the project workspace." }) },
  { key: "agent_default", value: "agent_default", mode: "agent_default", label: t("stability.90340504c623", { defaultValue: "Agent default" }), description: t("stability.b26701384135", { defaultValue: "Let the agent choose its workspace." }) },
  { key: "inherit", value: "inherit", mode: "inherit", label: t("project_default"), description: t("stability.6ae5d813ac89", { defaultValue: "Use the project's worktree settings." }) },
];

/** Reuses the searchable selector and the existing workspace recency ordering. */
export function ComposerWorktreePicker({
  mode, workspaceId, workspaces, onChange, loading, error, onRetry,
  disabled, mobile, contentStyle, selectedWorkspaceLabel,
}: ComposerWorktreePickerProps) {
  const groups = useMemo(() => [
    { id: "new", options: [MODE_OPTIONS[0]!] },
    {
      id: "reuse", label: t("stability.b15c650efb5b", { defaultValue: "Reuse a worktree" }),
      options: orderReusableExecutionWorkspaces(workspaces).map((workspace): WorktreeOption => ({
        key: `reuse:${workspace.id}`, value: `reuse:${workspace.id}`,
        workspaceId: workspace.id, mode: "reuse_existing", label: workspace.name,
        description: workspace.branchName ?? "Existing workspace",
        searchText: `${workspace.branchName ?? ""} ${workspace.id}`,
      })),
    },
    {
      id: "other", label: t("stability.2cbe84655eb2", { defaultValue: "Other options" }),
      options: MODE_OPTIONS.filter((option) => option.mode === "shared_workspace"
        || (option.mode !== "isolated_workspace" && option.mode === mode)),
    },
  ], [mode, workspaces]);

  const value = mode === "reuse_existing" ? `reuse:${workspaceId}` : mode;
  return (
    <SearchableSelect<string, WorktreeOption>
      value={value}
      groups={groups}
      onValueChange={(_, option) => onChange(option.mode, option.workspaceId ?? "")}
      placeholder={t("stability.aec2f93d67b7", { defaultValue: "Worktrees" })}
      triggerAriaLabel="Worktrees"
      mobileTitle="Worktrees"
      searchPlaceholder="Search worktrees..."
      emptyMessage={t("stability.220f59569a5b", { defaultValue: "No matching worktrees." })}
      disabled={disabled}
      modal={mobile}
      contentStyle={contentStyle}
      contentWidth="auto"
      className="min-w-0 flex-1 sm:flex-none sm:max-w-72"
      triggerClassName="h-8 gap-1.5 border-0 bg-transparent px-2 text-xs font-medium shadow-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-0"
      renderValue={(option) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            <span className="hidden text-muted-foreground sm:inline">{t("stability.0b4b48f7b678", { defaultValue: "Worktrees ·" })}{" "}</span>
            {option?.label ?? selectedWorkspaceLabel ?? "Select worktree"}
          </span>
        </span>
      )}
      renderOption={(option) => {
        const Icon = option.workspaceId ? GitBranch : option.mode === "isolated_workspace" ? GitBranchPlus
          : option.mode === "agent_default" ? Monitor : option.mode === "operator_branch" ? GitBranch : Folder;
        return (
          <>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{option.label}</span>
              <span className="truncate text-xs text-muted-foreground">{option.description}</span>
            </span>
          </>
        );
      }}
      listFooter={loading || error || workspaces.length === 0 ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground" role="status">
          {loading ? "Loading existing worktrees…" : error ? (
            <span className="flex items-center justify-between gap-2">{t("stability.33ebd59042eb", { defaultValue: "Couldn't load worktrees." })}<button type="button" className="rounded px-2 py-1 text-foreground hover:bg-accent" onClick={onRetry}>{t("common.retry")}</button>
            </span>
          ) : "No existing worktrees yet. Choose New worktree to start one."}
        </div>
      ) : undefined}
    />
  );
}
