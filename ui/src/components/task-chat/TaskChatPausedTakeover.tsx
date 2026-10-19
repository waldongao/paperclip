import { t } from "@/i18n";
import { useId } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";

export interface TaskComposerPause {
  scope: "leaf" | "subtree";
  onResume?: () => void;
  resumeHref?: string;
  pending?: boolean;
  error?: string | null;
}

/** Replaces all input controls until the effective pause hold is released. */
export function TaskChatPausedTakeover({
  scope,
  resumeHref,
  hasDraft = false,
  pending = false,
  error,
  onResume,
}: {
  hasDraft?: boolean;
} & TaskComposerPause) {
  const headingId = useId();
  const subtree = scope === "subtree";
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={pending}
      data-testid="paused-composer-takeover"
      className="flex flex-col gap-4 rounded-(--radius-task-composer) border border-(--status-agent-paused)/40 bg-(--status-agent-paused)/10 p-(--sz-18px)"
    >
      <div className="flex items-start gap-3">
        <Pause aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--status-task-icon-todo)" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="text-sm font-medium text-foreground">
            {subtree ? t("stability.f9ebf72d55c3", { defaultValue: "Subtree is paused." }) : t("stability.fb9c04c93b5e", { defaultValue: "Task is paused." })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {subtree
              ? t("stability.1f80fbce1bce", { defaultValue: "Resume this subtree to send a message." })
              : t("stability.24253739dd69", { defaultValue: "Resume this task to send a message." })}
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {hasDraft ? (
          <p className="mr-auto text-xs text-muted-foreground">{t("stability.58c808d96ad9", { defaultValue: "Your draft is saved." })}</p>
        ) : null}
        {resumeHref ? (
          <Button asChild size="sm" className="bg-(--status-agent-paused) text-foreground hover:bg-(--status-agent-paused)/80 dark:text-background">
            <Link to={resumeHref}><Play aria-hidden="true" />{t("resume_subtree")}</Link>
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending || !onResume}
            onClick={onResume}
            className="bg-(--status-agent-paused) text-foreground hover:bg-(--status-agent-paused)/80 dark:text-background"
          >
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
            {pending ? t("resuming") : subtree ? t("resume_subtree") : t("stability.c697c0563394", { defaultValue: "Resume task" })}
          </Button>
        )}
      </div>
    </section>
  );
}
