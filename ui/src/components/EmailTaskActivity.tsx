import { t } from "@/i18n";
import { EmailMessageCard } from "./EmailMessageCard";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emailApi } from "@/api/email";
import { useEmailThread } from "@/hooks/useEmailThread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmailPublicationSummary } from "@paperclipai/shared";

// Email actions belong to the agent's task conversation. Only surface mail
// without a task comment yet and delivery outcomes that need attention here.
export function EmailTaskActivity({
  companyId,
  issueId,
}: {
  companyId: string;
  issueId: string;
}) {
  const cache = useQueryClient();
  const threadKey = ["email-thread", companyId, issueId];
  const queryEnabled = Boolean(companyId && issueId) && !issueId.startsWith("chat:");
  const thread = useEmailThread(companyId, issueId);
  if (!queryEnabled) return null;
  const data = thread.data;
  const messages = data?.messages.filter((m) => !m.commentId) ?? [];
  const publications = data?.publications.filter(
    (p) => !p.providerMessageId || p.outcome === "uncertain",
  ) ?? [];
  if (!thread.error && !messages.length && !publications.length) return null;
  return (
    <div className="space-y-3">
      {thread.error && (
        <p role="alert" className="text-sm text-destructive">
          {thread.error.message}
        </p>
      )}
      {messages.map((m) => (
        <EmailMessageCard
          key={m.id}
          issueId={issueId}
          message={m}
          publication={data?.publications.find(
            (p) => p.providerMessageId === m.providerMessageId,
          )}
        />
      ))}
      {publications.map((p) => (
        <EmailDelivery
          key={p.id}
          companyId={companyId}
          publication={p}
          onResolved={() => {
            void cache.invalidateQueries({ queryKey: threadKey });
          }}
        />
      ))}
    </div>
  );
}

function EmailDelivery({
  companyId,
  publication: p,
  onResolved,
}: {
  companyId: string;
  publication: EmailPublicationSummary;
  onResolved: () => void;
}) {
  const [messageId, setMessageId] = useState("");
  const resolve = useMutation({
    mutationFn: (outcome: "sent" | "failed") =>
      emailApi.resolve(companyId, p.id, outcome, messageId || undefined),
    onSuccess: onResolved,
  });
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      {p.request && !p.providerMessageId && (
        <article
          aria-label={t("stability.5cd558440d10", { defaultValue: "Email send intent" })}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <p className="font-semibold">{p.request.subject ?? t("stability.ef902e386028", { defaultValue: "Email reply" })}</p>
          {p.request.to && <p>{t("stability.2b5fc5c94f64", { defaultValue: "To:" })}{" "}{p.request.to.join(", ")}</p>}
          <div className="whitespace-pre-wrap break-words text-sm text-foreground">
            {p.request.text}
          </div>
        </article>
      )}
      <p>{t("profile.email")}{" "}{p.outcome}
        {p.error ? ` — ${p.error}` : ""}
      </p>
      {p.outcome === "uncertain" && (
        <details>
          <summary className="cursor-pointer">{t("stability.457318724b32", { defaultValue: "Resolve delivery after checking AgentMail" })}</summary>
          <div className="space-y-2 py-2">
            <p>{t("stability.0e8704013507", { defaultValue: "Confirm the outcome in AgentMail before resolving. This action does not resend." })}</p>
            <Input
              aria-label={t("stability.c250cfdf994a", { defaultValue: "Provider message ID" })}
              value={messageId}
              onChange={(e) => setMessageId(e.target.value)}
              placeholder={t("stability.c250cfdf994a", { defaultValue: "Provider message ID" })}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!messageId || resolve.isPending}
                onClick={() => resolve.mutate("sent")}
              >{t("stability.a1913b58f2df", { defaultValue: "Confirm sent" })}</Button>
              <Button
                size="sm"
                variant="outline"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate("failed")}
              >{t("stability.e948b4c3c1a3", { defaultValue: "Confirm not sent" })}</Button>
            </div>
            {resolve.error && (
              <p role="alert" className="text-destructive">
                {resolve.error.message}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
