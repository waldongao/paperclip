import { t } from "@/i18n";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { chatEndpointsApi, type ChatProvider } from "@/api/chatEndpoints";
import { healthApi } from "@/api/health";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryKeys";
import { Navigate, useSearchParams } from "@/lib/router";

const providerNames: Record<ChatProvider, string> = {
  slack: "Slack",
  github: "GitHub",
  discord: "Discord",
  "microsoft-teams": "Microsoft Teams",
  telegram: "Telegram",
  agentmail: "AgentMail",
  "imessage-photon": "iMessage Photon",
};

export function ChatIdentityConfirm() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [confirmed, setConfirmed] = useState(false);
  const health = useQuery({ queryKey: queryKeys.health, queryFn: healthApi.get, retry: false });
  const local = health.data?.deploymentMode === "local_trusted";
  const session = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["chat-identity-link-preview", token],
    queryFn: () => chatEndpointsApi.previewIdentityLink(token),
    enabled: token.length >= 32 && (local || Boolean(session.data)),
    refetchInterval: confirmed ? false : 3_000,
    retry: false,
  });
  const confirm = useMutation({
    mutationFn: () => chatEndpointsApi.confirmIdentityLink(token),
    onSuccess: () => setConfirmed(true),
  });

  const requestAccess = useMutation({
    mutationFn: () => chatEndpointsApi.requestIdentityAccess(token),
  });
  if (health.isError || (!local && session.isError)) return <main className="mx-auto max-w-lg px-6 py-12 text-sm text-destructive">{t("stability.8f5cf3dfc468", { defaultValue: "Couldn't load your account. Refresh to try again." })}</main>;
  if (health.isSuccess && !local && session.isSuccess && !session.data) {
    return <Navigate to={`/auth?next=${encodeURIComponent(`/chat-identity/confirm?token=${token}`)}`} replace />;
  }
  if (token.length < 32 || (!confirmed && preview.isError)) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-6 py-12">
        <h1 className="text-xl font-bold">{t("stability.4f759618376d", { defaultValue: "This identity link is unavailable" })}</h1>
        <p className="text-sm text-muted-foreground">{t("stability.1278a4a2aad5", { defaultValue: "The link is invalid, expired, already used, or belongs to another Paperclip organization." })}</p>
      </main>
    );
  }
  if (health.isPending || preview.isLoading || (!local && session.isLoading) || !preview.data) {
    return (
      <main className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />{t("stability.b27af017f568", { defaultValue: "Checking identity link…" })}</main>
    );
  }
  const identity = preview.data;
  const paperclipAccount = local ? "Local Board" :
    session.data?.user.name?.trim() ||
    session.data?.user.email?.trim() ||
    session.data?.user.id ||
    "the signed-in account";
  if (confirmed) {
    return (
      <main className="mx-auto max-w-lg space-y-5 px-6 py-12">
        <CheckCircle2 className="h-8 w-8" />
        <div>
          <h1 className="text-xl font-bold">{t("stability.ce755132aac6", { defaultValue: "Identity linked" })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("stability.5e527e300910", { defaultValue: "Future messages from" })}{" "}{identity.externalLabel}{" "}{t("stability.a861a24afdad", { defaultValue: "use your current Paperclip permissions in" })}{" "}{identity.companyName}.
          </p>
        </div>
        {identity.provider === "slack" && <Button asChild><a href="https://app.slack.com/" target="_blank" rel="noopener noreferrer">{t("stability.b460e2df41b2", { defaultValue: "Return to Slack" })}</a></Button>}
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
      <div>
        <p className="text-sm text-muted-foreground">{identity.companyName}</p>
        <h1 className="mt-1 text-xl font-bold">{t("stability.61da1fc184b0", { defaultValue: "Link your external identity" })}</h1>
      </div>
      <dl className="divide-y divide-border border-y border-border">
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("provider")}</dt>
          <dd className="text-sm font-medium">
            {providerNames[identity.provider]}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("stability.22da53532972", { defaultValue: "External identity" })}</dt>
          <dd className="text-right text-sm font-medium">
            {identity.externalLabel}
            {identity.externalDetail ? ` · ${identity.externalDetail}` : ""}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("stability.deb2783e82b1", { defaultValue: "Paperclip account" })}</dt>
          <dd className="text-right text-sm font-medium">{paperclipAccount}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("agent_5ce2e6")}</dt>
          <dd className="text-sm font-medium">
            {identity.botLabel ?? t("stability.b2cc8a552ae2", { defaultValue: "Paperclip agent" })}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{t("stability.ca472eb0ecea", { defaultValue: "Confirm only if this is your" })}{" "}{providerNames[identity.provider]}{" "}{t("stability.5ae51bfb89a7", { defaultValue: "identity. Paperclip will check your current organization membership on every action." })}</p>
      {confirm.isError && (
        <p className="text-sm text-destructive">{t("stability.bdb905e514f3", { defaultValue: "This link could not be confirmed. It may have expired or been revoked." })}</p>
      )}
      {identity.canConfirm === false ? (
        <div className="space-y-3">
          <p className="text-sm">{t("stability.48ab15945617", { defaultValue: "You need membership in" })}{" "}{identity.companyName}{" "}{t("stability.8fbf90f9ed24", { defaultValue: "before linking this account." })}</p>
          {requestAccess.isSuccess ? <p role="status" className="text-sm">{t("stability.817b7731dd8b", { defaultValue: "Access requested. An admin can approve it in Paperclip. After approval, return here to confirm; if this link expires, send the connect command in Slack again." })}</p>
            : <Button disabled={requestAccess.isPending || !identity.selfService} onClick={() => requestAccess.mutate()}>{t("stability.b06f1662da4a", { defaultValue: "Request access" })}</Button>}
          {requestAccess.isError && <p role="alert" className="text-sm text-destructive">{t("stability.c37a83301f30", { defaultValue: "Couldn't request access. The link may have expired. Send the connect command again and retry." })}</p>}
        </div>
      ) : <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>
        {confirm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t("stability.094d10c2dc1f", { defaultValue: "Confirm identity" })}</Button>}
    </main>
  );
}
