import { auditSectionHref, type AuditSection } from "./audit/audit-navigation";
import { t } from "@/i18n";

export type AgentDetailView =
  | "overview"
  | "instructions"
  | "skills"
  | "runtime"
  | "secrets"
  | "tools"
  | "permissions"
  | "api-keys"
  | "revisions"
  | "run-detail";

export type AgentLocalDetailView = Exclude<AgentDetailView, "run-detail">;

export const AGENT_DETAIL_NAVIGATION: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ value: AgentLocalDetailView; label: string }>;
}> = [
  {
    label: t("agent_5ce2e6"),
    items: [
      { value: "overview", label: t("overview") },
      { value: "instructions", label: t("instructions") },
      { value: "skills", label: t("skills") },
    ],
  },
  {
    label: t("runtime"),
    items: [
      { value: "runtime", label: t("harness_runtime") },
      { value: "secrets", label: t("secrets") },
      { value: "tools", label: t("tools") },
    ],
  },
  {
    label: t("governance"),
    items: [
      { value: "permissions", label: t("permissions_trust") },
      { value: "api-keys", label: t("api_keys") },
      { value: "revisions", label: t("revisions") },
    ],
  },
] as const;

export function parseAgentDetailView(value: string | null): AgentLocalDetailView {
  if (value === "instructions" || value === "prompts") return "instructions";
  if (value === "skills") return "skills";
  if (value === "runtime" || value === "configure" || value === "configuration") return "runtime";
  if (value === "secrets") return "secrets";
  if (value === "tools") return "tools";
  if (value === "permissions" || value === "trust") return "permissions";
  if (value === "api-keys" || value === "keys") return "api-keys";
  if (value === "revisions" || value === "history") return "revisions";
  return "overview";
}

export function agentDetailHref(agentRef: string, view: AgentLocalDetailView = "overview") {
  return `/agents/${agentRef}/${view}`;
}

export function agentLegacyAuditSection(value: string | null): AuditSection | null {
  if (value === "runs") return "runs";
  if (value === "audit" || value === "activity") return "activity";
  if (value === "cost" || value === "costs") return "costs";
  if (value === "budget" || value === "budgets") return "budgets";
  return null;
}

export function agentScopedAuditHref(agentId: string, section: AuditSection) {
  return auditSectionHref(section, {
    mode: section === "activity" ? "agents" : undefined,
    agentId,
  });
}
