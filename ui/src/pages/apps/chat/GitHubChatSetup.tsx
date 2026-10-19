import { t } from "@/i18n";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ChatEndpointSetupState } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import {
  chatEndpointsApi,
  type ChatEndpoint,
  type ChatEndpointResource,
} from "@/api/chatEndpoints";
import {
  githubChatApi,
  type GitHubConfigurationRecord,
  type GitHubIdentity,
  type GitHubVerification,
} from "@/api/githubChat";
import { AgentSelect } from "@/components/AgentMultiSelect";
import { GitHubAgentTrustWarning } from "@/components/GitHubAgentTrustWarning";
import { GitHubSetupPrompt } from "./GitHubSetupPrompt";
import {
  SetupWizardNavigation,
  SetupWizardFooter,
} from "@/components/SetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/ToastContext";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useNavigate, useSearchParams, Link } from "@/lib/router";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  GitHubAccessEditor,
  GitHubPolicyEditor,
  GitHubToggle,
  githubSelectClass,
} from "./GitHubBotConfiguration";

const steps = [
  "Choose agent",
  "Connect GitHub App",
  "Install GitHub App",
  "Select repositories",
  "Verify connection & tools",
  "Connect your account",
  "Configure behavior",
  "Try it",
];
const stages: NonNullable<ChatEndpointSetupState["github"]>["stage"][] = [
  "connect",
  "connect",
  "install",
  "repositories",
  "verify",
  "identity",
  "behavior",
  "test",
];
export function GitHubChatSetup() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [secretCopy, setSecretCopy] = useState<"idle" | "copied" | "failed">("idle");
  const identityOnly = params.get("stage") === "identity";
  const reconnecting = params.get("reconnect") === "1";
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [endpoint, setEndpoint] = useState<ChatEndpoint | null>(null);
  const [agentId, setAgentId] = useState(params.get("agentId") ?? "");
  const [step, setStep] = useState(0);
  const [availableStep, setAvailableStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Paperclip Review");
  const [existing, setExisting] = useState(reconnecting);
  const [credentials, setCredentials] = useState({
    appId: "",
    privateKey: "",
    webhookSecret: "",
  });
  const [registration, setRegistration] = useState<Awaited<
    ReturnType<typeof githubChatApi.registration>
  > | null>(null);
  const [resources, setResources] = useState<ChatEndpointResource[]>([]);
  const [record, setRecord] = useState<GitHubConfigurationRecord | null>(null);
  const [verification, setVerification] = useState<GitHubVerification | null>(
    null,
  );
  const [personalConnectionId, setPersonalConnectionId] = useState("");
  const [identity, setIdentity] = useState<GitHubIdentity | null>(null);
  const [copied, setCopied] = useState(false);
  const resume = params.get("resume");
  const agents = useQuery({
    queryKey: ["github-setup-agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && !identityOnly,
  });
  const current = useQuery({
    queryKey: ["github-setup", resume],
    queryFn: () => chatEndpointsApi.get(resume!),
    enabled: !!resume,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });
  const accounts = useQuery({
    queryKey: ["github-personal-connections", endpoint?.id],
    queryFn: () => githubChatApi.personalConnections(endpoint!.id),
    enabled: !!endpoint && step === 5,
  });
  const test = useQuery({
    queryKey: ["github-test-status", endpoint?.id],
    queryFn: () => chatEndpointsApi.setupTestStatus(endpoint!.id),
    enabled: !!endpoint && step === 7,
    refetchInterval: 3000,
  });
  const selectedAgent = agents.data?.find((agent) => agent.id === agentId);
  useEffect(() => {
    setBreadcrumbs([
      { label: t("connectors"), href: "/apps" },
      { label: t("stability.12a656b70cc4", { defaultValue: "GitHub Code Review Bot" }) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);
  useEffect(() => {
    if (!current.data) return;
    setEndpoint(current.data);
    setAgentId(current.data.assignedAgentId);
    if (availableStep === 0) {
      const next = identityOnly
        ? 5
        : reconnecting
          ? 1
          : current.data.setup?.github?.stage
            ? Math.max(1, stages.indexOf(current.data.setup.github.stage))
            : current.data.status === "active"
              ? 6
              : 1;
      setStep(next);
      setAvailableStep(next);
      if (identityOnly) return;
      void Promise.all([
        chatEndpointsApi.listResources(current.data.id),
        githubChatApi.configuration(current.data.id),
      ])
        .then(([resources, config]) => {
          setResources(resources);
          setRecord(config);
        })
        .catch((error) =>
          setError(
            error instanceof Error ? error.message : "Could not resume setup",
          ),
        );
    }
  }, [current.data, availableStep, params]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save this step. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function go(next: number, bot = endpoint) {
    if (bot && next > 0)
      setEndpoint(await githubChatApi.progress(bot.id, stages[next]!));
    setStep(next);
    setAvailableStep((value) => Math.max(value, next));
  }
  async function saveConfiguration() {
    if (!endpoint || !record) return;
    const saved = await githubChatApi.save(
      endpoint.id,
      record.revision,
      record.configuration,
    );
    setRecord(saved);
  }
  const exit = () =>
    void run(async () => {
      if (step === 6) await saveConfiguration();
      if (endpoint && step > 0 && !identityOnly)
        await githubChatApi.progress(endpoint.id, stages[step]!);
      navigate("/apps");
    });
  const footer = (
    label: string,
    action: () => Promise<void>,
    disabled = false,
    extra?: React.ReactNode,
  ) => (
    <SetupWizardFooter onSaveExit={exit}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {step > 0 && !identityOnly && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setStep(step - 1)}
          >{t("common.back")}</Button>
        )}
        {extra}
        <Button disabled={busy || disabled} onClick={() => void run(action)}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          {label}
        </Button>
      </div>
    </SetupWizardFooter>
  );
  const publicHttps = !!endpoint?.setup?.webhookUrl?.startsWith("https://");
  const mention = `@${endpoint?.botUsername?.replace(/\[bot\]$/, "") ?? "your-bot"} review this pull request`;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <SetupWizardNavigation
        labels={identityOnly ? ["Connect your account"] : steps}
        step={identityOnly ? 0 : step}
        availableStep={identityOnly ? 0 : availableStep}
        onSelect={identityOnly ? () => {} : setStep}
        disabled={busy}
        takeover
      />
      <div>
        <p className="text-xs text-muted-foreground">
          {identityOnly
            ? t("stability.0b21237034e6", { defaultValue: "GitHub account linking" })
            : `GitHub bot · Step ${step + 1} of ${steps.length}`}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{steps[step]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("stability.337de2fdb65d", { defaultValue: "GitHub conversations run as Paperclip tasks on one assigned agent." })}</p>
      </div>
      {(error || current.error || agents.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
        >
          {error || t("stability.99dc51ba3fc1", { defaultValue: "Could not load this setup. Refresh to try again." })}
        </p>
      )}
      {step === 0 && (
        <>
          <GitHubSetupPrompt />
          <p className="text-sm">{t("stability.2810c39093f3", { defaultValue: "This assignment is permanent. The agent works through its existing permissions, budgets, and tools." })}</p>
          {endpoint ? (
            <Input
              aria-label={t("stability.f96135acf40c", { defaultValue: "Assigned agent" })}
              value={
                endpoint.assignedAgentName ?? selectedAgent?.name ?? agentId
              }
              readOnly
            />
          ) : (
            <AgentSelect
              agents={(agents.data ?? []).filter(
                (agent) => !["terminated", "archived"].includes(agent.status),
              )}
              value={agentId}
              onChange={setAgentId}
              placeholder={t("stability.b6890bc23a9c", { defaultValue: "Choose an agent" })}
              emptyMessage={t("stability.da9108359944", { defaultValue: "No agents available" })}
            />
          )}
          <GitHubAgentTrustWarning agent={selectedAgent} />
          {footer(
            "Continue",
            async () => {
              const bot =
                endpoint ??
                (await chatEndpointsApi.create(selectedCompanyId!, {
                  provider: "github",
                  assignedAgentId: agentId,
                }));
              setEndpoint(bot);
              setParams(
                { provider: "github", resume: bot.id },
                { replace: true },
              );
              setRecord(await githubChatApi.configuration(bot.id));
              await go(1, bot);
            },
            !agentId || !selectedCompanyId,
          )}
        </>
      )}
      {step === 1 && endpoint && (
        <>
          {!publicHttps && (
            <div
              role="alert"
              className="rounded-lg border border-(--status-task-todo)/30 bg-(--status-task-todo)/10 p-4 text-sm"
            >{t("stability.7aacdb210e1a", { defaultValue: "A publicly reachable HTTPS address is required before App registration. Configure the instance’s public URL or an explicit webhook ingress URL, then refresh." })}{" "}{" "}
              <a className="underline" href="https://docs.paperclip.ing/reference/deploy/https/" target="_blank" rel="noreferrer">{t("stability.d73f790b1709", { defaultValue: "Learn how to set up HTTPS" })}</a>
            </div>
          )}
          <p className="text-sm">{t("stability.3f4496e97d78", { defaultValue: "Create a dedicated GitHub App for" })}{" "}
            {selectedAgent?.name ?? endpoint.assignedAgentName}. Paperclip
            stores the credentials in its vault and uses this same App for the
            agent’s GitHub tools.
          </p>
          {reconnecting && (
            <p className="text-sm text-muted-foreground">{t("stability.32758e44ad98", { defaultValue: "Verify the saved App and refresh its webhook configuration. Leave the credentials blank to keep them, or enter a replacement private key for the same App." })}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant={!existing ? "default" : "outline"}
              onClick={() => setExisting(false)}
            >{t("stability.ee0d795261a1", { defaultValue: "Create an App" })}</Button>
            <Button
              variant={existing ? "default" : "outline"}
              onClick={() => setExisting(true)}
            >{t("stability.49f3af520993", { defaultValue: "Use an existing App" })}</Button>
          </div>
          {existing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github-app-id">{t("stability.3c2f1e20ab37", { defaultValue: "App ID" })}</Label>
                <Input
                  id="github-app-id"
                  value={credentials.appId}
                  onChange={(e) =>
                    setCredentials({ ...credentials, appId: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">{t("stability.206851925fe5", { defaultValue: "Find this in your GitHub App’s settings." })}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-private-key">{t("private_key")}</Label>
                <Textarea
                  id="github-private-key"
                  autoComplete="off"
                  value={credentials.privateKey}
                  onChange={(e) =>
                    setCredentials({
                      ...credentials,
                      privateKey: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">{t("stability.618c80b1b277", { defaultValue: "Paste the PEM key. It is vaulted server-side." })}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-webhook-secret">{t("webhook_secret")}</Label>
                <Input
                  id="github-webhook-secret"
                  type="password"
                  autoComplete="off"
                  value={credentials.webhookSecret}
                  onChange={(e) =>
                    setCredentials({
                      ...credentials,
                      webhookSecret: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">{t("stability.92781553dbb3", { defaultValue: "Use the same secret in GitHub’s webhook settings." })}</p>
                {!reconnecting && <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
                    const generated = await chatEndpointsApi.generateSetupSecret(endpoint.id);
                    setCredentials(current => ({ ...current, webhookSecret: generated.webhookSecret }));
                    setSecretCopy("idle");
                  })}>{t("stability.cfbc14dea167", { defaultValue: "Generate webhook secret" })}</Button>
                  {credentials.webhookSecret && <Button variant="outline" onClick={async () => {
                    try { await copyTextToClipboard(credentials.webhookSecret); setSecretCopy("copied"); }
                    catch { setSecretCopy("failed"); pushToast({ title: "Couldn't copy to clipboard", body: "Select and copy the value manually.", tone: "error" }); }
                  }}>{secretCopy === "copied" ? t("stability.444c369db768", { defaultValue: "Webhook secret copied" }) : secretCopy === "failed" ? t("stability.368f602dd21e", { defaultValue: "Couldn’t copy — select it manually" }) : t("stability.a6635b8ce037", { defaultValue: "Copy webhook secret" })}</Button>}
                </div>}

              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="github-app-name">{t("stability.0647b10c34c0", { defaultValue: "GitHub App name" })}</Label>
              <Input
                id="github-app-name"
                maxLength={34}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setRegistration(null);
                }}
              />
              <p className="text-xs text-muted-foreground">{t("stability.b57b0a8f50fa", { defaultValue: "GitHub requires a unique name. Continue on GitHub, then return automatically to finish setup." })}</p>
              {registration && (
                <form
                  action={registration.registrationUrl}
                  method="POST"
                >
                  <input
                    type="hidden"
                    name="manifest"
                    value={JSON.stringify(registration.manifest)}
                  />
                  <Button type="submit">{t("stability.1536e05c961e", { defaultValue: "Create App on GitHub" })}<ExternalLink className="ml-2 size-4" />
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">{t("stability.6afb9390fe17", { defaultValue: "Registration expires at" })}{" "}
                    {new Date(registration.expiresAt).toLocaleTimeString()}.
                  </p>
                </form>
              )}
            </div>
          )}
          <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm">{t("stability.a84eb7a10ee7", { defaultValue: "App permissions and callback details" })}</summary>
            <p className="mt-3 text-sm">{t("stability.b3424f9f925b", { defaultValue: "Contents: read. Issues, Pull requests, Checks: write. Events: issue_comment, pull_request_review_comment, pull_request." })}</p>
            <p className="mt-2 break-all text-xs">
              {endpoint.setup?.webhookUrl ?? t("stability.58d73158cc93", { defaultValue: "Public webhook URL unavailable" })}
            </p>
            {endpoint.setup?.webhookUrl && <Button variant="outline" size="sm" className="mt-2" onClick={() => void run(async () => { await copyTextToClipboard(endpoint.setup!.webhookUrl!); pushToast({ title: "Webhook URL copied", tone: "success" }); })}>{t("stability.69179edf1639", { defaultValue: "Copy webhook URL" })}</Button>}
            {registration && (
              <pre className="mt-3 overflow-auto text-xs">
                {JSON.stringify(registration.manifest, null, 2)}
              </pre>
            )}
          </details>
          {footer(
            reconnecting
              ? "Reconnect App"
              : endpoint.setup?.github?.appSlug
                ? "Continue to installation"
                : existing
                  ? "Connect App"
                  : "Prepare registration",
            async () => {
              if (reconnecting) {
                const saved = await chatEndpointsApi.setup(endpoint.id, {
                  action: "reconnect",
                  ...(credentials.privateKey
                    ? {
                        credentials: {
                          appId: credentials.appId || endpoint.botExternalId!,
                          privateKey: credentials.privateKey,
                        },
                      }
                    : {}),
                });
                setEndpoint(saved);
                setCredentials({
                  appId: "",
                  privateKey: "",
                  webhookSecret: "",
                });
                await go(4, saved);
              } else if (endpoint.setup?.github?.appSlug) await go(2);
              else if (existing) {
                const saved = await githubChatApi.connectApp(
                  endpoint.id,
                  credentials,
                );
                setEndpoint(saved);
                setCredentials({
                  appId: "",
                  privateKey: "",
                  webhookSecret: "",
                });
                await go(2, saved);
              } else
                setRegistration(
                  await githubChatApi.registration(endpoint.id, name),
                );
            },
            !publicHttps ||
              (existing &&
                !reconnecting &&
                (!credentials.appId ||
                  !credentials.privateKey ||
                  !credentials.webhookSecret) &&
                !endpoint.setup?.github?.appSlug),
          )}
        </>
      )}
      {step === 2 && endpoint && (
        <>
          <p className="text-sm">{t("stability.d40d8b899235", { defaultValue: "Install the bot’s App into your GitHub account or organization. On GitHub, choose the repositories the installation can access." })}</p>
          <p className="text-sm text-muted-foreground">{t("stability.7a6e89c35e94", { defaultValue: "You will choose the subset enabled in Paperclip in the next step. Changing the installation does not automatically enable repositories here." })}</p>
          {endpoint.setup?.github?.installationUrl && (
            <Button asChild>
              <a
                href={endpoint.setup.github.installationUrl}
                target="_blank"
                rel="noreferrer"
              >{t("stability.e7d912b5a1bd", { defaultValue: "Install App on GitHub" })}<ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          )}
          {footer("I’ve installed the App", async () => {
            setResources(await githubChatApi.refreshRepositories(endpoint.id));
            await go(3);
          })}
        </>
      )}
      {step === 3 && endpoint && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setResources(
                    await githubChatApi.refreshRepositories(endpoint.id),
                  );
                  setEndpoint(await chatEndpointsApi.get(endpoint.id));
                })
              }
            >
              <RefreshCw className="mr-2 size-4" />{t("stability.0df81b589318", { defaultValue: "Refresh access" })}</Button>
            <Button variant="outline" asChild>
              <a
                href={
                  endpoint.setup?.github?.managementUrl ??
                  "https://github.com/settings/installations"
                }
                target="_blank"
                rel="noreferrer"
              >{t("stability.e9f56cc327be", { defaultValue: "Configure access on GitHub" })}<ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("stability.93759d0340e9", { defaultValue: "This list comes from the bot App’s installation. Enable the repositories where it should respond and review." })}</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {resources.length === 0 && (
              <p className="p-4 text-sm">{t("stability.30bcd52593d7", { defaultValue: "No repositories found. Configure installation access on GitHub, then refresh." })}</p>
            )}
            {resources.map((resource) => (
              <div key={resource.id} className="p-4">
                <GitHubToggle
                  label={resource.label}
                  description={
                    resource.availability !== "available"
                      ? t("stability.be83c8686101", { defaultValue: "GitHub installation access is unavailable" })
                      : t("stability.343c9809a98b", { defaultValue: "Available to this App installation" })
                  }
                  checked={
                    resource.enabled && resource.availability === "available"
                  }
                  onChange={(enabled) =>
                    setResources(
                      resources.map((row) =>
                        row.id === resource.id
                          ? {
                              ...row,
                              enabled:
                                enabled && row.availability === "available",
                            }
                          : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          {footer(
            "Save repositories",
            async () => {
              await chatEndpointsApi.updateResources(
                endpoint.id,
                resources.map((resource) => ({
                  id: resource.id,
                  enabled: resource.enabled,
                })),
              );
              await chatEndpointsApi.update(endpoint.id, {
                allowGroupChats: true,
              });
              const configured = await chatEndpointsApi.setup(endpoint.id, {
                action:
                  endpoint.status === "draft" || endpoint.status === "attention"
                    ? "configure"
                    : "reconnect",
              });
              setEndpoint(configured);
              await go(4, configured);
            },
            !resources.some(
              (resource) =>
                resource.enabled && resource.availability === "available",
            ),
          )}
        </>
      )}
      {step === 4 && endpoint && (
        <>
          <p className="text-sm">{t("stability.1d855f922a0d", { defaultValue: "Verify signed delivery, App identity, repository access, and the assigned agent’s effective tools separately." })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setVerification(await githubChatApi.verify(endpoint.id)),
                )
              }
            >{t("stability.7b840072a1e4", { defaultValue: "Verify connection" })}</Button>
            <Button
              variant="outline"
              disabled={busy || !record}
              onClick={() =>
                void run(async () => {
                  if (!record) return;
                  setRecord(
                    await githubChatApi.save(endpoint.id, record.revision, {
                      ...record.configuration,
                      toolsEnabled: true,
                    }),
                  );
                  setVerification(await githubChatApi.verify(endpoint.id));
                })
              }
            >{t("stability.4a3084250351", { defaultValue: "Assign this bot’s GitHub tools" })}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("stability.116cdcb8c2eb", { defaultValue: "Tool assignment grants this agent the bot App’s task-scoped tools through its Paperclip tool profile. Existing deny and approval policies still apply." })}</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {verification?.checks.map((check) => (
              <div key={check.key} className="flex gap-3 p-4">
                {check.ok ? (
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-(--status-task-done)" />
                ) : (
                  <XCircle className="mt-1 size-4 shrink-0 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <GitHubAgentTrustWarning agent={selectedAgent} />
          {footer("Continue", () => go(5), !verification?.ready)}
        </>
      )}
      {step === 5 && endpoint && (
        <>
          <p className="text-sm">{t("stability.2fef5c504a58", { defaultValue: "Choose your existing personal GitHub connection. Paperclip verifies the account, then asks you to confirm ownership. This link identifies your requests; the bot still uses its own App credentials." })}</p>
          <div className="space-y-2">
            <Label htmlFor="github-personal-account">{t("stability.b6eb02e7e169", { defaultValue: "Your GitHub connection" })}</Label>
            <select
              id="github-personal-account"
              className={githubSelectClass}
              value={personalConnectionId}
              onChange={(e) => {
                setPersonalConnectionId(e.target.value);
                setIdentity(null);
              }}
            >
              <option value="">{t("stability.323b061e63fe", { defaultValue: "Choose a personal connection" })}</option>
              {accounts.data?.map((account) => (
                <option
                  key={account.connectionId}
                  value={account.connectionId}
                  disabled={!account.enabled || account.status !== "active"}
                >
                  {account.name}
                  {account.login ? ` · @${account.login}` : ""}
                  {account.status !== "active" ? t("stability.6023b4fb7e75", { defaultValue: " · reconnect required" }) : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t("stability.88560962696d", { defaultValue: "Shared and agent connections cannot prove your identity." })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!personalConnectionId || busy}
              onClick={() =>
                void run(async () =>
                  setIdentity(
                    await githubChatApi.identity(
                      endpoint.id,
                      personalConnectionId,
                    ),
                  ),
                )
              }
            >{t("stability.8540f4dee735", { defaultValue: "Verify my account" })}</Button>
            <Button variant="ghost" onClick={() => void accounts.refetch()}>{t("stability.cad52835e0c2", { defaultValue: "Refresh connections" })}</Button>
            <Link className="self-center text-sm underline" to="/apps/connect?source=github">{t("stability.4027e5b24418", { defaultValue: "Connect GitHub" })}</Link>
          </div>
          {accounts.error && (
            <p role="alert" className="text-sm text-destructive">{t("stability.9f7fb23924ff", { defaultValue: "Could not load personal connections." })}</p>
          )}
          {identity && (
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium">@{identity.login}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("stability.13f319d72ca1", { defaultValue: "GitHub ID" })}{" "}{identity.githubUserId}. Confirm that this is your
                account.
              </p>
            </div>
          )}
          {footer(
            "Confirm this is my account",
            async () => {
              await githubChatApi.identity(
                endpoint.id,
                personalConnectionId,
                identity!.githubUserId,
              );
              if (identityOnly) navigate("/apps");
              else await go(6);
            },
            !identity,
          )}
        </>
      )}
      {step === 6 && endpoint && record && (
        <>
          <GitHubAccessEditor
            endpointId={endpoint.id}
            companyId={endpoint.companyId}
            configuration={record.configuration}
            onChange={(configuration) =>
              setRecord({ ...record, configuration })
            }
          />
          <GitHubPolicyEditor
            policy={record.configuration.defaults}
            onChange={(defaults) =>
              setRecord({
                ...record,
                configuration: { ...record.configuration, defaults },
              })
            }
          />
          {footer("Save behavior", async () => {
            await saveConfiguration();
            await go(7);
          })}
        </>
      )}
      {step === 7 && endpoint && (
        <>
          <p className="text-sm">{t("stability.e98898df9dfd", { defaultValue: "Mention the bot in an enabled repository. The request should create a real Paperclip task on" })}{" "}
            {selectedAgent?.name ?? endpoint.assignedAgentName}{" "}{t("stability.2d8cdf8c48c8", { defaultValue: "and reply on GitHub." })}</p>
          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <code className="min-w-0 flex-1 break-all text-sm">{mention}</code>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("stability.e2d09d427240", { defaultValue: "Copy test mention" })}
              onClick={() =>
                void copyTextToClipboard(mention).then(() => setCopied(true))
              }
            >
              <Copy className="size-4" />
            </Button>
          </div>
          {copied && (
            <p role="status" className="text-xs text-muted-foreground">{t("stability.84071487fe40", { defaultValue: "Mention copied" })}</p>
          )}
          <p role="status" className="text-sm">
            {test.data?.messageReceivedAt
              ? t("stability.3f5a8a9688cb", { defaultValue: "Message received. Wait for the agent’s response, then finish." })
              : t("stability.4739b5e8071b", { defaultValue: "Waiting for your test message…" })}
          </p>
          <Link
            className="text-sm underline"
            to={`/apps/chat/${endpoint.id}/conversations`}
          >{t("stability.29b288a502fb", { defaultValue: "Open underlying tasks" })}</Link>
          {footer(
            "Verify response and finish",
            async () => {
              await chatEndpointsApi.test(endpoint.id);
              navigate(`/apps/chat/${endpoint.id}/settings`);
            },
            !test.data?.messageReceivedAt,
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await chatEndpointsApi.finishSlackSetup(endpoint.id);
                  navigate(`/apps/chat/${endpoint.id}/settings`);
                })
              }
            >{t("stability.75641f72beb6", { defaultValue: "Finish without test" })}</Button>,
          )}
        </>
      )}
    </div>
  );
}
