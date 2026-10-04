import { useEffect } from "react";
import { ArrowLeft, RadioTower } from "lucide-react";
import { Link } from "@/lib/router";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useTranslation } from "@/i18n";

const DASHBOARD_LIVE_RUN_LIMIT = 50;

export function DashboardLive() {
  const { t } = useTranslation();
  const { selectedCompanyId, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: t("dashboard"), href: "/dashboard" },
      { label: t("live_runs_69bc23") },
    ]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={RadioTower}
        message={companies.length === 0 ? t("create_an_organization_to_view_live_runs") : t("select_an_organization_to_view_live_runs")}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("dashboard")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{t("live_agent_runs")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("active_runs_first_followed_by_the_most_recent_co")}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">{t("showing_up_to")} {DASHBOARD_LIVE_RUN_LIMIT}</div>
      </div>

      <ActiveAgentsPanel
        companyId={selectedCompanyId}
        title={t("active_recent")}
        minRunCount={DASHBOARD_LIVE_RUN_LIMIT}
        fetchLimit={DASHBOARD_LIVE_RUN_LIMIT}
        cardLimit={DASHBOARD_LIVE_RUN_LIMIT}
        gridClassName="gap-3 md:grid-cols-2 2xl:grid-cols-3"
        cardClassName="h-(--sz-420px)"
        emptyMessage={t("no_active_or_recent_agent_runs")}
        queryScope="dashboard-live"
        showMoreLink={false}
      />
    </div>
  );
}
