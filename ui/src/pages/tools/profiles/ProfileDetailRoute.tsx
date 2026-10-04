import { useEffect } from "react";
import { useParams } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { advancedTabHref } from "../tool-tabs";
import { ToolsAdminGate } from "./ToolsAdminGate";
import { ProfileDetail } from "./ProfileDetail";
import { useTranslation } from "@/i18n";

export function ProfileDetailRoute() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const params = useParams<{ profileId?: string }>();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("company"), href: "/dashboard" },
      { label: t("apps"), href: "/apps" },
      { label: t("access_profiles"), href: advancedTabHref("profiles") },
      { label: t("profile_detail") },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompanyId || !params.profileId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("select_an_organization_and_profile")}</div>;
  }

  return (
    <ToolsAdminGate>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <ProfileDetail companyId={selectedCompanyId} profileId={params.profileId} />
      </div>
    </ToolsAdminGate>
  );
}
