import { getDisplayLabel } from "@/lib/display-labels";
import { t } from "@/i18n";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";

export function ModeBadge({
  deploymentMode,
  deploymentExposure,
}: {
  deploymentMode?: DeploymentMode;
  deploymentExposure?: DeploymentExposure;
}) {
  const { t } = useTranslation();
  if (!deploymentMode) return null;

  const label =
    deploymentMode === "local_trusted"
      ? t("local_trusted")
      : t("zhComponents.message_7ba5eef8d4", { value1: getDisplayLabel(deploymentExposure ?? "private") });

  return <Badge variant="outline">{label}</Badge>;
}
