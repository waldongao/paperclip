import { t } from "@/i18n";
import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { IssueRecoveryAction } from "@paperclipai/shared";
import { isNativeWorkspaceExportRepairCause } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

/** Copyback repair preserves the accepted result and never wakes the provider. */
export function WorkspaceExportRecovery({ issueId, action, canManage, onQueued }: {
  issueId: string; action: IssueRecoveryAction | null; canManage: boolean; onQueued: () => void;
}) {
  const noteId = useId();
  const [repairNote, setRepairNote] = useState("");
  const [queuedActionVersion, setQueuedActionVersion] = useState<string | null>(null);
  const retry = useMutation({
    mutationFn: () => issuesApi.retryWorkspaceExport(issueId, {
      actionId: action!.id, runId: action!.evidence.runId as string, repairNote: repairNote.trim(),
    }),
    onSuccess: () => { setQueuedActionVersion(String(action!.updatedAt)); onQueued(); },
  });
  if (!action || !isNativeWorkspaceExportRepairCause(action.cause) || action.ownerType !== "board"
    || !["active", "escalated"].includes(action.status) || typeof action.evidence.runId !== "string") return null;
  const queued = queuedActionVersion === String(action.updatedAt) || action.wakePolicy?.kind === "resume_native_run";
  return <section aria-label={t("stability.3d5f2d271206", { defaultValue: "Workspace export repair" })} className="flex flex-col gap-2 p-4 text-sm">
    <p className="font-medium">{t("stability.46f1e4d7d63d", { defaultValue: "Workspace export needs repair" })}</p>
    {queued ? <p role="status">{t("stability.3b81ee436d1c", { defaultValue: "Export is queued for the saved result. The agent will not repeat its work." })}</p> : <>
      <p className="text-muted-foreground">{t("stability.a881bf362c54", { defaultValue: "Automatic workspace export retries stopped. Inspect the export failure, restore provider or destination availability, and preserve the saved files in the retained sandbox. Retry export here when the cause is resolved." })}</p>
      {canManage ? <>
        <Label htmlFor={noteId}>{t("stability.7b3b908886c9", { defaultValue: "Repair performed" })}</Label>
        <Textarea id={noteId} value={repairNote} onChange={event => setRepairNote(event.target.value)} maxLength={12_000}
          placeholder={t("stability.93549f0a54f6", { defaultValue: "Describe the repair and how the saved workspace files were preserved." })} disabled={retry.isPending} />
        <div className="flex justify-end">
          <Button onClick={() => retry.mutate()} disabled={retry.isPending || repairNote.trim().length < 20}>
            {retry.isPending ? t("stability.4ef59d3cdfe3", { defaultValue: "Queueing export…" }) : t("stability.0f0e430d67df", { defaultValue: "Retry workspace export" })}
          </Button>
        </div>
      </> : <p className="text-muted-foreground">{t("stability.790275bddb82", { defaultValue: "A board member with runtime access can retry this export after repair." })}</p>}
      {retry.isError && <p role="alert" className="text-destructive">{retry.error instanceof Error ? retry.error.message : t("stability.a60a7bf32120", { defaultValue: "Could not queue export. Refresh the task and inspect its run." })}</p>}
    </>}
  </section>;
}
