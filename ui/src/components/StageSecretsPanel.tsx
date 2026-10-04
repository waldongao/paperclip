import { KeyRound, Save } from "lucide-react";
import type { CompanySecret, RoutineEnvConfig } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { EnvironmentVariablesEditor } from "./environment-variables-editor";
import { AgentIcon } from "./AgentIconPicker";
import { useTranslation } from "@/i18n";

export interface StageSecretsPanelProps {
  /** Whether the stage has a backing automation routine with an assignee. */
  hasAutomation: boolean;
  /** Display name + icon of the agent that runs this step (when automation exists). */
  agentName?: string | null;
  agentIcon?: string | null;
  /** Company secret inventory (shared, not stage-scoped). */
  secrets: CompanySecret[];
  secretsLoading: boolean;
  value: RoutineEnvConfig;
  onChange: (env: RoutineEnvConfig) => void;
  onCreateSecret: (name: string, value: string) => Promise<CompanySecret>;
  /** Jump to the Automation section so the user can pick an agent. */
  onSetupAutomation: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}

/**
 * Stage Secrets tab body. Stage secrets are env bindings on the step's backing
 * automation routine — the same company-secret backbone used by routines,
 * agents, and projects. This panel is intentionally dense and reuses
 * `EnvironmentVariablesEditor` for secret refs, inline secret creation, version
 * selection, and missing/disabled-secret warnings.
 */
export function StageSecretsPanel({
  hasAutomation,
  agentName,
  agentIcon,
  secrets,
  secretsLoading,
  value,
  onChange,
  onCreateSecret,
  onSetupAutomation,
  onSave,
  saving,
  dirty,
}: StageSecretsPanelProps) {
  const { t } = useTranslation();
  // No backing automation/assignee → nothing can receive secrets at runtime.
  // Point the user at Automation instead of creating a hidden routine just
  // because the Secrets tab was opened.
  if (!hasAutomation) {
    return (
      <EmptyState
        icon={KeyRound}
        message={t("secrets_are_available_only_to_step_automation_pi")}
        action={t("set_up_automation")}
        onAction={onSetupAutomation}
      />
    );
  }

  const displayName = agentName?.trim() || t("the_responsible_agent");

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        {agentName ? (
          <AgentIcon icon={agentIcon} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        ) : (
          <KeyRound className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        )}
        <p>
          {t("these_env_vars_are_injected_when")}{" "}
          <span className="font-medium text-foreground">{displayName}</span> {t("runs_this_step_they_override_matching_project_an")} <span className="font-mono">{t("paperclip_f1a7d4")}</span> {t("names_are_reserved")}
        </p>
      </div>

      {secretsLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading_secrets")}</p>
      ) : (
        <EnvironmentVariablesEditor
          value={value}
          secrets={secrets}
          onCreateSecret={onCreateSecret}
          onChange={(env) => onChange((env ?? {}) as RoutineEnvConfig)}
        />
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={onSave} disabled={!dirty || saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? t("saving_56a228") : t("save_secrets")}
        </Button>
        {dirty && !saving ? <span className="text-xs text-muted-foreground">{t("unsaved_changes")}</span> : null}
      </div>
    </div>
  );
}
