import type { ToolConnectionInstall } from "@paperclipai/shared";
import { t } from "@/i18n";

/**
 * Shared "Permitted vs Installed" helpers (Phase 3b, PAP-13618).
 *
 * The one mental model: `installed ⊆ permitted`. **Access** = who may use an
 * app (zero context cost). **Installed** = whose harness actually carries the
 * app's tools on every run (a real per-run context cost). These helpers derive
 * the install state from a connection's `installs` rows and centralize the
 * copy so every surface (app detail, agent Tools tab, connect flow) speaks the
 * same language.
 */

export interface InstallState {
  /** A `company` install row: the app is installed on every agent. */
  onAll: boolean;
  /** Explicit per-agent install rows. */
  agentIds: Set<string>;
}

export function installStateFrom(installs: ToolConnectionInstall[] | undefined): InstallState {
  const agentIds = new Set<string>();
  let onAll = false;
  for (const install of installs ?? []) {
    if (install.targetType === "company") onAll = true;
    else if (install.targetType === "agent") agentIds.add(install.targetId);
  }
  return { onAll, agentIds };
}

/** True when this connection's tools load into the given agent's context. */
export function isAgentInstalled(state: InstallState, agentId: string): boolean {
  return state.onAll || state.agentIds.has(agentId);
}

/** Serialize an install state back into the PUT payload the API expects. */
export function installPayload(
  companyId: string,
  state: InstallState,
): Array<{ targetType: "company" | "agent"; targetId: string }> {
  if (state.onAll) return [{ targetType: "company", targetId: companyId }];
  return [...state.agentIds].map((targetId) => ({ targetType: "agent" as const, targetId }));
}

// --- Copy (verbatim from the PAP-13615 wireframe spec) ---

export function installInfoNotice(appName: string): string {
  return t("zhSupport.installContext", { app: appName });
}

export const INSTALL_ALL_WARNING =
  t("adds_context_cost_to_every_run_of_every_agent_a");

export function autoExtendNotice(agentName: string): string {
  return t("zhSupport.installGrantsAccess", { agent: agentName });
}

export const INSTALLED_HINT =
  t("has_access_tick_to_load_its_tools_into_this_agen");
