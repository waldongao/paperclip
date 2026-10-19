import { t } from "@/i18n";
import { AlertTriangle } from "lucide-react";
export function EmailSafetyNotice() {
  return (
    <div
      role="note"
      className="space-y-3 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-4 shrink-0 text-(--status-agent-paused)" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("stability.850d77abd7ec", { defaultValue: "Anyone can email an unrestricted inbox" })}</p>
          <p className="text-sm text-muted-foreground">{t("stability.50c1c42c86a4", { defaultValue: "Incoming email can create tasks and trigger agent work. Set up an allowlist in AgentMail to limit who can contact this inbox." })}</p>
          <p className="text-xs text-muted-foreground">{t("stability.db40f3b549c8", { defaultValue: "Paperclip does not verify sender restrictions. AgentMail controls new messages and replies separately; check both lists." })}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          href="https://console.agentmail.to"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >{t("stability.1d9d67d1ac14", { defaultValue: "Open AgentMail ↗" })}</a>
        <a
          href="https://docs.agentmail.to/knowledge-base/allowlists-blocklists"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground underline underline-offset-4"
        >{t("stability.0bf5ad9e2621", { defaultValue: "Set up allowlists ↗" })}</a>
      </div>
    </div>
  );
}
