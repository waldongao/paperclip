import { t } from "@/i18n";
import type { TaskBrowser } from "@paperclipai/shared";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TaskBrowserActivity({
  browser,
  label = "Browser",
  onOpen,
}: {
  browser: TaskBrowser;
  label?: string;
  onOpen?: (id: string) => void;
}) {
  const closed = browser.status === "closed" || browser.status === "failed";
  return (
    <div className="flex flex-wrap items-center gap-2 py-1 text-sm" aria-label={t("stability.2eccb41c8284", { value1: label, defaultValue: "{{value1}} session" })}>
      <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>{label}</span>
      <span className="text-muted-foreground">· {browser.status}</span>
      {onOpen && (
        <Button variant="ghost" size="sm" onClick={() => onOpen(browser.id)}>
          {closed ? t("stability.4fbf3281b1f8", { defaultValue: "View session" }) : t("stability.b84a7dc03e31", { defaultValue: "Open browser" })}
        </Button>
      )}
    </div>
  );
}
