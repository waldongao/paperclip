import { t } from "@/i18n";
import { Link } from "react-router-dom";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  SlackSearchStatus,
  SlackToolCapabilities,
} from "@paperclipai/shared";
import { slackToolsApi } from "@/api/slackTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SlackCapabilitiesView({
  capabilities,
  error,
}: {
  capabilities?: SlackToolCapabilities;
  error?: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("stability.192c25289bd0", { defaultValue: "Slack tools" })}</h3>
      <p className="text-sm">{t("stability.b6286a432fa1", { defaultValue: "Invite the bot to a channel, then ask it to read the discussion and act on it. Only linked people can direct these tools." })}</p>
      <p className="text-sm text-muted-foreground">{t("stability.deea995a561a", { defaultValue: "The agent can read channels shared by the bot and the requester, even when responses are disabled there. Allowed Channels below controls replies and writes. Private research stays in its source channel or your DM with the bot." })}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!capabilities && !error && (
        <p role="status" className="text-sm text-muted-foreground">{t("stability.d85521cb24d0", { defaultValue: "Checking Slack permissions…" })}</p>
      )}
      {capabilities && (
        <>
          <ul className="space-y-2 text-sm">
            <li>{t("stability.9ab0409ccc65", { defaultValue: "Read channels, threads, messages, files and source links; search available channel history." })}</li>
            <li>{t("stability.64d0b04e2d3b", { defaultValue: "Send messages and files, react, pin, bookmark, and work with canvases and lists." })}</li>
            <li>{t("stability.a8caa4712d5a", { defaultValue: "Creating channels, inviting people and destructive changes require approval." })}</li>
          </ul>
          {capabilities.missingScopes.length > 0 && (
            <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
              <p className="text-sm font-medium">{t("stability.a716eb3e29fb", { defaultValue: "Add permissions to unlock more tools" })}</p>
              <p className="text-sm">{t("stability.090a1069c85c", { defaultValue: "Your existing connection still works. In" })}{" "}
                <a
                  className="underline underline-offset-4"
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noreferrer"
                >{t("stability.d811efd520ae", { defaultValue: "Slack app settings" })}</a>{t("stability.4e7c59382e8c", { defaultValue: ", choose your app, open OAuth & Permissions, add these Bot Token Scopes, then reinstall the app to your workspace." })}</p>
              <p className="text-xs font-mono break-words">
                {capabilities.missingScopes.join(", ")}
              </p>
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t("stability.c1e8c89862b6", { defaultValue: "Tool permissions and availability" })}</summary>
            <ul className="mt-3 divide-y divide-border">
              {capabilities.tools.map((tool) => (
                <li
                  key={tool.name}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span>
                    {tool.name.replace(/^slack_/, "").replaceAll("_", " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tool.available === false
                      ? t("stability.fa8dc2e4876b", { defaultValue: "Needs permissions" })
                      : tool.available === null
                        ? t("stability.151339072593", { defaultValue: "Not verified" })
                        : tool.risk === "approval"
                          ? t("ask_first")
                          : t("zhComponents.protocolFields.available")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <p className="text-xs text-muted-foreground">{t("stability.1b5d79b204d2", { defaultValue: "Slack plan, membership and per-action permissions still apply. Native search availability depends on the app and runtime; history scans report what they inspected." })}</p>
        </>
      )}
    </section>
  );
}

export function SlackSearchView({
  status,
  onConnect,
  onDisconnect,
  onConfigure,
}: {
  status: SlackSearchStatus;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onConfigure: (input: {
    clientId: string;
    clientSecret: string;
  }) => Promise<void>;
}) {
  const id = useId();
  const [clientId, setClientId] = useState(status.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update Slack search",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("stability.c49a014b0e92", { defaultValue: "Your Slack search access" })}</h3>
      <p className="text-sm text-muted-foreground">{t("stability.5d5b66af4990", { defaultValue: "Optional personal authorization enables private search on supported runtimes. It cannot read channels the bot hasn’t joined or let the bot write as you. Basic channel reading works without it." })}</p>
      {!status.nativeSearchAvailable && (
        <p role="status" className="text-sm text-muted-foreground">
          {status.limitation}
        </p>
      )}
      {status.connected ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t("stability.7ce7998d7058", { defaultValue: "Slack search connected" })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void perform(onDisconnect)}
          >{t("stability.1ae291964c7b", { defaultValue: "Disconnect search" })}</Button>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={pending || !status.configured}
          onClick={() => void perform(onConnect)}
        >{t("stability.e8b57c084f02", { defaultValue: "Connect Slack search" })}</Button>
      )}
      {!status.configured && (
        <p className="text-sm text-muted-foreground">{t("stability.c83c40760e29", { defaultValue: "A connection manager needs to configure your Slack app’s OAuth credentials first." })}</p>
      )}
      {status.canConfigure && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("stability.ee4c0f2a349c", { defaultValue: "OAuth app configuration for connection managers" })}</summary>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await onConfigure({ clientId, clientSecret });
                setClientSecret("");
              });
            }}
          >
            <p className="text-sm">{t("stability.a1453f1f7dba", { defaultValue: "In Slack app settings, add this redirect URL under OAuth & Permissions. Add user scopes" })}{" "}<code>search:read.public</code>,{" "}
              <code>search:read.private</code>{" "}{t("zhComponents.text_cffa50a32c")}{" "}
              <code>search:read.files</code>. Find Client ID and Client Secret
              under Basic Information.
            </p>
            <p className="text-xs font-mono break-all">
              {status.redirectUri ?? t("stability.a5716c99bdb7", { defaultValue: "Configure a public HTTPS URL first." })}
            </p>
            <div className="space-y-2">
              <label htmlFor={`${id}-client`}>{t("client_id")}</label>
              <Input
                id={`${id}-client`}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={`${id}-secret`}>{t("stability.ae21cf6d24b8", { defaultValue: "Client Secret" })}</label>
              <Input
                id={`${id}-secret`}
                type="password"
                autoComplete="new-password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={pending || !clientId || !clientSecret}
              >{t("stability.37b148485378", { defaultValue: "Save OAuth configuration" })}</Button>
            </div>
          </form>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
export function SlackToolsSettings({
  companyId,
  endpointId,
  connectionId,
}: {
  companyId: string;
  endpointId: string;
  connectionId?: string | null;
}) {
  const query = useQuery({
    queryKey: ["slack-capabilities", companyId, endpointId],
    queryFn: () => slackToolsApi.capabilities(companyId, endpointId),
    staleTime: 60_000,
  });
  return (
    <div className="space-y-3">
      <SlackCapabilitiesView
        capabilities={query.data}
        error={query.error?.message}
      />
      {connectionId && (
        <Link
          className="text-sm underline underline-offset-4"
          to={`/apps/${connectionId}/permissions`}
        >{t("stability.94d9b7f3ceeb", { defaultValue: "Manage action permissions" })}</Link>
      )}
    </div>
  );
}
export function SlackSearchAccess({
  companyId,
  endpointId,
}: {
  companyId: string;
  endpointId: string;
}) {
  const query = useQuery({
    queryKey: ["slack-search", companyId, endpointId],
    queryFn: () => slackToolsApi.search(companyId, endpointId),
  });
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {query.error.message}
      </p>
    );
  if (!query.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">{t("stability.20c6a0280b6b", { defaultValue: "Loading search access…" })}</p>
    );
  return (
    <SlackSearchView
      status={query.data}
      onConnect={async () => {
        const result = await slackToolsApi.connect(companyId, endpointId);
        window.location.assign(result.url);
      }}
      onDisconnect={async () => {
        await slackToolsApi.disconnect(companyId, endpointId);
        await query.refetch();
      }}
      onConfigure={async (input) => {
        await slackToolsApi.configure(companyId, endpointId, input);
        await query.refetch();
      }}
    />
  );
}
