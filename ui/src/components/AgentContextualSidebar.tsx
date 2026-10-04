import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgeDollarSign,
  BookOpenText,
  History,
  KeyRound,
  Library,
  PlayCircle,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { agentsApi } from "@/api/agents";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";
import { ContextualSidebarFrame } from "./ContextualSidebarFrame";
import { SidebarNavItem } from "./SidebarNavItem";
import { contextualSidebarStyles } from "./contextual-sidebar-styles";
import {
  AGENT_DETAIL_NAVIGATION,
  agentDetailHref,
  agentScopedAuditHref,
  type AgentLocalDetailView,
} from "@/pages/agent-detail-navigation";
import { t, useTranslation } from "@/i18n";

const localIcons = {
  overview: Sparkles,
  instructions: BookOpenText,
  skills: Library,
  runtime: Settings2,
  secrets: ShieldCheck,
  tools: Wrench,
  permissions: ShieldCheck,
  "api-keys": KeyRound,
  revisions: History,
} satisfies Record<AgentLocalDetailView, typeof Sparkles>;

const auditItems = [
  { section: "activity", label: t("activity"), icon: Activity },
  { section: "runs", label: t("runs"), icon: PlayCircle },
  { section: "costs", label: t("costs"), icon: ReceiptText },
  { section: "budgets", label: t("budgets"), icon: BadgeDollarSign },
] as const;

export function AgentContextualSidebar({
  agentRef,
  agentId,
  agentName,
}: {
  agentRef: string;
  agentId?: string;
  agentName?: string;
}) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const shouldResolveAgent = !agentId || !agentName;
  const { data: resolvedAgent } = useQuery({
    queryKey: [...queryKeys.agents.detail(agentRef), selectedCompanyId ?? null, "contextual-sidebar"],
    queryFn: () => agentsApi.get(agentRef, selectedCompanyId ?? undefined),
    enabled: shouldResolveAgent && Boolean(agentRef && selectedCompanyId),
  });
  const resolvedId = agentId ?? resolvedAgent?.id;
  const resolvedName = agentName ?? resolvedAgent?.name ?? t("agent_5ce2e6");

  return (
    <ContextualSidebarFrame
      surface="agent"
      title={resolvedName}
      fallbackTo="/agents/all"
      showHeader={false}
      className="border-r border-border bg-background"
    >
      <nav
        aria-label={t("zhComponents.message_d54050e888", { value1: resolvedName })}
        data-slot="contextual-sidebar-nav"
        className={contextualSidebarStyles.nav}
      >
        {AGENT_DETAIL_NAVIGATION.map((section) => (
          <div
            key={section.label}
            data-slot="contextual-sidebar-section"
            className={contextualSidebarStyles.section}
          >
            <p
              data-slot="contextual-sidebar-section-label"
              className={contextualSidebarStyles.sectionLabel}
            >
              {section.label}
            </p>
            <div data-slot="contextual-sidebar-group" className={contextualSidebarStyles.group}>
              {section.items.map((item) => {
                const href = agentDetailHref(agentRef, item.value);
                return (
                  <SidebarNavItem
                    key={item.value}
                    to={href}
                    label={item.label}
                    icon={localIcons[item.value]}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <div data-slot="contextual-sidebar-section" className={contextualSidebarStyles.section}>
          <p
            data-slot="contextual-sidebar-section-label"
            className={contextualSidebarStyles.sectionLabel}
          >
            {t("audit")}
          </p>
          <div data-slot="contextual-sidebar-group" className={contextualSidebarStyles.group}>
            {resolvedId ? auditItems.map((item) => (
              <SidebarNavItem
                key={item.section}
                to={agentScopedAuditHref(resolvedId, item.section)}
                label={item.label}
                icon={item.icon}
              />
            )) : (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("loading_audit_links")}</p>
            )}
          </div>
        </div>
      </nav>
    </ContextualSidebarFrame>
  );
}
