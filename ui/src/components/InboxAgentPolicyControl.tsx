import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, LoaderCircle, Save } from "lucide-react";
import type { InboxAgentPolicy, InboxAgentPolicyMode } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { inboxAgentPolicyApi } from "@/api/inbox-agent-policy";
import { queryKeys } from "@/lib/queryKeys";
import { isAgentTaskTarget } from "@/lib/company-members";
import { AgentMultiSelect } from "@/components/AgentMultiSelect";
import { Button } from "@/components/ui/button";
import { RadioCardGroup, type RadioCardOption } from "@/components/ui/radio-card";
import { t, useTranslation } from "@/i18n";

const MODE_OPTIONS: RadioCardOption[] = [
  {
    value: "open",
    title: t("any_of_my_agents"),
    description: t("let_any_agent_you_manage_archive_tasks_out_of_yo"),
  },
  {
    value: "allowlist",
    title: t("only_chosen_agents"),
    description: t("restrict_inbox_tidying_to_the_agents_you_pick_be"),
  },
  {
    value: "disabled",
    title: t("off"),
    description: t("agents_can_never_archive_tasks_from_your_inbox"),
  },
];

function policyKey(mode: InboxAgentPolicyMode, allowedAgentIds: string[]): string {
  return `${mode}:${[...allowedAgentIds].sort().join(",")}`;
}

interface Draft {
  mode: InboxAgentPolicyMode;
  allowedAgentIds: string[];
}

/**
 * "Let agents tidy my inbox" user-settings control. A single
 * three-state policy — `open` / `allowlist` / `disabled` — round-tripped through
 * the per-user endpoints. When `allowlist` is selected the user picks which
 * of their agents may archive. The one-click Undo/Unarchive affordance and the
 * "Archived by …" attribution live elsewhere (inbox rows / properties pane).
 */
export function InboxAgentPolicyControl({ companyId }: { companyId: string | null | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const lastServerKeyRef = useRef<string | null>(null);

  const policyQuery = useQuery({
    queryKey: companyId ? queryKeys.inboxAgentPolicy.mine(companyId) : ["inbox-agent-policy", "none"],
    queryFn: () => inboxAgentPolicyApi.getMine(companyId!),
    enabled: !!companyId,
  });
  const policy = policyQuery.data;

  const agentsQuery = useQuery({
    queryKey: companyId ? queryKeys.agents.list(companyId) : ["agents", "none"],
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });
  const selectableAgents = useMemo(
    () => (agentsQuery.data ?? []).filter(isAgentTaskTarget),
    [agentsQuery.data],
  );
  const agentOptions = useMemo(
    () => selectableAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      title: agent.title ?? agent.role,
      icon: agent.icon,
    })),
    [selectableAgents],
  );
  const selectedAgentIds = useMemo(
    () => new Set(draft?.allowedAgentIds ?? []),
    [draft?.allowedAgentIds],
  );

  // Adopt server state on first load, or on refetch when the user has not
  // diverged from the previously-synced snapshot (so a background refetch never
  // clobbers pending edits).
  useEffect(() => {
    if (!policy) return;
    const serverKey = policyKey(policy.mode, policy.allowedAgentIds);
    setDraft((current) => {
      if (current === null || policyKey(current.mode, current.allowedAgentIds) === lastServerKeyRef.current) {
        return { mode: policy.mode, allowedAgentIds: policy.allowedAgentIds };
      }
      return current;
    });
    lastServerKeyRef.current = serverKey;
  }, [policy]);

  const updateMutation = useMutation({
    mutationFn: (next: Draft) =>
      inboxAgentPolicyApi.updateMine(companyId!, {
        mode: next.mode,
        allowedAgentIds: next.mode === "allowlist" ? next.allowedAgentIds : [],
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData<InboxAgentPolicy>(queryKeys.inboxAgentPolicy.mine(companyId!), saved);
    },
  });

  const isDirty = Boolean(
    draft && policy && policyKey(draft.mode, draft.allowedAgentIds) !== policyKey(policy.mode, policy.allowedAgentIds),
  );

  if (policyQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {policyQuery.error instanceof Error ? policyQuery.error.message : t("failed_to_load_inbox_agent_policy")}
      </div>
    );
  }

  if (policyQuery.isLoading || !draft) {
    return <div className="text-sm text-muted-foreground">{t("loading_inbox_agent_policy")}</div>;
  }

  return (
    <section className="space-y-4" aria-label={t("let_agents_tidy_my_inbox")}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t("let_agents_tidy_my_inbox")}</h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("choose_whether_the_agents_you_manage_may_archive")}
        </p>
      </div>

      <RadioCardGroup
        ariaLabel={t("inbox_agent_archiving_policy")}
        value={draft.mode}
        onValueChange={(value) => setDraft((current) => (current ? { ...current, mode: value as InboxAgentPolicyMode } : current))}
        options={MODE_OPTIONS}
        className="max-w-2xl"
      />

      {draft.mode === "allowlist" ? (
        <div className="max-w-2xl space-y-2">
          <div className="text-sm font-medium">{t("agents_allowed_to_tidy_my_inbox")}</div>
          <AgentMultiSelect
            agents={agentOptions}
            selectedAgentIds={selectedAgentIds}
            onChange={(next) =>
              setDraft((current) =>
                current ? { ...current, allowedAgentIds: [...next] } : current,
              )
            }
            triggerLabel={
              selectedAgentIds.size === 0
                ? t("select_agents")
                : t("zhComponents.message_a7b5d66b83", { count: selectedAgentIds.size, value1: selectedAgentIds.size })
            }
            triggerFullWidth={false}
            showSelectionPreview={false}
            emptyMessage={t("you_don_t_manage_any_agents_yet")}
          />
        </div>
      ) : null}

      {updateMutation.error ? (
        <div className="max-w-2xl rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {updateMutation.error instanceof Error ? updateMutation.error.message : t("failed_to_save_inbox_agent_policy")}
        </div>
      ) : null}

      <div className="flex max-w-2xl items-center justify-end gap-3">
        {updateMutation.isSuccess && !isDirty ? (
          <span className="text-xs text-muted-foreground" role="status">{t("saved")}</span>
        ) : null}
        <Button
          type="button"
          disabled={!isDirty || updateMutation.isPending}
          onClick={() => draft && updateMutation.mutate(draft)}
        >
          {updateMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {updateMutation.isPending ? t("saving_56a228") : t("save")}
        </Button>
      </div>
    </section>
  );
}
