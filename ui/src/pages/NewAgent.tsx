import { t } from "@/i18n";
import { useEffect } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { NewAgentSetup } from "../components/new-agent/NewAgentSetup";

export function NewAgent() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([
      { label: t("agents"), href: "/agents" },
      { label: t("new_agent") },
    ]);
  }, [setBreadcrumbs]);
  return <NewAgentSetup />;
}
