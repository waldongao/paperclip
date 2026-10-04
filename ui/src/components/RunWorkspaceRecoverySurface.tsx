import { t } from "@/i18n";
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HeartbeatRun } from "@paperclipai/shared";
import { useNavigate } from "@/lib/router";
import { issuesApi } from "../api/issues";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { accessApi } from "../api/access";
import { queryKeys } from "../lib/queryKeys";
import { useToastActions } from "../context/ToastContext";
import {
  IssueRecoveryActionCard,
  type RecoveryReissueRequest,
  type RecoveryResolveOutcome,
} from "./IssueRecoveryActionCard";
import {
  canBoardManageRuntime,
  readRecoveryReconcileWorkspaceId,
} from "../lib/recovery-reconcile";
import { useTranslation } from "@/i18n";

/** The run errorCode Paperclip stamps when it declines a run over a git workspace it can't validate. */
export const WORKSPACE_VALIDATION_RUN_ERROR_CODE = "workspace_validation_failed";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads the source issue id a failed run was working when it was declined over workspace validation.
 * The run's context snapshot pins the issue the recovery action lives on.
 */
function readRunIssueId(run: HeartbeatRun): string | null {
  const context = asRecord(run.contextSnapshot);
  if (!context) return null;
  return asNonEmptyString(context.issueId);
}

/**
 * Run-page recovery surface. When a run *failed* with workspace-validation evidence, this fetches
 * the source issue's active recovery action and renders the same `IssueRecoveryActionCard`
 * (compact) that `IssueDetail` shows — wired to the same reconcile-forward / repair / re-issue /
 * break-glass / resolve handlers — so the divergence can be resolved from the run view directly.
 *
 * Renders nothing unless the run is a workspace-validation failure whose source issue still carries
 * a live `workspace_validation` recovery action.
 */
export function RunWorkspaceRecoverySurface({ run }: { run: HeartbeatRun }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const isWorkspaceValidationFailure =
    run.status === "failed" && run.errorCode === WORKSPACE_VALIDATION_RUN_ERROR_CODE;
  const issueId = readRunIssueId(run);

  const { data: issue } = useQuery({
    queryKey: queryKeys.issues.detail(issueId ?? "__none__"),
    queryFn: () => issuesApi.get(issueId!),
    enabled: Boolean(isWorkspaceValidationFailure && issueId),
  });

  const { data: boardAccess } = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    enabled: Boolean(isWorkspaceValidationFailure && issueId),
    retry: false,
  });

  const recoveryAction = issue?.activeRecoveryAction ?? null;
  const canManageBoardRuntime = canBoardManageRuntime(run.companyId, boardAccess);
  // Prefer the workspace pinned by the recovery action's evidence (the workspace that actually
  // diverged) over the page-level id, which can drift after a re-issue rebinds the issue.
  const reconcileWorkspaceId =
    readRecoveryReconcileWorkspaceId(recoveryAction) ?? issue?.executionWorkspaceId ?? null;

  const invalidate = useCallback(() => {
    if (issueId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.runIssues(run.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.runDetail(run.id) });
  }, [issueId, queryClient, run.id]);

  const reconcile = useMutation({
    mutationFn: (
      input:
        | { workspaceId: string; mode: "forward" }
        | { workspaceId: string; mode: "override"; reason: string }
        | { workspaceId: string; mode: "quarantine_restore" },
    ) => {
      const { workspaceId, ...body } = input;
      return executionWorkspacesApi.reconcile(workspaceId, body);
    },
    onSuccess: (_result, variables) => {
      invalidate();
      pushToast(
        variables.mode === "quarantine_restore"
          ? {
              title: t("workspace_repaired"),
              body: t("dirty_changes_were_quarantined_onto_a_rescue_bra"),
              tone: "success",
            }
          : {
              title: t("workspace_branch_reconciled"),
              body: t("the_recorded_branch_now_matches_the_live_branch"),
              tone: "success",
            },
      );
    },
    onError: (err) => {
      pushToast({
        title: t("reconcile_failed"),
        body: err instanceof Error ? err.message : t("unable_to_reconcile_the_workspace_branch"),
        tone: "error",
      });
    },
  });

  const reissue = useMutation({
    mutationFn: async (request: RecoveryReissueRequest) => {
      if (!issue) throw new Error(t("task_is_not_loaded_yet"));
      const sourceLabel = issue.identifier ?? t("the_stalled_task");
      const descriptionLines = [
        t("zhComponents.message_f708d71f83", { value1: sourceLabel }),
        "",
        t("zhComponents.message_f5b6cb9abd", { value1: request.baseRef }),
        ...(request.expectedBranch ? [t("zhComponents.message_180fd5286b", { value1: request.expectedBranch })] : []),
        "",
        "---",
        "",
        issue.description ?? "",
      ];
      return issuesApi.create(issue.companyId, {
        title: t("zhComponents.message_37a50d0f97", { value1: issue.title ?? sourceLabel }),
        description: descriptionLines.join("\n"),
        priority: issue.priority,
        projectId: issue.projectId ?? null,
        parentId: issue.parentId ?? null,
        assigneeAgentId:
          recoveryAction?.returnOwnerAgentId ??
          recoveryAction?.previousOwnerAgentId ??
          issue.assigneeAgentId ??
          null,
        executionWorkspacePreference: "isolated_workspace",
        executionWorkspaceSettings: {
          mode: "isolated_workspace",
          workspaceStrategy: { type: "git_worktree", baseRef: request.baseRef },
        },
      });
    },
    onSuccess: (created) => {
      invalidate();
      pushToast({
        title: t("isolated_re_issue_created"),
        body: created.identifier
          ? t("zhComponents.message_0d5786c5fe", { value1: created.identifier })
          : t("a_fresh_isolated_re_issue_was_created"),
        tone: "success",
      });
      if (created.identifier) {
        navigate(`/issues/${created.identifier}`);
      }
    },
    onError: (err) => {
      pushToast({
        title: t("re_issue_failed"),
        body: err instanceof Error ? err.message : t("unable_to_create_an_isolated_re_issue"),
        tone: "error",
      });
    },
  });

  const resolve = useMutation({
    mutationFn: (data: {
      outcome: "restored" | "false_positive";
      sourceIssueStatus: "todo" | "done" | "in_review";
    }) => {
      if (!issueId || !recoveryAction) throw new Error(t("no_recovery_action_to_resolve"));
      return issuesApi.resolveRecoveryAction(issueId, {
        actionId: recoveryAction.id,
        outcome: data.outcome,
        sourceIssueStatus: data.sourceIssueStatus,
      });
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => {
      pushToast({
        title: t("recovery_resolution_failed"),
        body: err instanceof Error ? err.message : t("unable_to_resolve_recovery_action"),
        tone: "error",
      });
    },
  });

  const handleReconcileForward = useCallback(() => {
    if (!reconcileWorkspaceId) return;
    void reconcile.mutateAsync({ workspaceId: reconcileWorkspaceId, mode: "forward" });
  }, [reconcile, reconcileWorkspaceId]);

  const handleBreakGlass = useCallback(
    (reason: string) => {
      if (!reconcileWorkspaceId) return;
      void reconcile.mutateAsync({ workspaceId: reconcileWorkspaceId, mode: "override", reason });
    },
    [reconcile, reconcileWorkspaceId],
  );

  const handleQuarantineRestore = useCallback(() => {
    if (!reconcileWorkspaceId) return;
    void reconcile.mutateAsync({ workspaceId: reconcileWorkspaceId, mode: "quarantine_restore" });
  }, [reconcile, reconcileWorkspaceId]);

  const handleReissue = useCallback(
    (request: RecoveryReissueRequest) => {
      void reissue.mutateAsync(request);
    },
    [reissue],
  );

  const handleResolve = useCallback(
    (outcome: RecoveryResolveOutcome) => {
      switch (outcome) {
        case "todo":
          void resolve.mutateAsync({ outcome: "restored", sourceIssueStatus: "todo" });
          return;
        case "done":
          void resolve.mutateAsync({ outcome: "restored", sourceIssueStatus: "done" });
          return;
        case "in_review":
          void resolve.mutateAsync({ outcome: "restored", sourceIssueStatus: "in_review" });
          return;
        case "false_positive_done":
          void resolve.mutateAsync({ outcome: "false_positive", sourceIssueStatus: "done" });
          return;
        case "false_positive_in_review":
          void resolve.mutateAsync({ outcome: "false_positive", sourceIssueStatus: "in_review" });
          return;
      }
    },
    [resolve],
  );

  if (!isWorkspaceValidationFailure || !issueId) return null;
  if (!recoveryAction || recoveryAction.kind !== "workspace_validation") return null;

  return (
    <div className="space-y-2" data-testid="run-workspace-recovery-surface">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("workspace_recovery")}</span>
        {issue?.identifier ? (
          <a
            href={`/issues/${issue.identifier}`}
            className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={(event) => {
              event.preventDefault();
              navigate(`/issues/${issue.identifier}`);
            }}
          >
            {issue.identifier}
          </a>
        ) : null}
      </div>
      <IssueRecoveryActionCard
        action={recoveryAction}
        variant="compact"
        onResolve={handleResolve}
        onReissueIsolated={handleReissue}
        reissuePending={reissue.isPending}
        onReconcileForward={handleReconcileForward}
        onBreakGlassOverride={handleBreakGlass}
        onQuarantineRestore={handleQuarantineRestore}
        quarantineRestorePending={reconcile.isPending}
        reconcilePending={reconcile.isPending}
        canBreakGlass={canManageBoardRuntime}
      />
    </div>
  );
}

export default RunWorkspaceRecoverySurface;
