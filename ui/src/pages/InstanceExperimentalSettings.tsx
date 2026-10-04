import { i18n } from "@/i18n";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical, Lock, Play } from "lucide-react";
import type {
  InstanceExperimentalSettings,
  InstanceExperimentalSettingsWithManaged,
  InstanceFeatureKey,
  ManagedSettingMetadata,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { experimentalSettingKey } from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { getWorktreeInstanceId, isWorktreeRuntime } from "../lib/worktree-branding";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/i18n";

type WorktreeRunExecutionDisplayState =
  | { kind: "off" }
  | { kind: "armed"; activatedAt: string }
  | { kind: "fail_closed"; reason: "missing_cutoff" | "missing_instance_id" | "instance_mismatch" };

/**
 * Mirror of the server's `resolveWorktreeRunExecutionActivation` fail-closed
 * ladder (server/src/services/instance-settings.ts) so the card never claims a
 * copied/legacy row is arming execution. The derived fields are display-only —
 * the PATCH the toggle sends still writes just the boolean.
 */
function resolveWorktreeRunExecutionDisplayState(
  settings:
    | Pick<
        InstanceExperimentalSettings,
        | "enableWorktreeRunExecution"
        | "worktreeRunExecutionActivatedAt"
        | "worktreeRunExecutionActivationInstanceId"
      >
    | undefined,
  currentInstanceId: string | null,
): WorktreeRunExecutionDisplayState {
  if (settings?.enableWorktreeRunExecution !== true) return { kind: "off" };
  if (!settings.worktreeRunExecutionActivatedAt) return { kind: "fail_closed", reason: "missing_cutoff" };
  if (!currentInstanceId) return { kind: "fail_closed", reason: "missing_instance_id" };
  if (settings.worktreeRunExecutionActivationInstanceId !== currentInstanceId) {
    return { kind: "fail_closed", reason: "instance_mismatch" };
  }
  return { kind: "armed", activatedAt: settings.worktreeRunExecutionActivatedAt };
}

function formatActivationTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium", timeStyle: "short" });
}

// PAP-11233: keep Conference Room code intact, but hide the user-facing opt-in for now.
const SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING = false;

function ManagedByCloudBadge() {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Lock aria-hidden="true" />
      {t("managed_by_paperclip_cloud")}
    </Badge>
  );
}

function ExperimentalToggleCard({
  title,
  description,
  footnote,
  checked,
  onCheckedChange,
  disabled,
  settingKey,
  managed,
  ariaLabel,
}: {
  title: string;
  description: string;
  footnote?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  /** Flag key backing this card; operator-hidden keys render nothing. */
  settingKey: InstanceFeatureKey;
  managed?: ManagedSettingMetadata;
  ariaLabel: string;
}) {
  const { hidden: hiddenSettings } = useHiddenSettings();
  const isManaged = managed?.managed === true;
  if (hiddenSettings.has(experimentalSettingKey(settingKey))) return null;
  return (
    <Card className="block bg-transparent p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {isManaged ? <ManagedByCloudBadge /> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          {footnote ? <p className="max-w-2xl text-xs text-muted-foreground">{footnote}</p> : null}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={(next) => {
            if (isManaged) return;
            onCheckedChange(next);
          }}
          disabled={disabled || isManaged}
          aria-label={ariaLabel}
        />
      </div>
    </Card>
  );
}

export function InstanceExperimentalSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("settings_"), href: "/company/settings" },
      { label: t("experimental") },
    ]);
  }, [setBreadcrumbs]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const toggleMutation = useMutation<
    InstanceExperimentalSettingsWithManaged,
    Error,
    PatchInstanceExperimentalSettings,
    { previousSettings?: InstanceExperimentalSettingsWithManaged }
  >({
    mutationFn: async (patch: PatchInstanceExperimentalSettings) =>
      instanceSettingsApi.updateExperimental(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instance.experimentalSettings });
      const previousSettings = queryClient.getQueryData<InstanceExperimentalSettingsWithManaged>(
        queryKeys.instance.experimentalSettings,
      );
      if (previousSettings) {
        queryClient.setQueryData<InstanceExperimentalSettingsWithManaged>(
          queryKeys.instance.experimentalSettings,
          { ...previousSettings, ...patch },
        );
      }
      return { previousSettings };
    },
    onSuccess: async (updatedSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, updatedSettings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all }),
        queryClient.invalidateQueries({ queryKey: ["built-in-agents"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error, _patch, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.instance.experimentalSettings, context.previousSettings);
      }
      setActionError(error instanceof Error ? error.message : t("failed_to_update_experimental_settings"));
    },
  });

  if (experimentalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loading_experimental_settings")}</div>;
  }

  if (experimentalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {experimentalQuery.error instanceof Error
          ? experimentalQuery.error.message
          : t("failed_to_load_experimental_settings")}
      </div>
    );
  }

  const inWorktree = isWorktreeRuntime();
  // Present only on cloud-managed instances: keys the managed overlay controls
  // render locked with the "Managed by Paperclip Cloud" badge. Self-hosted
  // responses carry no `managedKeys`, so every card stays editable.
  const managedKeys = experimentalQuery.data?.managedKeys ?? {};
  const enableWorktreeRunExecution = experimentalQuery.data?.enableWorktreeRunExecution === true;
  const worktreeRunExecutionManaged = managedKeys.enableWorktreeRunExecution?.managed === true;
  const worktreeRunExecutionState = resolveWorktreeRunExecutionDisplayState(
    experimentalQuery.data,
    getWorktreeInstanceId(),
  );
  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableNativeRunner = experimentalQuery.data?.enableNativeRunner === true;
  const enableManagedSandboxOnly = experimentalQuery.data?.enableManagedSandboxOnly === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  // Streamlined left navigation is now the standard sidebar (PAP-12472); the
  // experimental opt-out was retired, so it no longer surfaces a toggle here.
  const enableStreamlinedUi = experimentalQuery.data?.enableStreamlinedUi !== false;
  const enableConferenceRoomChat = experimentalQuery.data?.enableConferenceRoomChat === true;
  const enableClassicTaskInterface = experimentalQuery.data?.enableClassicTaskInterface === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableExperimentalFileViewer =
    experimentalQuery.data?.enableExperimentalFileViewer === true;
  const enableExternalObjects = experimentalQuery.data?.enableExternalObjects === true;
  const enableBuiltInAgents = experimentalQuery.data?.enableBuiltInAgents === true;
  const enableBetaSkills = experimentalQuery.data?.enableBetaSkills === true;
  const enableSummaries = experimentalQuery.data?.enableSummaries === true;
  const enableStatusCards = experimentalQuery.data?.enableStatusCards === true;
  const summariesManaged = managedKeys.enableSummaries?.managed === true;
  const statusCardsManaged = managedKeys.enableStatusCards?.managed === true;
  const statusCardsBlockedByManagedSummaries = summariesManaged && !enableSummaries;
  const summariesRequiredByManagedStatusCards = statusCardsManaged && enableStatusCards;
  const enableDecisions = experimentalQuery.data?.enableDecisions === true;
  const enableGoalsSidebarLink = experimentalQuery.data?.enableGoalsSidebarLink === true;
  const enableCases = experimentalQuery.data?.enableCases === true;
  const enableServerInfoDebugView = experimentalQuery.data?.enableServerInfoDebugView === true;
  const enablePaperclipDeveloperMode =
    experimentalQuery.data?.enablePaperclipDeveloperMode === true;
  const enableSimplifiedEnglishInteractions =
    experimentalQuery.data?.enableSimplifiedEnglishInteractions === true;
  const enableSmokeLab = experimentalQuery.data?.enableSmokeLab === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("experimental")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("opt_into_features_that_are_still_being_evaluated")}
        </p>
      </div>

      <div
        role="alert"
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{t("experimental_features_may_break_at_any_time")}</p>
            <p className="text-muted-foreground">
              {t("these_features_are_opt_in_and_come_with_no_compa")}
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="experimental-features-heading">
        <div className="space-y-1">
          <h2 id="experimental-features-heading" className="text-sm font-semibold">
            {t("experimental_features")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("optional_product_features_that_are_still_being_e")}
          </p>
        </div>

        <ExperimentalToggleCard
          title={t("beta_skills")}
          description={t("allow_agents_to_pin_beta_releases_of_the_papercl")}
          checked={enableBetaSkills}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBetaSkills: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBetaSkills"
          managed={managedKeys.enableBetaSkills}
          ariaLabel={t("toggle_beta_skills_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("built_in_agents")}
          description={t("show_paperclip_managed_built_in_agent_surfaces_i")}
          checked={enableBuiltInAgents}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBuiltInAgents: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBuiltInAgents"
          managed={managedKeys.enableBuiltInAgents}
          ariaLabel={t("toggle_built_in_agents_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("cases")}
          description={t("durable_work_products_blog_posts_tweet_storms_th")}
          footnote="Turning Cases off hides the tab and blocks the case API; existing case data is kept."
          checked={enableCases}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCases: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCases"
          managed={managedKeys.enableCases}
          ariaLabel={t("toggle_cases_experimental_setting")}
        />

        {SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING ? (
          <ExperimentalToggleCard
            title={t("conference_room_chat")}
            description={t("adds_a_conference_room_one_chat_where_you_and_yo")}
            checked={enableConferenceRoomChat}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableConferenceRoomChat: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableConferenceRoomChat"
            managed={managedKeys.enableConferenceRoomChat}
            ariaLabel={t("toggle_conference_room_chat_experimental_setting")}
          />
        ) : null}

        <ExperimentalToggleCard
          title={t("decisions")}
          description={t("show_the_decisions_item_in_the_main_sidebar_the")}
          checked={enableDecisions}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableDecisions: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableDecisions"
          managed={managedKeys.enableDecisions}
          ariaLabel={t("toggle_decisions_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("enable_environments")}
          description={t("show_environment_management_in_company_settings")}
          checked={enableEnvironments}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableEnvironments: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableEnvironments"
          managed={managedKeys.enableEnvironments}
          ariaLabel={t("toggle_environments_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("enable_external_objects")}
          description={t("detect_external_urls_in_issues_and_show_resolved")}
          checked={enableExternalObjects}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExternalObjects: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExternalObjects"
          managed={managedKeys.enableExternalObjects}
          ariaLabel={t("toggle_external_objects_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("enable_isolated_workspaces")}
          description={t("show_execution_workspace_controls_in_project_con")}
          checked={enableIsolatedWorkspaces}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableIsolatedWorkspaces: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableIsolatedWorkspaces"
          managed={managedKeys.enableIsolatedWorkspaces}
          ariaLabel={t("toggle_isolated_workspaces_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("experimental_file_viewer")}
          description={t("show_task_detail_controls_for_browsing_and_previ")}
          checked={enableExperimentalFileViewer}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExperimentalFileViewer: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExperimentalFileViewer"
          managed={managedKeys.enableExperimentalFileViewer}
          ariaLabel={t("toggle_experimental_file_viewer_setting")}
        />

        <ExperimentalToggleCard
          title={t("paperclip_runner")}
          description={t("allow_new_codex_agents_to_select_the_experimenta")}
          checked={enableNativeRunner}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableNativeRunner: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableNativeRunner"
          managed={managedKeys.enableNativeRunner}
          ariaLabel={t("toggle_paperclip_runner_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("simplified_english_interactions")}
          description={t("instruct_agents_to_write_user_interactions_plan")}
          checked={enableSimplifiedEnglishInteractions}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableSimplifiedEnglishInteractions: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableSimplifiedEnglishInteractions"
          managed={managedKeys.enableSimplifiedEnglishInteractions}
          ariaLabel={t("toggle_simplified_english_interactions_experimen")}
        />

        <ExperimentalToggleCard
          title={t("status_cards")}
          description={t("enable_the_experimental_shared_status_card_board")}
          footnote="Enabling Status Cards also enables Summaries."
          checked={enableStatusCards}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked
                ? { enableSummaries: true, enableStatusCards: true }
                : { enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || statusCardsBlockedByManagedSummaries}
          settingKey="enableStatusCards"
          managed={managedKeys.enableStatusCards}
          ariaLabel={t("toggle_status_cards_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("streamlined_ui")}
          description={t("use_the_simplified_main_sidebar_shared_tasks_and")}
          footnote="Turning this off restores the legacy shell and navigation. Task and page data are unchanged."
          checked={enableStreamlinedUi}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableStreamlinedUi: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableStreamlinedUi"
          managed={managedKeys.enableStreamlinedUi}
          ariaLabel={t("toggle_streamlined_ui_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("summaries")}
          description={t("show_summarizer_generated_status_slots_on_projec")}
          footnote="Status Cards requires Summaries. Disabling Summaries also disables Status Cards."
          checked={enableSummaries}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked || !enableStatusCards
                ? { enableSummaries: checked }
                : { enableSummaries: false, enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || summariesRequiredByManagedStatusCards}
          settingKey="enableSummaries"
          managed={managedKeys.enableSummaries}
          ariaLabel={t("toggle_summaries_experimental_setting")}
        />

      </section>

      <section className="space-y-3" aria-labelledby="developer-mode-heading">
        <div className="space-y-1">
          <h2 id="developer-mode-heading" className="text-sm font-semibold">
            {t("paperclip_developer_mode")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("internal_tools_for_developing_testing_and_debugg")}
          </p>
        </div>

        <ExperimentalToggleCard
          title={t("paperclip_developer_mode")}
          description={t("show_internal_paperclip_maintainer_tools_and_obs")}
          checked={enablePaperclipDeveloperMode}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enablePaperclipDeveloperMode: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enablePaperclipDeveloperMode"
          managed={managedKeys.enablePaperclipDeveloperMode}
          ariaLabel={t("toggle_paperclip_developer_mode_experimental_set")}
        />

        <ExperimentalToggleCard
          title={t("managed_environment_only")}
          description={t("hide_the_local_environment_and_run_all_agents_in")}
          checked={enableManagedSandboxOnly}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableManagedSandboxOnly: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableManagedSandboxOnly"
          managed={managedKeys.enableManagedSandboxOnly}
          ariaLabel={t("toggle_managed_environment_only_experimental_set")}
        />

        {inWorktree ? (
          <Card className="block bg-transparent p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{t("run_tasks_in_this_worktree")}</h3>
                    {worktreeRunExecutionManaged ? <ManagedByCloudBadge /> : null}
                  </div>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    {t("this_is_an_isolated_git_worktree_preview_instanc")}
                  </p>
                </div>
                <ToggleSwitch
                  checked={enableWorktreeRunExecution}
                  onCheckedChange={(checked) => {
                    if (worktreeRunExecutionManaged) return;
                    toggleMutation.mutate({ enableWorktreeRunExecution: checked });
                  }}
                  disabled={toggleMutation.isPending || worktreeRunExecutionManaged}
                  aria-label={t("toggle_worktree_run_execution_setting")}
                />
              </div>

              {worktreeRunExecutionState.kind === "armed" ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-foreground">
                  <Play className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    {t("running_tasks_created_after")}{" "}
                    <span className="font-medium">
                      {formatActivationTimestamp(worktreeRunExecutionState.activatedAt)}
                    </span>
                    .
                  </span>
                </div>
              ) : null}

              {worktreeRunExecutionState.kind === "fail_closed" ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">{t("execution_is_suppressed_effectively_off")}</p>
                    <p className="text-muted-foreground">
                      {worktreeRunExecutionState.reason === "instance_mismatch"
                        ? t("this_setting_was_armed_in_a_different_instance_a")
                        : t("this_setting_is_missing_its_activation_cutoff_so")}{" "}
                      {t("toggle_it_off_and_back_on_to_arm_execution_for_t")}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <ExperimentalToggleCard
          title={t("auto_restart_dev_server_when_idle")}
          description={t("in_pnpm_dev_once_wait_for_all_queued_and_running")}
          checked={autoRestartDevServerWhenIdle}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ autoRestartDevServerWhenIdle: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="autoRestartDevServerWhenIdle"
          managed={managedKeys.autoRestartDevServerWhenIdle}
          ariaLabel={t("toggle_guarded_dev_server_auto_restart")}
        />

        <ExperimentalToggleCard
          title={t("server_info_debug_view")}
          description={t("show_a_server_section_in_the_account_drawer_with")}
          checked={enableServerInfoDebugView}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableServerInfoDebugView: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableServerInfoDebugView"
          managed={managedKeys.enableServerInfoDebugView}
          ariaLabel={t("toggle_server_info_debug_view_experimental_setti")}
        />

        <ExperimentalToggleCard
          title={t("smoke_lab")}
          description={t("add_a_smoke_lab_tab_under_apps_developer_and_an")}
          checked={enableSmokeLab}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableSmokeLab: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableSmokeLab"
          managed={managedKeys.enableSmokeLab}
          ariaLabel={t("toggle_smoke_lab_experimental_setting")}
        />

        <ExperimentalToggleCard
          title={t("task_plan_decomposition")}
          description={t("show_accepted_plan_decomposition_history_on_task")}
          checked={enableIssuePlanDecompositions}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableIssuePlanDecompositions: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableIssuePlanDecompositions"
          managed={managedKeys.enableIssuePlanDecompositions}
          ariaLabel={t("toggle_task_plan_decomposition_panel_experimenta")}
        />
      </section>

      <section className="space-y-3" aria-labelledby="legacy-heading">
        <div className="space-y-1">
          <h2 id="legacy-heading" className="text-sm font-semibold">
            {t("legacy")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("these_features_are_going_to_be_removed")}</p>
        </div>

        <ExperimentalToggleCard
          title={t("classic_task_interface")}
          description={t("restores_the_previous_task_detail_page_the_page")}
          footnote="Switching takes effect immediately. No task data is affected."
          checked={enableClassicTaskInterface}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableClassicTaskInterface: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableClassicTaskInterface"
          managed={managedKeys.enableClassicTaskInterface}
          ariaLabel={t("toggle_classic_task_interface_experimental_setti")}
        />

        <ExperimentalToggleCard
          title={t("goals_sidebar_link")}
          description={t("restore_the_goals_item_in_the_main_sidebar_while")}
          checked={enableGoalsSidebarLink}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableGoalsSidebarLink: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableGoalsSidebarLink"
          managed={managedKeys.enableGoalsSidebarLink}
          ariaLabel={t("toggle_goals_sidebar_link_experimental_setting")}
        />
      </section>
    </div>
  );
}
