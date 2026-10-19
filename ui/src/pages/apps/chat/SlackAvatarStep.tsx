import { t } from "@/i18n";
import { useId, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupWizardFooter } from "@/components/SetupWizard";

export interface SlackAvatarProps {
  agentName: string;
  appName: string;
  avatarUrl: string;
}

/** Shared by Slack onboarding and its Settings page. Slack upload is manual. */
export function SlackAvatarContent({
  agentName,
  appName,
  avatarUrl,
  compact = false,
}: SlackAvatarProps & { compact?: boolean }) {
  const id = useId();
  const filename = `${appName.replace(/[^a-zA-Z0-9_-]+/g, "-") || "agent"}-avatar.png`;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const response = await fetch(avatarUrl);
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/png")
      )
        throw new Error("Avatar unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="space-y-8">
      <section
        aria-labelledby={`${id}-download`}
        className="flex flex-col items-start gap-6 sm:flex-row sm:items-center"
      >
        <img
          src={avatarUrl}
          width={512}
          height={512}
          alt={t("stability.7788fcb7dec4", { value1: agentName, defaultValue: "{{value1}}’s Cliptoon avatar" })}
          className="size-40 shrink-0 rounded-lg bg-muted object-contain"
        />
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 id={`${id}-download`} className="text-sm font-semibold">
              {compact
                ? t("stability.ce5bdd090305", { defaultValue: "Download your agent’s avatar" })
                : t("stability.fc5927ad100f", { defaultValue: "1. Download your agent’s avatar" })}
            </h2>
            <p className="text-xs text-muted-foreground">{t("stability.1439257c77a5", { defaultValue: "PNG · 512 × 512 · Ready for Slack" })}</p>
          </div>
          <Button variant="outline" asChild>
            <a
              href={avatarUrl}
              download={filename}
              aria-disabled={downloading}
              onClick={(event) => {
                event.preventDefault();
                void download();
              }}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}{t("stability.e7dc2a1ba0c6", { defaultValue: "Download avatar" })}</a>
          </Button>
          {downloadError && (
            <p role="alert" className="text-sm text-destructive">{t("stability.f77ab7e7bc1e", { defaultValue: "Couldn’t download the avatar. Try downloading it again." })}</p>
          )}
        </div>
      </section>

      <details open={compact ? undefined : true} className="space-y-4">
        <summary
          className={
            compact
              ? "cursor-pointer text-sm underline underline-offset-4"
              : "hidden"
          }
        >{t("stability.68a7030b41af", { defaultValue: "How to upload in Slack" })}</summary>
        <section aria-labelledby={`${id}-upload`} className="space-y-4">
          <div className="space-y-1">
            <h2 id={`${id}-upload`} className="text-sm font-semibold">
              {compact ? t("stability.9ef6fd056f3b", { defaultValue: "Upload it in Slack" }) : t("stability.733c836bb93e", { defaultValue: "2. Upload it in Slack" })}
            </h2>
            <p className="text-sm text-muted-foreground">{t("stability.19c451a3eead", { defaultValue: "You’ll upload the downloaded image directly in Slack’s app settings." })}</p>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >{t("stability.30cfde1ec067", { defaultValue: "Open Slack app Settings" })}{" "}
                <ExternalLink className="inline size-3" />
              </a>{" "}{t("stability.566c1f30e50c", { defaultValue: "and choose" })}{" "}<strong>{appName}</strong>.
            </li>
            <li>{t("choose")}{" "}<strong>{t("stability.d094b334d809", { defaultValue: "Basic Information" })}</strong>{t("stability.9a9402254014", { defaultValue: ", then scroll to" })}{" "}
              <strong>{t("stability.6ad97855804a", { defaultValue: "Display Information" })}</strong>.
            </li>
            <li>{t("stability.80e4ad056bd7", { defaultValue: "Under" })}{" "}<strong>{t("stability.22ef051d0b84", { defaultValue: "App icon & Preview" })}</strong>{t("stability.ac8049f4e43e", { defaultValue: ", click the app icon and upload" })}{" "}
              <span className="break-all font-mono text-xs">{filename}</span>.
            </li>
            <li>{t("stability.483a16f11bf4", { defaultValue: "Confirm the crop, then click" })}{" "}<strong>{t("stability.35322b5bb5a2", { defaultValue: "Save Changes" })}</strong>{" "}{t("stability.017245d54fdb", { defaultValue: "in Slack." })}</li>
          </ol>
        </section>
      </details>
    </div>
  );
}

export function SlackAvatarStep({
  uploaded,
  onUploaded,
  onSkip,
  onSaveExit,
  ...props
}: SlackAvatarProps & {
  uploaded: boolean;
  onUploaded: () => void;
  onSkip: () => void;
  onSaveExit: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{t("stability.c6402106c821", { defaultValue: "Give" })}{" "}{props.agentName}{" "}{t("stability.5c31a82b59ec", { defaultValue: "a face in Slack" })}</h1>
          <span className="text-xs text-muted-foreground">{t("optional_0c6c41")}</span>
        </div>
        <p className="text-sm text-muted-foreground">{t("use_1d4d43")}{" "}{props.agentName}{t("stability.001b345bd19c", { defaultValue: "’s avatar so your team recognizes the agent" })}</p>
      </div>
      <SlackAvatarContent {...props} />
      {uploaded && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-(--status-task-done)/10 p-3 text-sm"
        >
          <Check className="size-4 text-(--status-task-done)" />{t("stability.bc4cad4b6e09", { defaultValue: "You marked the avatar as uploaded in Slack." })}</p>
      )}
      <SetupWizardFooter onSaveExit={onSaveExit}>
        <Button variant="ghost" onClick={onSkip}>{t("stability.b58eb52c8810", { defaultValue: "Skip for now" })}</Button>
        <Button onClick={onUploaded}>
          {uploaded ? t("continue") : t("stability.6e475f8b403b", { defaultValue: "I’ve uploaded the avatar" })}
          <ArrowRight className="size-4" />
        </Button>
      </SetupWizardFooter>
    </div>
  );
}

export function SlackAvatarSettings(props: SlackAvatarProps) {
  return (
    <section className="space-y-4" aria-label={t("stability.761226caa94e", { defaultValue: "Slack avatar" })}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("stability.fb65e8cf15fa", { defaultValue: "Agent avatar" })}</h2>
        <p className="text-sm text-muted-foreground">{t("use_1d4d43")}{" "}{props.agentName}{t("stability.001b345bd19c", { defaultValue: "’s avatar so your team recognizes the agent" })}</p>
      </div>
      <SlackAvatarContent {...props} compact />
    </section>
  );
}
