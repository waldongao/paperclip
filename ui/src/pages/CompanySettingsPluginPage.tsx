import { t } from "@/i18n";
import { useEffect, useMemo } from "react";
import { useParams } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { PluginSlotMount, usePluginSlots } from "@/plugins/slots";
import { NotFoundPage } from "./NotFound";
import { useTranslation } from "@/i18n";

export function CompanySettingsPluginPage() {
  const { t } = useTranslation();
  const params = useParams<{
    companyPrefix?: string;
    settingsRoutePath?: string;
  }>();
  const { companyPrefix: routeCompanyPrefix, settingsRoutePath } = params;
  const { companies, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const routeCompany = useMemo(() => {
    if (!routeCompanyPrefix) return null;
    const requested = routeCompanyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requested) ?? null;
  }, [companies, routeCompanyPrefix]);
  const hasInvalidCompanyPrefix = Boolean(routeCompanyPrefix) && !routeCompany;
  const resolvedCompanyId = routeCompany?.id ?? (routeCompanyPrefix ? null : selectedCompanyId ?? null);
  const companyPrefix = resolvedCompanyId
    ? companies.find((company) => company.id === resolvedCompanyId)?.issuePrefix ?? null
    : null;

  const { slots, isLoading, errorMessage } = usePluginSlots({
    slotTypes: ["companySettingsPage"],
    companyId: resolvedCompanyId,
    enabled: Boolean(resolvedCompanyId && settingsRoutePath),
  });

  const pageSlots = useMemo(() => {
    if (!settingsRoutePath) return [];
    return slots.filter((slot) => slot.routePath === settingsRoutePath);
  }, [settingsRoutePath, slots]);

  const pageSlot = pageSlots.length === 1 ? pageSlots[0] : null;

  useEffect(() => {
    if (!pageSlot) return;
    setBreadcrumbs([
      { label: t("settings_"), href: "/company/settings" },
      { label: pageSlot.displayName },
    ]);
  }, [pageSlot, setBreadcrumbs]);

  if (!resolvedCompanyId) {
    if (hasInvalidCompanyPrefix) {
      return <NotFoundPage scope="invalid_company_prefix" requestedPrefix={routeCompanyPrefix} />;
    }
    return <div className="text-sm text-muted-foreground">{t("select_an_organization_to_view_this_page")}</div>;
  }

  if (!settingsRoutePath || isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loading_b04ba4")}</div>;
  }

  if (errorMessage) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {t("plugin_extensions_unavailable")} {errorMessage}
      </div>
    );
  }

  if (pageSlots.length > 1) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {t("multiple_plugins_declare_the_company_settings_ro")} <code>{settingsRoutePath}</code>{t("zhPages.c82045958357")}</div>
    );
  }

  if (!pageSlot) {
    return <NotFoundPage scope="board" />;
  }

  return (
    <div className="max-w-6xl">
      <PluginSlotMount
        slot={pageSlot}
        context={{ companyId: resolvedCompanyId, companyPrefix }}
        className="min-h-(--sz-200px)"
        missingBehavior="placeholder"
      />
    </div>
  );
}
