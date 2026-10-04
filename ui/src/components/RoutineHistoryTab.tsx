import { getCountNoun } from "@/components/localized-count";
import { getDisplayLabel } from "@/lib/display-labels";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History as HistoryIcon, RotateCcw, Search } from "lucide-react";
import type {
  CompanySecret,
  EnvBinding,
  EnvSecretRefBinding,
  Routine,
  RoutineEnvConfig,
  RoutineRevision,
  RoutineRevisionSnapshotTriggerV1,
  RoutineVariable,
  SecretVersionSelector,
} from "@paperclipai/shared";
import {
  routinesApi,
  type RestoreRoutineRevisionResponse,
} from "../api/routines";
import { ApiError } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { buildLineDiff, type DiffRow } from "../lib/line-diff";
import { relativeTime } from "../lib/utils";
import { useToastActions } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";
import { MarkdownBody } from "./MarkdownBody";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import { t } from "@/i18n";
import { catchUpPolicyLabel, concurrencyPolicyLabel } from "../lib/routine-policy-labels";

type AgentLookup = Map<string, { id: string; name: string }>;
type ProjectLookup = Map<string, { id: string; name: string }>;
type SecretLookup = Map<string, CompanySecret>;

type DirtyFieldDescriptor = {
  key: string;
  label: string;
};

type Props = {
  routine: Routine;
  isEditDirty: boolean;
  dirtyFields: DirtyFieldDescriptor[];
  onDiscardEdits: () => void;
  onSaveEdits: () => void;
  agents: AgentLookup;
  projects: ProjectLookup;
  secrets?: CompanySecret[];
  onRestoreSecretMaterials: (response: RestoreRoutineRevisionResponse) => void;
  onRestored?: (response: RestoreRoutineRevisionResponse) => void;
};

export function RoutineHistoryTab({
  routine,
  isEditDirty,
  dirtyFields,
  onDiscardEdits,
  onSaveEdits,
  agents,
  projects,
  secrets,
  onRestoreSecretMaterials,
  onRestored,
}: Props) {
  const { t } = useTranslation();
  const secretLookup = useMemo<SecretLookup>(
    () => new Map((secrets ?? []).map((secret) => [secret.id, secret])),
    [secrets],
  );
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [highlightedRevisionId, setHighlightedRevisionId] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState("");

  const revisionsQuery = useQuery({
    queryKey: queryKeys.routines.revisions(routine.id),
    queryFn: () => routinesApi.listRevisions(routine.id),
  });

  const revisions = useMemo(() => revisionsQuery.data ?? [], [revisionsQuery.data]);
  const sortedRevisions = useMemo(
    () => [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber),
    [revisions],
  );
  const currentRevision = useMemo(
    () => sortedRevisions.find((r) => r.id === routine.latestRevisionId) ?? sortedRevisions[0] ?? null,
    [sortedRevisions, routine.latestRevisionId],
  );

  useEffect(() => {
    if (selectedRevisionId === null && currentRevision) {
      setSelectedRevisionId(currentRevision.id);
    }
  }, [currentRevision, selectedRevisionId]);

  const selectedRevision = useMemo(
    () => sortedRevisions.find((r) => r.id === selectedRevisionId) ?? null,
    [sortedRevisions, selectedRevisionId],
  );
  const isHistoricalSelected = !!selectedRevision && selectedRevision.id !== routine.latestRevisionId;
  const visibleRevisions = useMemo(() => {
    if (showOlder || sortedRevisions.length <= 8) return sortedRevisions;
    return sortedRevisions.slice(0, 8);
  }, [sortedRevisions, showOlder]);

  const restoreMutation = useMutation({
    mutationFn: (input: { revisionId: string; changeSummary: string }) =>
      routinesApi.restoreRevision(routine.id, input.revisionId, {
        changeSummary: input.changeSummary.trim() || null,
      }),
    onSuccess: async (data) => {
      const restoredFromNumber = data.restoredFromRevisionNumber;
      const newNumber = data.revision.revisionNumber;
      pushToast({
        title: t("zhComponents.message_8ed8e139b3", { value1: restoredFromNumber, value2: newNumber }),
        body: data.secretMaterials.length > 0
          ? t("trigger_enabled_state_was_restored_from_the_snap")
          : t("trigger_enabled_state_was_restored_from_the_snap_168c7d"),
        tone: "success",
      });
      onRestoreSecretMaterials(data);
      onRestored?.(data);
      setConfirmOpen(false);
      setRestoreSummary("");
      setSelectedRevisionId(data.revision.id);
      setHighlightedRevisionId(data.revision.id);
      window.setTimeout(() => {
        setHighlightedRevisionId((current) =>
          current === data.revision.id ? null : current,
        );
      }, 3000);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routine.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.runs(routine.id) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.routines.activity(routine.companyId, routine.id),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(routine.companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.revisions(routine.id) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_restore_revision"),
        body: error instanceof Error ? error.message : t("paperclip_could_not_restore_the_revision"),
        tone: "error",
      });
    },
  });

  const handleSelectRevision = (revisionId: string) => {
    if (isEditDirty) return;
    setSelectedRevisionId(revisionId);
  };

  const handleReturnToCurrent = () => {
    if (currentRevision) setSelectedRevisionId(currentRevision.id);
  };

  const openRestoreConfirm = () => {
    if (!selectedRevision || !isHistoricalSelected) return;
    setRestoreSummary("");
    setConfirmOpen(true);
  };

  const confirmRestore = () => {
    if (!selectedRevision) return;
    restoreMutation.mutate({
      revisionId: selectedRevision.id,
      changeSummary: restoreSummary,
    });
  };

  if (revisionsQuery.isLoading) {
    return (
      <div className="grid gap-5 md:grid-cols-(--gtc-9)">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-10 w-full" />
          ))}
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (revisionsQuery.error) {
    return (
      <div className="rounded-md border border-l-2 border-l-destructive border-border p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">{t("could_not_load_revisions_0e7ba0")}</p>
          <p className="text-xs text-muted-foreground">
            {revisionsQuery.error instanceof Error
              ? revisionsQuery.error.message
              : t("unknown_error_loading_revisions")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => revisionsQuery.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const onlyBootstrapRevision = revisions.length <= 1;

  return (
    <div className="grid gap-5 md:grid-cols-(--gtc-9)">
      <RevisionList
        revisions={visibleRevisions}
        latestRevisionId={routine.latestRevisionId}
        selectedRevisionId={selectedRevisionId}
        highlightedRevisionId={highlightedRevisionId}
        isEditDirty={isEditDirty}
        totalRevisions={sortedRevisions.length}
        onSelect={handleSelectRevision}
        onShowOlder={() => setShowOlder(true)}
        showOlder={showOlder}
      />
      <div className="space-y-4 min-w-0">
        {isEditDirty && (
          <ConflictBanner
            dirtyFields={dirtyFields}
            onDiscard={onDiscardEdits}
            onSave={onSaveEdits}
          />
        )}
        {!isEditDirty && onlyBootstrapRevision ? (
          <div className="space-y-2">
            <EmptyState
              icon={HistoryIcon}
              message={t("no_edits_yet")}
            />
            <p className="text-center text-xs text-muted-foreground">
              {t("revision_1_is_the_only_history_this_routine_has")}
            </p>
          </div>
        ) : (
          selectedRevision && (
            <>
              {isHistoricalSelected && currentRevision && (
                <HistoricalPreviewBanner
                  revisionNumber={selectedRevision.revisionNumber}
                  nextRevisionNumber={currentRevision.revisionNumber + 1}
                  onReturn={handleReturnToCurrent}
                  onRestore={openRestoreConfirm}
                  pending={restoreMutation.isPending}
                />
              )}
              <RevisionPreview
                revision={selectedRevision}
                currentRevision={currentRevision}
                isHistorical={isHistoricalSelected}
                agents={agents}
                projects={projects}
                onCompare={() => setDiffOpen(true)}
                onRestore={openRestoreConfirm}
                restorePending={restoreMutation.isPending}
                highlighted={highlightedRevisionId === selectedRevision.id}
              />
            </>
          )
        )}
      </div>

      {selectedRevision && currentRevision && (
        <RestoreConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          target={selectedRevision}
          currentRevisionNumber={currentRevision.revisionNumber}
          changeSummary={restoreSummary}
          onChangeSummaryChange={setRestoreSummary}
          onConfirm={confirmRestore}
          pending={restoreMutation.isPending}
          recreatedWebhookLabels={collectWebhookTriggerDifferences(
            selectedRevision,
            currentRevision,
          )}
          envDiffCounts={summarizeEnvDiffCounts(
            currentRevision.snapshot.routine.env ?? null,
            selectedRevision.snapshot.routine.env ?? null,
          )}
        />
      )}

      {currentRevision && selectedRevision && (
        <RoutineRevisionDiffModal
          open={diffOpen}
          onOpenChange={setDiffOpen}
          revisions={sortedRevisions}
          initialOldRevisionId={selectedRevision.id}
          initialNewRevisionId={currentRevision.id}
          agents={agents}
          projects={projects}
          secrets={secretLookup}
          onRestore={(rev) => {
            setSelectedRevisionId(rev.id);
            setDiffOpen(false);
            setRestoreSummary("");
            setConfirmOpen(true);
          }}
        />
      )}
    </div>
  );
}

function HistoricalPreviewBanner({
  revisionNumber,
  nextRevisionNumber,
  onReturn,
  onRestore,
  pending,
}: {
  revisionNumber: number;
  nextRevisionNumber: number;
  onReturn: () => void;
  onRestore: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t("viewing_revision")} {revisionNumber} {t("read_only")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("restoring_this_revision_creates_a_new_revision")} {nextRevisionNumber} {t("with_the_same_content_history_stays_append_only")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onReturn} disabled={pending}>
            {t("return_to_current")}
          </Button>
          <Button size="sm" onClick={onRestore} disabled={pending}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t("restore_as_new_revision")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConflictBanner({
  dirtyFields,
  onDiscard,
  onSave,
}: {
  dirtyFields: DirtyFieldDescriptor[];
  onDiscard: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const labels = dirtyFields.length > 0
    ? dirtyFields.map((field) => field.label)
    : [t("the_routine")];
  const fieldsText = formatDirtyFieldList(labels);
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t("unsaved_routine_edits")}</p>
          <p className="text-xs text-muted-foreground">
            {t("you_changed")} {fieldsText} {t("but_havent_saved_yet_save_or_discard_before_prev")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDiscard}>
            {t("discard_changes")}
          </Button>
          <Button size="sm" onClick={onSave}>
            {t("save_and_continue")}
          </Button>
        </div>
      </div>
      {dirtyFields.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {dirtyFields.map((field) => (
            <li key={field.key} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              {field.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevisionList({
  revisions,
  latestRevisionId,
  selectedRevisionId,
  highlightedRevisionId,
  isEditDirty,
  totalRevisions,
  onSelect,
  onShowOlder,
  showOlder,
}: {
  revisions: RoutineRevision[];
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  highlightedRevisionId: string | null;
  isEditDirty: boolean;
  totalRevisions: number;
  onSelect: (revisionId: string) => void;
  onShowOlder: () => void;
  showOlder: boolean;
}) {
  const { t } = useTranslation();
  return (
    <aside className="space-y-1">
      <header className="flex items-center justify-between pb-2">
        <p className="text-xs font-medium uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("revisions")}
        </p>
        <span className="text-(length:--text-micro) text-muted-foreground">{totalRevisions} {t("zhComponents.text_5a537e2091")}</span>
      </header>
      {revisions.map((revision) => {
        const isSelected = revision.id === selectedRevisionId;
        const isCurrent = revision.id === latestRevisionId;
        const isHistorical = !isCurrent;
        const isHighlighted = revision.id === highlightedRevisionId;
        const blockedByEdits = isEditDirty && isHistorical;
        const baseClass = "w-full rounded-md border px-3 py-2 text-left transition-colors";
        const stateClass = isHighlighted
          ? "border-emerald-500/40 bg-emerald-500/10"
          : isSelected && isHistorical
          ? "border-amber-500/40 bg-amber-500/10"
          : isSelected
          ? "border-border bg-accent/40"
          : blockedByEdits
          ? "border-amber-500/30 bg-amber-500/5 opacity-70 cursor-not-allowed"
          : "border-border/60 hover:bg-accent/40";
        return (
          <button
            key={revision.id}
            type="button"
            disabled={blockedByEdits}
            onClick={() => onSelect(revision.id)}
            className={`${baseClass} ${stateClass}`}
            data-testid={`revision-row-${revision.revisionNumber}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>{t("zhComponents.text_03e404fd16")} {revision.revisionNumber}</span>
              {isCurrent && (
                <Badge variant="outline" className="border-border px-1.5 text-(length:--text-nano) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
                  {t("current")}
                </Badge>
              )}
              {revision.restoredFromRevisionId && (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-1.5 text-(length:--text-nano) uppercase tracking-(--tracking-eyebrow) text-amber-800 dark:text-amber-200">
                  {t("restored")}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {relativeTime(revision.createdAt)} • {getActorLabel(revision)}
              {revision.changeSummary ? ` • ${revision.changeSummary}` : ""}
            </div>
          </button>
        );
      })}
      {totalRevisions > revisions.length && !showOlder && (
        <Button variant="ghost" size="sm" className="w-full" onClick={onShowOlder}>
          {t("show")} {totalRevisions - revisions.length} {t("older")}
        </Button>
      )}
    </aside>
  );
}

function RevisionPreview({
  revision,
  currentRevision,
  isHistorical,
  agents,
  projects,
  onCompare,
  onRestore,
  restorePending,
  highlighted,
}: {
  revision: RoutineRevision;
  currentRevision: RoutineRevision | null;
  isHistorical: boolean;
  agents: AgentLookup;
  projects: ProjectLookup;
  onCompare: () => void;
  onRestore: () => void;
  restorePending: boolean;
  highlighted: boolean;
}) {
  const { t } = useTranslation();
  const snapshot = revision.snapshot.routine;
  const triggers = revision.snapshot.triggers;
  const currentSnapshot = currentRevision?.snapshot.routine ?? null;
  const restoreLabel = isHistorical ? t("restore_this_revision") : t("restore_this_revision");
  const cardWrapper = `rounded-md border transition-colors duration-1000 ${
    highlighted ? "border-emerald-500/40 bg-emerald-500/10" : "border-border"
  }`;

  const envSummary = summarizeEnv(snapshot.env ?? null);
  const envDiffers = !!currentSnapshot
    && JSON.stringify(normalizeEnv(currentSnapshot.env ?? null))
      !== JSON.stringify(normalizeEnv(snapshot.env ?? null));
  const fieldRows: Array<{ key: string; label: string; value: string; differs: boolean }> = [
    {
      key: "title",
      label: t("title"),
      value: snapshot.title,
      differs: !!currentSnapshot && currentSnapshot.title !== snapshot.title,
    },
    {
      key: "priority",
      label: t("priority"),
      value: snapshot.priority,
      differs: !!currentSnapshot && currentSnapshot.priority !== snapshot.priority,
    },
    {
      key: "status",
      label: t("status"),
      value: snapshot.status,
      differs: !!currentSnapshot && currentSnapshot.status !== snapshot.status,
    },
    {
      key: "assigneeAgentId",
      label: t("default_agent"),
      value: resolveAgentName(snapshot.assigneeAgentId, agents),
      differs: !!currentSnapshot && currentSnapshot.assigneeAgentId !== snapshot.assigneeAgentId,
    },
    {
      key: "projectId",
      label: t("project"),
      value: resolveProjectName(snapshot.projectId, projects),
      differs: !!currentSnapshot && currentSnapshot.projectId !== snapshot.projectId,
    },
    {
      key: "concurrencyPolicy",
      label: t("concurrency"),
      value: concurrencyPolicyLabel(snapshot.concurrencyPolicy),
      differs: !!currentSnapshot && currentSnapshot.concurrencyPolicy !== snapshot.concurrencyPolicy,
    },
    {
      key: "catchUpPolicy",
      label: t("catch_up"),
      value: catchUpPolicyLabel(snapshot.catchUpPolicy),
      differs: !!currentSnapshot && currentSnapshot.catchUpPolicy !== snapshot.catchUpPolicy,
    },
    {
      key: "env",
      label: t("env"),
      value: envSummary,
      differs: envDiffers,
    },
  ];

  return (
    <div className="space-y-4">
      <header className={`${cardWrapper} p-4 space-y-2`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium">{t("zhComponents.text_03e404fd16")} {revision.revisionNumber}</p>
            <p className="text-xs text-muted-foreground truncate">
              {t("saved")} {relativeTime(revision.createdAt)} {t("zhComponents.text_408158643e")} {getActorLabel(revision)}
              {revision.changeSummary ? ` · ${revision.changeSummary}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCompare}>
              <Search className="mr-1.5 h-3.5 w-3.5" />
              {t("compare_with_current")}
            </Button>
            <Button
              size="sm"
              onClick={onRestore}
              disabled={!isHistorical || restorePending}
              aria-label={restoreLabel}
              className={!isHistorical ? "text-muted-foreground/60" : undefined}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {restoreLabel}
            </Button>
          </div>
        </div>
      </header>

      <div className={`${cardWrapper} p-3`}>
        <p className="pb-2 text-xs font-medium uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("structured_fields")}
        </p>
        <div className="grid gap-3 md:grid-cols-2 divide-y md:divide-y-0 divide-border">
          {fieldRows.map((row) => (
            <div key={row.key} className="space-y-1 p-2">
              <p className="text-(length:--text-micro) uppercase tracking-wide text-muted-foreground">{row.label}</p>
              <p className="text-sm">
                {row.value || <span className="text-muted-foreground">—</span>}
                {row.differs && (
                  <Badge variant="outline" className="ml-2 border-amber-500/40 bg-amber-500/10 px-1.5 text-(length:--text-nano) uppercase tracking-(--tracking-eyebrow) text-amber-800 dark:text-amber-200">
                    {t("differs_from_current")}
                  </Badge>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${cardWrapper} p-3 space-y-2`}>
        <p className="text-xs font-medium uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("description")}
        </p>
        <div className="rounded-md bg-background/40 p-3 text-sm leading-7">
          {snapshot.description ? (
            <MarkdownBody>{snapshot.description}</MarkdownBody>
          ) : (
            <span className="text-muted-foreground">{t("no_description")}</span>
          )}
        </div>
      </div>

      <div className={`${cardWrapper} p-3 space-y-2`}>
        <p className="text-xs font-medium uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("triggers")}{triggers.length})
        </p>
        {triggers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_triggers_in_this_revision")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {triggers.map((trigger) => (
              <li key={trigger.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="border-border text-(length:--text-nano) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
                  {getDisplayLabel(trigger.kind)}
                </Badge>
                <span className="font-medium">{trigger.label ?? getDisplayLabel(trigger.kind, "raw")}</span>
                <span className="text-xs text-muted-foreground">
                  {summarizeTriggerSnapshot(trigger)}
                </span>
                <span
                  className={`ml-auto text-xs ${trigger.enabled ? "text-emerald-400" : "text-muted-foreground"}`}
                >
                  {getDisplayLabel(trigger.enabled ? "enabled" : "disabled", "raw")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t("webhook_secrets_are_not_stored_in_revisions_if_a")}
        </p>
      </div>

      {snapshot.variables.length > 0 && (
        <div className={`${cardWrapper} p-3 space-y-2`}>
          <p className="text-xs font-medium uppercase tracking-(--tracking-caps) text-muted-foreground">
            {t("variables_70b4ff")}{snapshot.variables.length})
          </p>
          <ul className="divide-y divide-border">
            {snapshot.variables.map((variable) => (
              <li key={variable.name} className="py-2 flex items-center justify-between text-sm">
                <span className="font-mono text-xs">{variable.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t("default_71b822")} {formatVariableDefault(variable)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RestoreConfirmDialog({
  open,
  onOpenChange,
  target,
  currentRevisionNumber,
  changeSummary,
  onChangeSummaryChange,
  onConfirm,
  pending,
  recreatedWebhookLabels,
  envDiffCounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RoutineRevision;
  currentRevisionNumber: number;
  changeSummary: string;
  onChangeSummaryChange: (value: string) => void;
  onConfirm: () => void;
  pending: boolean;
  recreatedWebhookLabels: string[];
  envDiffCounts: EnvDiffCounts;
}) {
  const { t } = useTranslation();
  const newRevisionNumber = currentRevisionNumber + 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("restore_revision")} {target.revisionNumber}?</DialogTitle>
          <DialogDescription>
            {t("this_creates_a_new_revision")} {newRevisionNumber} {t("with_the_same_content_as_revision")}{" "}
            {target.revisionNumber}{t("zhComponents.text_04ba0d99b8")} {target.revisionNumber}–{currentRevisionNumber} {t("stay_in_history_and_are_not_modified")}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t("routine_field_values_variables_and_schedule_cron")}
          </li>
          {envDiffCounts.total > 0 && (
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {t("routine_secrets_will_revert")} {formatEnvDiffCounts(envDiffCounts)}.
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t("previous_run_history_is_preserved")}
          </li>
          {recreatedWebhookLabels.map((label) => (
            <li key={label} className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
              {t("the_webhook_trigger")} {label} {t("will_be_recreated_with_a_new_url_and_secret_pape")}
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="restore-change-summary" className="text-xs">
            {t("change_summary_optional")}
          </Label>
          <Input
            id="restore-change-summary"
            value={changeSummary}
            placeholder={t("why_are_you_restoring_visible_in_history")}
            onChange={(event) => onChangeSummaryChange(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {pending ? t("restoring_90190b") : t("zhComponents.message_2662b9e00a", { value1: newRevisionNumber })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoutineRevisionDiffModal({
  open,
  onOpenChange,
  revisions,
  initialOldRevisionId,
  initialNewRevisionId,
  agents,
  projects,
  secrets,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisions: RoutineRevision[];
  initialOldRevisionId: string;
  initialNewRevisionId: string;
  agents: AgentLookup;
  projects: ProjectLookup;
  secrets: SecretLookup;
  onRestore: (revision: RoutineRevision) => void;
}) {
  const { t } = useTranslation();
  const [leftId, setLeftId] = useState<string>(initialOldRevisionId);
  const [rightId, setRightId] = useState<string>(initialNewRevisionId);

  useEffect(() => {
    if (open) {
      setLeftId(initialOldRevisionId);
      setRightId(initialNewRevisionId);
    }
  }, [open, initialOldRevisionId, initialNewRevisionId]);

  const left = revisions.find((r) => r.id === leftId) ?? null;
  const right = revisions.find((r) => r.id === rightId) ?? null;
  const fieldChanges = useMemo(
    () => (left && right ? computeFieldChanges(left, right, agents, projects, secrets) : []),
    [left, right, agents, projects, secrets],
  );
  const descriptionDiff = useMemo<DiffRow[]>(
    () => (left && right
      ? buildLineDiff(left.snapshot.routine.description ?? "", right.snapshot.routine.description ?? "")
      : []),
    [left, right],
  );
  const newest = revisions[0] ?? null;
  const leftIsHistorical = !!left && !!newest && left.id !== newest.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-(--pct-90) w-full max-h-(--sz-85vh) overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("compare_routine_revisions")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <RevisionPicker
            label={t("old")}
            value={leftId}
            onChange={setLeftId}
            revisions={revisions}
            tone="red"
          />
          <RevisionPicker
            label={t("new")}
            value={rightId}
            onChange={setRightId}
            revisions={revisions}
            tone="green"
          />
        </div>
        <div className="overflow-auto flex-1 space-y-4">
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-(--tracking-caps) text-muted-foreground">
              {t("field_changes")}
            </p>
            {fieldChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no_structural_field_changes")}</p>
            ) : (
              <table className="w-full text-sm border border-border rounded-md overflow-hidden">
                <thead>
                  <tr className="text-xs uppercase tracking-wide bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left">{t("field")}</th>
                    <th className="px-3 py-2 text-left">{t("old_value")}</th>
                    <th className="px-3 py-2 text-left">{t("new_value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldChanges.map((change) => (
                    <tr key={change.field} className="border-t border-border/60">
                      <td className="px-3 py-2 align-top text-xs font-medium">{change.field}</td>
                      <td className="px-3 py-2 align-top text-xs text-red-700 dark:text-red-300">
                        {change.oldValue ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-emerald-700 dark:text-emerald-300">
                        {change.newValue ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-(--tracking-caps) text-muted-foreground">
              {t("description_diff")}
            </p>
            <DiffTable rows={descriptionDiff} />
          </section>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          {leftIsHistorical && left && (
            <Button onClick={() => onRestore(left)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t("restore_rev")} {left.revisionNumber} {t("as_new_revision")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevisionPicker({
  label,
  value,
  onChange,
  revisions,
  tone,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  revisions: RoutineRevision[];
  tone: "red" | "green";
}) {
  const toneClass = tone === "red"
    ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300";
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline"
        className={`text-(length:--text-nano) uppercase tracking-wider ${toneClass}`}
      >
        {label}
      </Badge>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 min-w-(--sz-12rem) rounded-md border border-border/60 bg-background px-2 text-xs"
      >
        {revisions.map((revision) => (
          <option key={revision.id} value={revision.id}>
            {t("zhComponents.text_03e404fd16")} {revision.revisionNumber} — {relativeTime(revision.createdAt)}
            {revision.changeSummary ? ` • ${revision.changeSummary}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function DiffTable({ rows }: { rows: DiffRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("no_description_on_either_revision")}</p>;
  }
  if (rows.every((row) => row.kind === "context")) {
    return <p className="text-sm text-muted-foreground">{t("descriptions_are_identical")}</p>;
  }
  const lineClassesByKind: Record<DiffRow["kind"], string> = {
    context: "bg-transparent",
    removed: "bg-red-500/10 text-red-900 dark:text-red-100",
    added: "bg-green-500/10 text-green-900 dark:text-green-100",
  };
  const markerByKind: Record<DiffRow["kind"], string> = {
    context: " ",
    removed: "-",
    added: "+",
  };
  return (
    <div className="rounded-md border border-border text-xs font-mono leading-6 overflow-hidden">
      <div className="grid grid-cols-(--gtc-1) border-b border-border/60 bg-muted/30 px-3 py-2 text-(length:--text-micro) uppercase tracking-wide text-muted-foreground">
        <span>{t("old")}</span>
        <span>{t("new")}</span>
        <span />
        <span>{t("content")}</span>
      </div>
      {rows.map((row, index) => (
        <div
          key={`${row.kind}-${index}-${row.oldLineNumber ?? "x"}-${row.newLineNumber ?? "x"}`}
          className={`grid grid-cols-(--gtc-1) gap-0 border-b border-border/30 px-3 ${lineClassesByKind[row.kind]}`}
        >
          <span className="select-none border-r border-border/30 pr-3 text-right text-muted-foreground">
            {row.oldLineNumber ?? ""}
          </span>
          <span className="select-none border-r border-border/30 px-3 text-right text-muted-foreground">
            {row.newLineNumber ?? ""}
          </span>
          <span className="select-none px-3 text-center text-muted-foreground">
            {markerByKind[row.kind]}
          </span>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-0 text-inherit">
            {row.text.length > 0 ? row.text : " "}
          </pre>
        </div>
      ))}
    </div>
  );
}

function getActorLabel(revision: RoutineRevision): string {
  if (revision.createdByUserId) return "board";
  if (revision.createdByAgentId) return "agent";
  return "system";
}

function resolveAgentName(agentId: string | null, lookup: AgentLookup) {
  if (!agentId) return t("unassigned");
  return lookup.get(agentId)?.name ?? agentId;
}

function resolveProjectName(projectId: string | null, lookup: ProjectLookup) {
  if (!projectId) return t("no_project");
  return lookup.get(projectId)?.name ?? projectId;
}

function summarizeTriggerSnapshot(trigger: RoutineRevisionSnapshotTriggerV1): string {
  if (trigger.kind === "schedule") {
    return [trigger.cronExpression, trigger.timezone].filter(Boolean).join(" · ");
  }
  if (trigger.kind === "webhook") {
    const replay = trigger.replayWindowSec != null ? t("zhComponents.message_682761eb2b", { value1: trigger.replayWindowSec }) : "";
    return [trigger.signingMode, replay].filter(Boolean).join(" · ");
  }
  return "API";
}

function formatVariableDefault(variable: RoutineVariable): string {
  if (variable.defaultValue == null) return "—";
  return String(variable.defaultValue);
}

function formatDirtyFieldList(labels: string[]): string {
  if (labels.length === 0) return t("the_routine");
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return t("zhComponents.message_c4d1c05c91", { value1: labels[0], value2: labels[1] });
  return t("zhComponents.message_9ab7d86b59", { value1: labels.slice(0, -1).join(", "), value2: labels[labels.length - 1] });
}

function collectWebhookTriggerDifferences(
  target: RoutineRevision,
  current: RoutineRevision,
): string[] {
  const currentIds = new Set(current.snapshot.triggers.map((t) => t.id));
  return target.snapshot.triggers
    .filter((trigger) => trigger.kind === "webhook" && !currentIds.has(trigger.id))
    .map((trigger) => trigger.label ?? "webhook");
}

function describeSnapshotField(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function computeFieldChanges(
  left: RoutineRevision,
  right: RoutineRevision,
  agents: AgentLookup,
  projects: ProjectLookup,
  secrets: SecretLookup,
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const oldRoutine = left.snapshot.routine;
  const newRoutine = right.snapshot.routine;
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  const compareScalar = (
    _field: string,
    label: string,
    oldVal: unknown,
    newVal: unknown,
    transform: (value: unknown) => string = describeSnapshotField,
  ) => {
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: label, oldValue: transform(oldVal), newValue: transform(newVal) });
    }
  };
  compareScalar("title", t("title"), oldRoutine.title, newRoutine.title);
  compareScalar("priority", t("priority"), oldRoutine.priority, newRoutine.priority);
  compareScalar(
    "assigneeAgentId",
    t("default_agent"),
    resolveAgentName(oldRoutine.assigneeAgentId, agents),
    resolveAgentName(newRoutine.assigneeAgentId, agents),
  );
  compareScalar(
    "projectId",
    t("project"),
    resolveProjectName(oldRoutine.projectId, projects),
    resolveProjectName(newRoutine.projectId, projects),
  );
  compareScalar("concurrencyPolicy", t("concurrency"), oldRoutine.concurrencyPolicy, newRoutine.concurrencyPolicy);
  compareScalar("catchUpPolicy", t("catch_up"), oldRoutine.catchUpPolicy, newRoutine.catchUpPolicy);
  compareScalar("status", t("status"), oldRoutine.status, newRoutine.status);
  if (JSON.stringify(oldRoutine.variables) !== JSON.stringify(newRoutine.variables)) {
    changes.push({
      field: t("variables"),
      oldValue: summarizeVariables(oldRoutine.variables),
      newValue: summarizeVariables(newRoutine.variables),
    });
  }
  compareEnv(oldRoutine.env ?? null, newRoutine.env ?? null, secrets, changes);
  compareTriggers(left.snapshot.triggers, right.snapshot.triggers, changes);
  return changes;
}

function normalizeEnv(env: RoutineEnvConfig | null): Record<string, EnvBinding> {
  if (!env) return {};
  return env;
}

function envBindingKind(binding: EnvBinding): "plain" | "secret_ref" {
  if (typeof binding === "string") return "plain";
  if (binding && typeof binding === "object" && "type" in binding && binding.type === "secret_ref") {
    return "secret_ref";
  }
  return "plain";
}

function asSecretRef(binding: EnvBinding): EnvSecretRefBinding | null {
  if (typeof binding === "string") return null;
  if (binding && typeof binding === "object" && "type" in binding && binding.type === "secret_ref") {
    return binding;
  }
  return null;
}

function formatVersionSelector(version: SecretVersionSelector | undefined): string {
  if (version == null || version === "latest") return "latest";
  return `v${version}`;
}

function describeSecretRef(ref: EnvSecretRefBinding, secrets: SecretLookup): string {
  const secret = secrets.get(ref.secretId);
  const name = secret?.name ?? t("missing_secret");
  return `${name} ${formatVersionSelector(ref.version)}`;
}

function describeEnvBinding(binding: EnvBinding | undefined, secrets: SecretLookup): string {
  if (binding === undefined) return "—";
  const ref = asSecretRef(binding);
  if (ref) return t("zhComponents.message_ae30bda6c2", { value1: describeSecretRef(ref, secrets) });
  return t("plain_set");
}

function summarizeEnv(env: RoutineEnvConfig | null): string {
  const entries = Object.entries(normalizeEnv(env));
  if (entries.length === 0) return "";
  const secretCount = entries.filter(([, binding]) => envBindingKind(binding) === "secret_ref").length;
  const keyLabel = getCountNoun(entries.length, "key");
  if (secretCount === 0) return `${entries.length} ${keyLabel}`;
  return t("zhComponents.message_6fbfdb3785", { count: secretCount, value1: entries.length, value2: keyLabel, value3: secretCount });
}

type EnvDiffCounts = {
  added: number;
  removed: number;
  changed: number;
  total: number;
};

function summarizeEnvDiffCounts(
  current: RoutineEnvConfig | null,
  target: RoutineEnvConfig | null,
): EnvDiffCounts {
  const currentRec = normalizeEnv(current);
  const targetRec = normalizeEnv(target);
  let added = 0;
  let removed = 0;
  let changed = 0;
  const keys = new Set<string>([...Object.keys(currentRec), ...Object.keys(targetRec)]);
  for (const key of keys) {
    const inCurrent = key in currentRec;
    const inTarget = key in targetRec;
    if (inTarget && !inCurrent) {
      added += 1;
      continue;
    }
    if (!inTarget && inCurrent) {
      removed += 1;
      continue;
    }
    if (JSON.stringify(currentRec[key]) !== JSON.stringify(targetRec[key])) {
      changed += 1;
    }
  }
  return { added, removed, changed, total: added + removed + changed };
}

function formatEnvDiffCounts(counts: EnvDiffCounts): string {
  const parts: string[] = [];
  if (counts.added > 0) parts.push(t("zhComponents.message_69f259e844", { count: counts.added, value1: counts.added }));
  if (counts.removed > 0) parts.push(t("zhComponents.message_b33524d77d", { count: counts.removed, value1: counts.removed }));
  if (counts.changed > 0) parts.push(t("zhComponents.message_cff5cc0f80", { count: counts.changed, value1: counts.changed }));
  return parts.join(", ");
}

function compareEnv(
  oldEnv: RoutineEnvConfig | null,
  newEnv: RoutineEnvConfig | null,
  secrets: SecretLookup,
  changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  const oldRec = normalizeEnv(oldEnv);
  const newRec = normalizeEnv(newEnv);
  const keys = new Set<string>([...Object.keys(oldRec), ...Object.keys(newRec)]);
  const sortedKeys = [...keys].sort();
  for (const key of sortedKeys) {
    const oldBinding = oldRec[key];
    const newBinding = newRec[key];
    const inOld = key in oldRec;
    const inNew = key in newRec;
    if (inNew && !inOld) {
      changes.push({
        field: t("zhComponents.message_808ea12e56", { value1: key }),
        oldValue: "—",
        newValue: describeEnvBinding(newBinding, secrets),
      });
      continue;
    }
    if (!inNew && inOld) {
      changes.push({
        field: t("zhComponents.message_389d47cc46", { value1: key }),
        oldValue: describeEnvBinding(oldBinding, secrets),
        newValue: "—",
      });
      continue;
    }
    if (JSON.stringify(oldBinding) === JSON.stringify(newBinding)) continue;
    const oldKind = envBindingKind(oldBinding);
    const newKind = envBindingKind(newBinding);
    if (oldKind !== newKind) {
      changes.push({
        field: t("zhComponents.message_48f657dc2d", { value1: key }),
        oldValue: describeEnvBinding(oldBinding, secrets),
        newValue: describeEnvBinding(newBinding, secrets),
      });
      continue;
    }
    if (newKind === "secret_ref") {
      const oldRef = asSecretRef(oldBinding)!;
      const newRef = asSecretRef(newBinding)!;
      if (oldRef.secretId !== newRef.secretId) {
        changes.push({
          field: t("zhComponents.message_8b05fa5519", { value1: key }),
          oldValue: describeEnvBinding(oldBinding, secrets),
          newValue: describeEnvBinding(newBinding, secrets),
        });
        continue;
      }
      changes.push({
        field: t("zhComponents.message_de2bb676b7", { value1: key }),
        oldValue: describeSecretRef(oldRef, secrets),
        newValue: describeSecretRef(newRef, secrets),
      });
      continue;
    }
    changes.push({
      field: t("zhComponents.message_c607341218", { value1: key }),
      oldValue: t("plain_set"),
      newValue: t("plain_changed"),
    });
  }
}

function summarizeVariables(variables: RoutineVariable[]): string {
  if (variables.length === 0) return t("none_3c6b18");
  return variables
    .map((variable) => `${variable.name}=${formatVariableDefault(variable)}`)
    .join(", ");
}

function compareTriggers(
  oldTriggers: RoutineRevisionSnapshotTriggerV1[],
  newTriggers: RoutineRevisionSnapshotTriggerV1[],
  changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  const byId = new Map<string, { old?: RoutineRevisionSnapshotTriggerV1; next?: RoutineRevisionSnapshotTriggerV1 }>();
  for (const trigger of oldTriggers) byId.set(trigger.id, { old: trigger });
  for (const trigger of newTriggers) {
    const existing = byId.get(trigger.id) ?? {};
    byId.set(trigger.id, { ...existing, next: trigger });
  }
  for (const [, pair] of byId) {
    if (pair.old && !pair.next) {
      changes.push({
        field: t("zhComponents.message_af2e0023a8", { value1: pair.old.label ?? getDisplayLabel(pair.old.kind, "raw") }),
        oldValue: summarizeTriggerSnapshot(pair.old),
        newValue: null,
      });
    } else if (!pair.old && pair.next) {
      changes.push({
        field: t("zhComponents.message_2ddf0c8a2e", { value1: pair.next.label ?? getDisplayLabel(pair.next.kind, "raw") }),
        oldValue: null,
        newValue: summarizeTriggerSnapshot(pair.next),
      });
    } else if (pair.old && pair.next) {
      const oldSummary = summarizeTriggerSnapshot(pair.old);
      const newSummary = summarizeTriggerSnapshot(pair.next);
      if (oldSummary !== newSummary || pair.old.enabled !== pair.next.enabled) {
        changes.push({
          field: t("zhComponents.message_0016813a8c", { value1: pair.next.label ?? getDisplayLabel(pair.next.kind, "raw") }),
          oldValue: `${oldSummary} (${pair.old.enabled ? "enabled" : "disabled"})`,
          newValue: `${newSummary} (${pair.next.enabled ? "enabled" : "disabled"})`,
        });
      }
    }
  }
}

export function isUpdateConflictError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

export type RoutineHistoryDirtyFieldDescriptor = DirtyFieldDescriptor;
export type RoutineHistoryAgentLookup = AgentLookup;
export type RoutineHistoryProjectLookup = ProjectLookup;
