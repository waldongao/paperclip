import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ShieldQuestion, X } from "lucide-react";
import type { ToolActionRequestListItem } from "@paperclipai/shared";
import { humanizeConnectionDisplayName } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { timeAgo } from "@/lib/timeAgo";
import { toolsApi } from "@/api/tools";
import { Button } from "@/components/ui/button";
import { MarkdownBody } from "@/components/MarkdownBody";
import { t, useTranslation } from "@/i18n";

/**
 * "Ask first" review queue (M1b float / M9 card, PAP-10859).
 *
 * Renders pending `tool_action_requests` as prosumer cards with three choices:
 *   • Allow once   → approve this single request
 *   • Always allow → approve + create a trust rule (won't ask again)
 *   • Decline      → reject this request
 *
 * Pass `connectionId` to scope the queue to a single app (App detail); omit it
 * to show every pending request (Needs attention page).
 */
export function ReviewQueueCard({
  connectionId,
  emptyState = "hidden",
  heading = t("waiting_for_your_ok_9911c4"),
  plain = false,
}: {
  connectionId?: string;
  emptyState?: "hidden" | "reassure";
  heading?: string;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();

  const query = useQuery({
    queryKey: queryKeys.tools.actionRequests(selectedCompanyId ?? "__none__", "pending"),
    queryFn: () => toolsApi.listActionRequests(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
    refetchInterval: 20_000,
  });

  const items = useMemo(() => {
    const all = query.data?.actionRequests ?? [];
    return connectionId ? all.filter((item) => item.connectionId === connectionId) : all;
  }, [query.data, connectionId]);

  if (!selectedCompanyId) return null;
  if (query.isLoading) return null;

  if (items.length === 0) {
    if (emptyState === "hidden") return null;
    return (
      <div className={plain ? "py-5 text-sm text-muted-foreground" : "rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"}>
        {t("nothing_is_waiting_for_your_ok_right_now")}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-bold text-foreground">{heading}</h2>
        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          {items.length}
        </span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <ReviewRow key={item.request.id} companyId={selectedCompanyId} item={item} plain={plain} />
        ))}
      </div>
    </section>
  );
}

function ReviewRow({
  companyId,
  item,
  plain,
}: {
  companyId: string;
  item: ToolActionRequestListItem;
  plain: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [resolving, setResolving] = useState<null | "allow" | "always" | "decline">(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tools.actionRequests(companyId, "pending") });
    queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(companyId) });
  };

  const allowOnce = useMutation({
    mutationFn: () => toolsApi.approveActionRequest(companyId, item.request.id),
    onMutate: () => setResolving("allow"),
    onSuccess: () => {
      pushToast({ title: t("allowed_once"), body: t("zhPages.9cad6d86e86e", { item: actionLabel(item) }), tone: "success" });
      invalidate();
    },
    onError: (error) => {
      invalidate();
      failToast(pushToast, error);
    },
    onSettled: () => setResolving(null),
  });

  const alwaysAllow = useMutation({
    mutationFn: async () => {
      const approved = await toolsApi.approveActionRequest(companyId, item.request.id);
      await toolsApi.createTrustRuleFromActionRequest(companyId, item.request.id, { approvalThreshold: 1 });
      return approved;
    },
    onMutate: () => setResolving("always"),
    onSuccess: () => {
      pushToast({
        title: t("always_allowed"),
        body: t("zhPages.479a6e8887f4", { item: actionLabel(item) }),
        tone: "success",
      });
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.trustRules(companyId) });
    },
    onError: (error) => {
      invalidate();
      failToast(pushToast, error);
    },
    onSettled: () => setResolving(null),
  });

  const decline = useMutation({
    mutationFn: () => toolsApi.declineActionRequest(companyId, item.request.id),
    onMutate: () => setResolving("decline"),
    onSuccess: () => {
      pushToast({ title: t("declined"), body: t("zhPages.43c8e85be5f5", { item: actionLabel(item) }), tone: "info" });
      invalidate();
    },
    onError: (error) => {
      invalidate();
      failToast(pushToast, error);
    },
    onSettled: () => setResolving(null),
  });

  const busy = resolving !== null;
  const preview = item.request.previewMarkdown?.trim();

  return (
    <div className={plain ? "py-3" : "rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4"}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-bold text-foreground">{actionLabel(item)}</span>
        {item.applicationName && (
          <span className="text-muted-foreground">{t("zhPages.582967534d0f")}{humanizeConnectionDisplayName(item.applicationName)}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{t("asked_32b89b")} {timeAgo(item.request.createdAt)}</span>
      </div>

      {preview ? (
        <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <MarkdownBody>{preview}</MarkdownBody>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("an_agent_wants_to_run_this_action_it_can_change")}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => allowOnce.mutate()} disabled={busy}>
          {resolving === "allow" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
          {t("allow_once")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => alwaysAllow.mutate()} disabled={busy}>
          {resolving === "always" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {t("always_allow")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => decline.mutate()} disabled={busy}>
          {resolving === "decline" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1.5 h-3.5 w-3.5" />}
          {t("decline")}
        </Button>
      </div>
    </div>
  );
}

function actionLabel(item: ToolActionRequestListItem): string {
  if (!item.toolTitle && !item.toolName) return t("this_action");
  return humanizeConnectionDisplayName(item.toolName ?? "", { title: item.toolTitle });
}

function failToast(
  pushToast: ReturnType<typeof useToast>["pushToast"],
  error: unknown,
) {
  pushToast({
    title: t("couldn_t_save_that"),
    body: error instanceof Error ? error.message : t("please_try_again"),
    tone: "error",
  });
}
