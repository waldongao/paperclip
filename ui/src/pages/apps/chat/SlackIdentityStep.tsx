import { t } from "@/i18n";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/clipboard";
import { queryKeys } from "@/lib/queryKeys";

export function SlackIdentityStep({ endpointId, command, testStartedAt, onConnected, onSaveExit }: {
  endpointId: string;
  command: string;
  testStartedAt?: string | null;
  onConnected: () => void;
  onSaveExit: () => void;
}) {
  const client = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const session = useQuery({ queryKey: queryKeys.auth.session, queryFn: authApi.getSession, retry: false });
  const health = useQuery({ queryKey: queryKeys.health, queryFn: healthApi.get });
  const identities = useQuery({
    queryKey: queryKeys.chatEndpoints.principals(endpointId),
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
    refetchInterval: 1_500,
  });
  const local = health.data?.deploymentMode === "local_trusted";
  const userId = local ? "local-board" : session.data?.user.id;
  const userLabel = local ? "Local Board" : session.data?.user.name || session.data?.user.email;
  const candidates = (identities.data ?? []).filter((identity) => identity.lastConnectAt &&
    (!testStartedAt || Date.parse(identity.lastConnectAt) >= Date.parse(testStartedAt)));
  const linkedToMe = candidates.some((identity) => identity.status === "linked" && identity.paperclipUserId === userId);
  const connectCommand = `${command} connect`;
  const link = useMutation({
    mutationFn: async (principalId: string) => {
      const { confirmationUrl } = await chatEndpointsApi.createLinkIntent(endpointId, principalId);
      const token = new URL(confirmationUrl, window.location.origin).searchParams.get("token");
      if (!token) throw new Error("Could not create the account confirmation. Try again.");
      await chatEndpointsApi.confirmIdentityLink(token);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.chatEndpoints.principals(endpointId) }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{t("stability.afd67dc63f4e", { defaultValue: "Connect your Slack account" })}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("stability.9520c9cac5f6", { defaultValue: "Send this command in Slack so we can identify your account. It won't start agent work." })}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <code className="text-sm">{connectCommand}</code>
        <Button variant="ghost" size="sm" onClick={() => {
          void copyTextToClipboard(connectCommand).then(() => { setCopied(true); setCopyError(false); }, () => setCopyError(true));
        }}><Copy className="size-4" />{copied ? t("copied") : t("stability.9a01feecae67", { defaultValue: "Copy command" })}</Button>
      </div>
      {copyError && <p role="alert" className="text-sm text-destructive">{t("stability.e3ad572bedbb", { defaultValue: "Couldn't copy the command. Select and copy it above." })}</p>}
      <p className="text-sm">
        <a href="https://app.slack.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("stability.4ddf02a36df5", { defaultValue: "Open Slack" })}{" "}<ExternalLink className="inline size-3" /></a>{t("stability.60046ba6527e", { defaultValue: ", send the command in your workspace, then return here." })}</p>
      {identities.isError ? (
        <p role="alert" className="text-sm text-destructive">{t("stability.a06f0b4000ae", { defaultValue: "Couldn't check for your Slack account. We'll keep trying." })}</p>
      ) : candidates.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("stability.beec86add7a0", { defaultValue: "Waiting for your connect command…" })}</p>
      ) : (
        <div className={`space-y-3 rounded-lg border p-4 ${linkedToMe
          ? "border-(--status-task-done)/30 bg-(--status-task-done)/10"
          : "border-(--status-task-todo)/30 bg-(--status-task-todo)/10"}`}>
          <p className="text-sm">{t("stability.b2acc5586959", { defaultValue: "Choose your Slack account below to link it to" })}{" "}<strong>{userLabel ?? t("stability.3dc48813f2b6", { defaultValue: "your Paperclip account" })}</strong>. Only confirm an account that belongs to you. Future messages will use your Paperclip permissions.</p>
          {candidates.map((identity) => {
            const mine = identity.status === "linked" && identity.paperclipUserId === userId;
            return (
              <div key={identity.principalId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{identity.externalLabel}</p>
                  <p className="text-xs text-muted-foreground">{identity.externalDetail}</p>
                </div>
                {mine ? <p role="status" className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-(--status-task-done)" />{t("stability.a485693868f5", { defaultValue: "Linked to you" })}</p>
                  : identity.status === "linked" ? <p className="text-sm text-muted-foreground">{t("stability.38c72375a637", { defaultValue: "Linked to" })}{" "}{identity.paperclipUserLabel ?? t("stability.823087d6921f", { defaultValue: "another Paperclip account" })}</p>
                  : <Button variant="outline" disabled={!userId || link.isPending} onClick={() => link.mutate(identity.principalId)} aria-label={t("stability.71814d2974d9", { value1: identity.externalLabel, defaultValue: "Link {{value1}} to my Paperclip account" })}>
                    {link.isPending && link.variables === identity.principalId && <Loader2 className="size-4 animate-spin" />}{t("stability.06e7c1bbccb5", { defaultValue: "This is my Slack account" })}</Button>}
              </div>
            );
          })}
        </div>
      )}
      {!userId && !session.isPending && !health.isPending && <p role="alert" className="text-sm text-destructive">{t("stability.2de04321ef82", { defaultValue: "Sign in to Paperclip to link your Slack account. Refresh this page after signing in." })}</p>}
      {link.isError && <p role="alert" className="text-sm text-destructive">{t("stability.cc619f33991c", { defaultValue: "Couldn't link your account. Check that you are a member of this company and try again." })}</p>}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" className="text-muted-foreground" onClick={onSaveExit}>{t("stability.0bd63bf3d32e", { defaultValue: "Save & exit" })}</Button>
        {linkedToMe && <Button onClick={onConnected}>{t("stability.4e1133bf1303", { defaultValue: "Continue to message test" })}</Button>}
      </div>
    </div>
  );
}
