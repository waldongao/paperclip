import { i18n } from "@/i18n";
import { t } from "@/i18n";
import type { SourceTrustMetadata } from "@paperclipai/shared";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sourceTrustLabel } from "../lib/trust-policy-ui";
import { cn } from "../lib/utils";

export function SourceTrustBadge({
  sourceTrust,
  artifactLabel = "content",
  className,
}: {
  sourceTrust: SourceTrustMetadata | null | undefined;
  artifactLabel?: "comment" | "document" | "work product" | "content";
  className?: string;
}) {
  const label = sourceTrustLabel(sourceTrust);
  if (!label) return null;

  const promoted = sourceTrust?.disposition === "promoted";
  const tooltip = promoted
    ? t("zhComponents.message_1073422b34", { value1: sourceTrust.promotedAt ? t("zhComponents.message_d9a685b0db", { value1: new Date(sourceTrust.promotedAt).toLocaleString(i18n.resolvedLanguage ?? i18n.language) }) : "" })
    : t("zhComponents.message_6b54527efa", { value1: ({ comment: t("comment"), document: t("document"), "work product": t("work_product"), content: t("content") })[artifactLabel] });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          aria-label={label}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0 text-(length:--text-nano) font-medium tracking-normal",
            promoted
              ? "border-border text-muted-foreground"
              : "border-amber-500/40 text-amber-700 dark:text-amber-100",
            className,
          )}
        >
          {promoted ? <BadgeCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
