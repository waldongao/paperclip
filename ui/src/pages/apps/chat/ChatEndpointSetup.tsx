import { t } from "@/i18n";
import { SLACK_BOT_TOOL_SCOPES } from "@paperclipai/shared";
import { defaultSlackAppName, slackBotNameForAgent } from "./slack-app-name";
import { GitHubChatSetup } from "./GitHubChatSetup";
import { SlackSetupPrompt } from "./SlackSetupPrompt";
import { GitHubAgentTrustWarning } from "@/components/GitHubAgentTrustWarning";
import { SetupWizardFooter } from "@/components/SetupWizard";
import { ChatSetupNavigation } from "@/components/chat/ChatSetupNavigation";
import { SlackAvatarStep } from "./SlackAvatarStep";
import { useSlackAvatarProgress } from "./slack-avatar-progress";
import { agentAvatarUrl } from "@/lib/agent-avatar-url";
import { resolveAgentAppearance } from "@paperclipai/shared";
import { SlackIdentityStep } from "./SlackIdentityStep";
import { PhotonConnectStep } from "./PhotonConnectStep";
import { EmailEndpointSetup } from "./EmailEndpointSetup";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, CircleHelp, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { AgentSelect } from "@/components/AgentMultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { agentsApi } from "@/api/agents";
import { instanceSettingsApi } from "@/api/instanceSettings";
import {
  chatEndpointsApi,
  type ChatEndpoint,
  type ChatProvider,
  type ChatEndpointSetupAction,
} from "@/api/chatEndpoints";
import { useNavigate, useSearchParams } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useCopyAction } from "@/lib/use-copy-action";
import { isAgentStatusInvokable, slackAppConfigurationSchema, type SlackAppConfiguration } from "@paperclipai/shared";
import { sanitizedSetupErrorMessage } from "./chat-setup-error";
import {
  createGitHubPrivateKeyReadGuard,
  readGitHubPrivateKeyFile,
} from "./github-private-key-file";

const providerNames: Record<ChatProvider, string> = {
  agentmail: "AgentMail",
  slack: "Slack",
  github: "GitHub",
  discord: "Discord",
  "microsoft-teams": "Microsoft Teams",
  telegram: "Telegram",
  "imessage-photon": "iMessage Photon",
};

const knownProviders = new Set(Object.keys(providerNames));

function isProvider(value: string | null): value is ChatProvider {
  return value !== null && knownProviders.has(value);
}

function publicOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isChatEndpointRepairing(
  endpoint: Pick<
    ChatEndpoint,
    "provider" | "status" | "providerAccountId" | "botExternalId"
  > | null,
  resumeEndpointId: string | null,
  reconnectRequested: boolean,
): boolean {
  if (!resumeEndpointId || !endpoint) return false;
  const recoveringStatus =
    endpoint.status === "attention" || endpoint.status === "revoked";
  // A secret-only GitHub draft affected by setup trouble has no App identity
  // or reusable App credentials. It must remain first-time setup, where App ID
  // and private key are required, rather than offering a misleading reconnect.
  if (
    endpoint.provider === "github" &&
    recoveringStatus &&
    !endpoint.providerAccountId &&
    !endpoint.botExternalId
  ) {
    return false;
  }
  return (
    recoveringStatus ||
    (reconnectRequested &&
      (endpoint.status === "active" || endpoint.status === "paused"))
  );
}

function ChatConnectionPurpose({ provider, onChat, onTools }: {
  provider: ChatProvider;
  onChat: () => void;
  onTools: () => void;
}) {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: t("connectors"), href: "/apps" }, { label: t("choose_connection") }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);
  return (
      <div className="max-w-2xl space-y-6">
        <ChatSetupNavigation labels={provider === "slack" ? ["Choose agent", "Create Slack app", "Add credentials", "Verify Slack connection", "Add avatar", "Connect your Slack account", "Try it"] : undefined} step={0} availableStep={0} onSelect={onChat} />
        <div>
          <h1 className="text-xl font-bold">{t("stability.aeb54e4ff3f1", { defaultValue: "Choose how to connect" })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("stability.f17f11fbc96a", { defaultValue: "What should this" })}{" "}{providerNames[provider]}{" "}{t("stability.f600c545bb2c", { defaultValue: "connection do?" })}</p>
        </div>
        <div className="grid gap-3">
          <button
            type="button"
            className="rounded-xl border border-border p-4 text-left hover:bg-accent/40"
            onClick={onChat}
          >
            <span className="block text-sm font-semibold">{t("stability.73adffe32a9a", { defaultValue: "Chat with an agent" })}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{t("stability.4c1b657174b9", { defaultValue: "People in" })}{" "}{providerNames[provider]}{" "}{t("stability.d9f0d77ffd1c", { defaultValue: "can start and continue Paperclip tasks." })}</span>
          </button>
          <button
            type="button"
            className="rounded-xl border border-border p-4 text-left hover:bg-accent/40"
            onClick={onTools}
          >
            <span className="block text-sm font-semibold">{t("stability.3035ada6aaeb", { defaultValue: "Use this connection as an agent tool" })}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{t("stability.0ac3fd20ac4f", { defaultValue: "Let agents use" })}{" "}{providerNames[provider]}{" "}{t("stability.4ce646679a23", { defaultValue: "actions and data while they work." })}</span>
          </button>
        </div>
      </div>
  );
}

export function ChatEndpointSetup() {
  const [params] = useSearchParams();
  if (params.get("provider") === "github") return <GitHubChatSetup />;
  return params.get("provider") === "agentmail" ? <EmailEndpointSetup /> : <ChatSdkEndpointSetup />;
}

function ChatSdkEndpointSetup() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const provider = isProvider(params.get("provider"))
    ? (params.get("provider") as ChatProvider)
    : null;
  const toolHref = params.get("toolHref") || "/apps";
  const preselectedAgent = params.get("agentId") ?? "";
  const resumeEndpointId = params.get("resume") ?? "";
  const reconnectRequested = params.get("reconnect") === "1";
  const [purpose, setPurpose] = useState<"choice" | "chat">(
    params.get("purpose") === "chat" ? "chat" : "choice",
  );
  const [agentId, setAgentId] = useState(preselectedAgent);
  const [slackCredentialsReady, setSlackCredentialsReady] = useState(params.get("stage") === "credentials");
  const [viewedStep, setViewedStep] = useState<number | null>(null);
  const [slackIdentityReady, setSlackIdentityReady] = useState(false);
  const [endpoint, setEndpoint] = useState<ChatEndpoint | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [generatedWebhookSecret, setGeneratedWebhookSecret] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("connectors"), href: "/apps" },
      { label: t("stability.611395e6c8c3", { defaultValue: "Connect chat" }) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: ["chat-endpoint-setup-agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const resumeQuery = useQuery({
    queryKey: ["chat-endpoint-setup-resume", resumeEndpointId],
    queryFn: () => chatEndpointsApi.get(resumeEndpointId),
    enabled: Boolean(resumeEndpointId),
  });
  useEffect(() => {
    if (!resumeQuery.data) return;
    setEndpoint(resumeQuery.data);
    setAgentId(resumeQuery.data.assignedAgentId);
    setPurpose("chat");
  }, [resumeQuery.data]);
  const githubVerificationQuery = useQuery({
    queryKey: ["chat-endpoint-github-webhook-verification", endpoint?.id],
    queryFn: () => chatEndpointsApi.get(endpoint!.id),
    enabled: Boolean(
      provider === "github" &&
      endpoint?.id &&
      endpoint.setup?.step === "provider_setup" &&
      endpoint.setup?.webhookSecretConfigured &&
      !endpoint.setup.webhookVerifiedAt,
    ),
    refetchInterval: 1_500,
  });
  useEffect(() => {
    if (
      !githubVerificationQuery.data ||
      provider !== "github" ||
      !endpoint ||
      endpoint.id !== githubVerificationQuery.data.id ||
      endpoint.setup?.step !== "provider_setup" ||
      !endpoint.setup?.webhookSecretConfigured ||
      endpoint.setup.webhookVerifiedAt
    )
      return;
    setEndpoint(githubVerificationQuery.data);
  }, [endpoint, githubVerificationQuery.data, provider]);
  const experimentalSettingsQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    enabled: endpoint?.setup?.step === "test",
  });
  const activeAgents = useMemo(
    () =>
      (agentsQuery.data ?? []).filter((agent) =>
        isAgentStatusInvokable(agent.status),
      ),
    [agentsQuery.data],
  );
  const syncEndpointSnapshot = (
    next: ChatEndpoint,
    onlyIfStillVisible = false,
  ) => {
    setEndpoint((visible) =>
      onlyIfStillVisible && visible?.id !== next.id ? visible : next,
    );
    queryClient.setQueryData(["chat-endpoint-setup-resume", next.id], next);
    queryClient.setQueryData(queryKeys.chatEndpoints.detail(next.id), next);
    if (next.provider === "github") {
      queryClient.setQueryData(
        ["chat-endpoint-github-webhook-verification", next.id],
        next,
      );
    }
  };
  const createEndpoint = useMutation({
    mutationFn: () =>
      chatEndpointsApi.create(selectedCompanyId!, {
        provider: provider!,
        assignedAgentId: agentId,
      }),
    onSuccess: (next) => {
      setViewedStep(null);
      syncEndpointSnapshot(next);
      if (next.provider === "imessage-photon") {
        const resumed = new URLSearchParams(params);
        resumed.set("resume", next.id);
        setParams(resumed, { replace: true });
      }
    },
    onError: (error) =>
      pushToast({
        title: "Couldn't start setup",
        body: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      }),
  });
  const setupAction = useMutation({
    mutationFn: async ({
      action,
      values,
    }: {
      action: ChatEndpointSetupAction;
      values?: Record<string, string>;
    }) => {
      const endpointId = endpoint!.id;
      try {
        return await chatEndpointsApi.setup(endpointId, provider === "imessage-photon" ? {
      action,
      ...(values?.projectSecret ? { credentials: { projectSecret: values.projectSecret } } : {}),
      ...(values?.projectId && values.allocation === "shared" ? { photon: { allocation: "shared" as const, projectId: values.projectId } } : values?.projectId && values?.lineId ? { photon: { allocation: "dedicated" as const, projectId: values.projectId, lineId: values.lineId } } : {}),
        } : { action, credentials: values });
      } catch (error) {
        // Another open tab may have completed verification, or the successful
        // response may have been lost. Read the canonical state before retrying.
        if (action === "verify") {
          const current = await chatEndpointsApi.get(endpointId).catch(() => null);
          if (current?.setup?.step === "test" || current?.setup?.step === "complete") return current;
        }
        throw error;
      }
    },
    onMutate: () => setSetupError(null),
    onSuccess: (next) => {
      setSetupError(null);
      setViewedStep(null);
      syncEndpointSnapshot(next);
      setCredentials({});
      if (next.setup?.step !== "test" && next.setup?.step !== "complete") setSlackIdentityReady(false);
    },
    onError: (error, variables) =>
      setSetupError(sanitizedSetupErrorMessage(error, variables.values)),
  });
  const generateSetupSecret = useMutation({
    mutationFn: () => chatEndpointsApi.generateSetupSecret(endpoint!.id),
    onMutate: async () => {
      const endpointId = endpoint!.id;
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["chat-endpoint-github-webhook-verification", endpointId],
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: ["chat-endpoint-setup-resume", endpointId],
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.chatEndpoints.detail(endpointId),
          exact: true,
        }),
      ]);
      return { endpointId };
    },
    onSuccess: async ({ webhookSecret }, _variables, context) => {
      const endpointId = context.endpointId;
      const markRotated = (current: ChatEndpoint) => ({
        ...current,
        setup: {
          ...current.setup,
          step: "provider_setup" as const,
          webhookSecretConfigured: true,
          webhookVerifiedAt: null,
        },
      });

      queryClient.removeQueries({
        queryKey: ["chat-endpoint-github-webhook-verification", endpointId],
        exact: true,
      });
      setGeneratedWebhookSecret(webhookSecret);
      setEndpoint((current) =>
        current && current.id === endpointId ? markRotated(current) : current,
      );
      queryClient.setQueryData<ChatEndpoint>(
        ["chat-endpoint-setup-resume", endpointId],
        (current) => (current ? markRotated(current) : current),
      );
      queryClient.setQueryData<ChatEndpoint>(
        queryKeys.chatEndpoints.detail(endpointId),
        (current) => (current ? markRotated(current) : current),
      );

      try {
        const current = await chatEndpointsApi.get(endpointId);
        syncEndpointSnapshot(current, true);
      } catch {
        // Keep the one-time secret copyable. Verification polling will retry the
        // canonical endpoint read without restoring a pre-rotation snapshot.
      }
    },
    onError: (error) =>
      pushToast({
        title: "Couldn't generate webhook secret",
        body: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      }),
  });
  const testConnection = useMutation({
    mutationFn: () => provider === "slack" ? chatEndpointsApi.finishSlackSetup(endpoint!.id) : chatEndpointsApi.test(endpoint!.id),
    onSuccess: (next) => {
      syncEndpointSnapshot(next);
      if (next.status === "active") navigate(`/apps/chat/${next.id}/settings`);
    },
    onError: (error) =>
      pushToast({
        title: "Test not complete",
        body:
          error instanceof Error
            ? error.message
            : "Send the provider message, then try again.",
        tone: "error",
      }),
  });

  const repairing = isChatEndpointRepairing(
    endpoint,
    resumeEndpointId,
    reconnectRequested,
  );
  const isSlack = provider === "slack";
  const avatarProgress = useSlackAvatarProgress(selectedCompanyId, endpoint?.id);
  const tryStep = isSlack ? 6 : 2;
  const availableStep = endpoint
    ? !repairing &&
      (endpoint.setup?.step === "test" || endpoint.setup?.step === "complete")
      ? isSlack && endpoint.setup?.step !== "complete"
        ? !avatarProgress.progress ? 4 : !slackIdentityReady ? 5 : tryStep
        : tryStep
      : isSlack && endpoint.providerAccountId && !repairing ? 3
      : isSlack && (slackCredentialsReady || repairing) ? 2 : 1
    : 0;
  const step = Math.min(viewedStep ?? availableStep, availableStep);
  const avatarAgent = useQuery({
    queryKey: queryKeys.agents.detail(endpoint?.assignedAgentId ?? ""),
    queryFn: () => agentsApi.get(endpoint!.assignedAgentId, endpoint!.companyId),
    enabled: Boolean(isSlack && endpoint && step === 4),
  });
  const slackVerificationQuery = useQuery({
    queryKey: ["chat-endpoint-slack-webhook-verification", endpoint?.id],
    queryFn: () => chatEndpointsApi.get(endpoint!.id),
    enabled: Boolean(isSlack && step === 3 && endpoint?.setup?.step === "provider_setup" &&
      !endpoint.setup.webhookVerifiedAt && !setupAction.isPending),
    refetchInterval: 1_500,
  });
  useEffect(() => {
    const next = slackVerificationQuery.data;
    if (!next || !endpoint || next.id !== endpoint.id || setupAction.isPending ||
      endpoint.setup?.step !== "provider_setup" || endpoint.setup.webhookVerifiedAt ||
      !next.setup?.webhookVerifiedAt) return;
    setEndpoint(next);
  }, [slackVerificationQuery.data, endpoint, setupAction.isPending]);
  const autoVerificationAttempt = useRef<string | null>(null);
  useEffect(() => {
    if (!isSlack || step !== 3 || endpoint?.setup?.step !== "provider_setup" ||
      !endpoint.setup.webhookVerifiedAt || setupAction.isPending) return;
    const attempt = `${endpoint.id}:${endpoint.setup.webhookVerifiedAt}`;
    if (autoVerificationAttempt.current === attempt) return;
    autoVerificationAttempt.current = attempt;
    setupAction.mutate({ action: "verify" });
  }, [isSlack, step, endpoint, setupAction]);

  if (!provider)
    return (
      <p className="text-sm text-destructive">{t("stability.4998d8ff4ac6", { defaultValue: "This chat provider is not supported." })}</p>
    );
  if (!selectedCompanyId)
    return (
      <p className="text-sm text-muted-foreground">{t("stability.7bd1f24bd51d", { defaultValue: "Select an organization to connect chat." })}</p>
    );

  if (purpose === "choice") {
    return <ChatConnectionPurpose provider={provider} onChat={() => setPurpose("chat")} onTools={() => navigate(toolHref)} />;
  }

  const selectedAgent = agentsQuery.data?.find((agent) => agent.id === agentId);
  return (
    <div className="max-w-2xl space-y-6">
      <ChatSetupNavigation
        labels={isSlack ? ["Choose agent", "Create Slack app", "Add credentials", "Verify Slack connection", "Add avatar", "Connect your Slack account", "Try it"] : undefined}
        step={step}
        availableStep={availableStep}
        disabled={createEndpoint.isPending || setupAction.isPending || generateSetupSecret.isPending || testConnection.isPending}
        onSelect={setViewedStep}
      />
      <div className="min-w-0 space-y-6">
        {step === 0 ? (
          <>
            <div>
              <h1 className="text-xl font-bold">{t("stability.14eb4b2e20d3", { defaultValue: "Which agent do you want to chat with?" })}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("stability.7f8764580946", { defaultValue: "This agent is permanent for the connection. Connect another channel to represent a different agent." })}</p>
            </div>
            {isSlack && <SlackSetupPrompt />}
            {endpoint ? (
              <Input aria-label={t("stability.f96135acf40c", { defaultValue: "Assigned agent" })} value={endpoint.assignedAgentName ?? selectedAgent?.name ?? agentId} readOnly />
            ) : <AgentSelect
              agents={activeAgents}
              value={agentId}
              onChange={setAgentId}
              placeholder={t("stability.e6be8c7a1d2b", { defaultValue: "Choose an active agent" })}
              emptyMessage={t("stability.972bd5aefeb8", { defaultValue: "No active agents are available." })}
            />}
            {provider === "github" && <GitHubAgentTrustWarning agent={selectedAgent} />}
            <SetupWizardFooter onSaveExit={() => navigate("/apps")}>
              <Button
                disabled={!agentId || createEndpoint.isPending}
                onClick={() => endpoint ? setViewedStep(1) : createEndpoint.mutate()}
              >
                {createEndpoint.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}{t("continue")}</Button>
            </SetupWizardFooter>
          </>
        ) : null}
        {endpoint && (
          <div hidden={step !== 1 && !(isSlack && (step === 2 || step === 3))} className="space-y-6">
            {setupError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <p className="font-medium">{t("connection_failed")}</p>
                <p className="mt-1">{setupError}</p>
              </div>
            ) : null}
            <ProviderConnectStep
              key={`${provider}:${endpoint.id}`}
              provider={provider}
              slackStage={step === 1 ? "app" : step === 3 ? "finish" : "credentials"}
              onSlackCredentialsContinue={() => setViewedStep(3)}
              onSlackVerificationContinue={() => setViewedStep(4)}
              slackVerificationError={slackVerificationQuery.isError}
              onSlackAppCreated={() => {
                setSlackCredentialsReady(true);
                setViewedStep(2);
                const resumed = new URLSearchParams(params);
                resumed.set("resume", endpoint.id);
                resumed.set("stage", "credentials");
                setParams(resumed, { replace: true });
              }}
              agentName={selectedAgent?.name ?? endpoint.assignedAgentName}
              endpoint={endpoint}
              onEndpointSaved={syncEndpointSnapshot}
              credentials={credentials}
              setCredentials={setCredentials}
              repairing={repairing}
              pending={setupAction.isPending}
              generatedWebhookSecret={generatedWebhookSecret}
              generatingSetupSecret={generateSetupSecret.isPending}
              onGenerateSetupSecret={() => generateSetupSecret.mutate()}
              onAction={(action, values) =>
                setupAction.mutate({ action, values })
              }
            />
          </div>
        )}
        {endpoint && isSlack && step === 4 && (
          <div className="space-y-4">
            {avatarAgent.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("stability.0a92b68354ac", { defaultValue: "Loading agent avatar…" })}</p>
              : avatarAgent.isError ? <p role="alert" className="text-sm text-destructive">{t("stability.984c743c4683", { defaultValue: "Couldn’t load the agent’s avatar." })}{" "}<button className="underline" onClick={() => void avatarAgent.refetch()}>{t("try_again")}</button></p>
              : <SlackAvatarStep
                  agentName={avatarAgent.data?.name ?? endpoint.assignedAgentName}
                  appName={endpoint.setup?.slackApp?.appName ?? defaultSlackAppName(avatarAgent.data?.name ?? endpoint.assignedAgentName)}
                  avatarUrl={agentAvatarUrl(resolveAgentAppearance(avatarAgent.data?.appearance, endpoint.assignedAgentId), 512, 1, "rest")}
                  uploaded={avatarProgress.progress === "uploaded"}
                  onUploaded={() => { avatarProgress.save("uploaded"); setViewedStep(5); }}
                  onSkip={() => { if (!avatarProgress.progress) avatarProgress.save("skipped"); setViewedStep(5); }}
                  onSaveExit={() => navigate("/apps")}
                />}
            {(avatarAgent.isPending || avatarAgent.isError) && <SetupWizardFooter onSaveExit={() => navigate("/apps")}><Button onClick={() => { avatarProgress.save("skipped"); setViewedStep(5); }}>{t("stability.b58eb52c8810", { defaultValue: "Skip for now" })}</Button></SetupWizardFooter>}
          </div>
        )}
        {endpoint && isSlack && step === 5 && (
          <SlackIdentityStep
            endpointId={endpoint.id}
            command={endpoint.setup?.slackApp?.command ?? endpoint.setup?.command ?? "/paperclip"}
            testStartedAt={endpoint.setup?.testStartedAt}
            onSaveExit={() => navigate("/apps")}
            onConnected={() => {
              setSlackIdentityReady(true);
              setViewedStep(6);
            }}
          />
        )}
        {endpoint && step === tryStep && (
          <TryStep
            endpointId={endpoint.id}
            provider={provider}
            agentName={selectedAgent?.name ?? endpoint.assignedAgentName}
            botLabel={endpoint.botLabel}
            botUsername={endpoint.botUsername}
            photonAllocation={endpoint.photonAllocation}
            providerUrl={endpoint.setup?.providerUrl}
            guestIsolationState={
              experimentalSettingsQuery.isPending
                ? "loading"
                : experimentalSettingsQuery.isError
                  ? "unknown"
                  : experimentalSettingsQuery.data?.enableIsolatedWorkspaces ===
                      true
                    ? "enabled"
                    : "disabled"
            }
            pending={testConnection.isPending}
            onOpenAccess={() => navigate(`/apps/chat/${endpoint.id}/access`)}
            onTest={() => testConnection.mutate()}
            onSaveExit={() => navigate("/apps")}
          />
        )}
        {step !== 0 && !(isSlack && (step === 1 || step === 2 || step === 3 || step === 4 || step === 5 || step === 6)) && <div className="flex justify-start">
          <Button className="text-muted-foreground" variant="ghost" onClick={() => navigate("/apps")}>{t("stability.0bd63bf3d32e", { defaultValue: "Save & exit" })}</Button>
        </div>}
      </div>
    </div>
  );
}

function ProviderConnectStep({
  provider,
  slackStage,
  onSlackCredentialsContinue,
  onSlackVerificationContinue,
  slackVerificationError,
  onSlackAppCreated,
  agentName,
  endpoint,
  credentials,
  setCredentials,
  repairing,
  pending,
  onEndpointSaved,
  generatedWebhookSecret,
  generatingSetupSecret,
  onGenerateSetupSecret,
  onAction,
}: {
  provider: ChatProvider;
  slackStage: "app" | "credentials" | "finish";
  onSlackCredentialsContinue: () => void;
  onSlackVerificationContinue: () => void;
  slackVerificationError: boolean;
  onSlackAppCreated: () => void;
  agentName: string;
  endpoint: ChatEndpoint;
  credentials: Record<string, string>;
  setCredentials: Dispatch<SetStateAction<Record<string, string>>>;
  repairing: boolean;
  pending: boolean;
  onEndpointSaved: (endpoint: ChatEndpoint) => void;
  generatedWebhookSecret: string;
  generatingSetupSecret: boolean;
  onGenerateSetupSecret: () => void;
  onAction: (
    action: ChatEndpointSetupAction,
    values?: Record<string, string>,
  ) => void;
}) {
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const slackBotToken = (credentials.botToken ?? "").trim();
  const slackBotTokenInvalid = provider === "slack" && slackBotToken.length > 0 &&
    !slackBotToken.startsWith("xoxb-");
  const slackSigningSecretHasTokenPrefix = provider === "slack" &&
    /^x[a-z0-9]*-/i.test((credentials.signingSecret ?? "").trim());
  const slackCredentialsSaved = provider === "slack" && Boolean(endpoint.providerAccountId);
  const continueWithSavedSlackCredentials = slackCredentialsSaved && !repairing &&
    !slackBotToken && !credentials.signingSecret?.trim();
  const reportCopyFailure = () =>
    pushToast({
      title: "Couldn't copy to clipboard",
      body: "Select and copy the value manually.",
      tone: "error",
    });
  const field = (key: string, label: string, type = "password") => (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input
        type={type}
        value={credentials[key] ?? ""}
        onChange={(event) =>
          setCredentials({ ...credentials, [key]: event.target.value })
        }
      />
    </label>
  );
  const openProviderSetup = (fallback: string) =>
    window.open(
      endpoint.setup?.authorizationUrl ??
        endpoint.setup?.providerUrl ??
        fallback,
      "_blank",
      "noopener,noreferrer",
    );
  const endpointValue = (label: string, value: string | null | undefined) => (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="rounded-lg border border-border bg-muted p-3 font-mono text-xs break-all">
        {value ??
          t("stability.b74970067135", { defaultValue: "This endpoint is unavailable. Check the server's public URL." })}
      </div>
    </div>
  );
  const [manifestCopied, setManifestCopied] = useState(false);
  // A hook rather than a sticky boolean: this step stays mounted when the
  // secret is regenerated, so a latched "copied" would keep vouching for a
  // value the reader never copied. The status resets itself, and a refused
  // clipboard reads as a failure instead of a success.
  const webhookSecretCopy = useCopyAction();
  const [openingSlackApp, setOpeningSlackApp] = useState(false);
  const slackAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setOpeningSlackApp(false);
    return () => {
      if (slackAdvanceTimer.current !== null) {
        clearTimeout(slackAdvanceTimer.current);
        slackAdvanceTimer.current = null;
      }
    };
  }, [slackStage]);
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
  const [privateKeyFileError, setPrivateKeyFileError] = useState<string | null>(
    null,
  );
  const [privateKeyFileLoaded, setPrivateKeyFileLoaded] = useState(false);
  const [privateKeyFileLoading, setPrivateKeyFileLoading] = useState(false);
  const privateKeyFileInputRef = useRef<HTMLInputElement>(null);
  const privateKeyReadGuard = useRef(createGitHubPrivateKeyReadGuard()).current;
  useEffect(
    () => () => {
      privateKeyReadGuard.invalidate();
    },
    [privateKeyReadGuard],
  );
  const loadPrivateKeyFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const readRevision = privateKeyReadGuard.start();
    setPrivateKeyFileError(null);
    setPrivateKeyFileLoaded(false);
    setPrivateKeyFileLoading(true);
    try {
      const privateKey = await readGitHubPrivateKeyFile(file);
      if (!privateKeyReadGuard.isCurrent(readRevision)) return;
      setCredentials((current) => ({ ...current, privateKey }));
      setPrivateKeyVisible(false);
      setPrivateKeyFileLoaded(true);
    } catch (error) {
      if (!privateKeyReadGuard.isCurrent(readRevision)) return;
      setPrivateKeyFileError(
        error instanceof Error
          ? error.message
          : "Paperclip couldn't read that file. Choose the .pem file again or paste the private key.",
      );
    } finally {
      if (privateKeyReadGuard.isCurrent(readRevision)) {
        setPrivateKeyFileLoading(false);
      }
    }
  };
  const replacePrivateKey = (privateKey: string) => {
    privateKeyReadGuard.invalidate();
    setPrivateKeyFileError(null);
    setPrivateKeyFileLoaded(false);
    setPrivateKeyFileLoading(false);
    setCredentials((current) => ({ ...current, privateKey }));
  };
  const defaultSlackCommand =
    endpoint.setup?.command ??
    `/${
      agentName
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "paperclip"
    }`;
  const defaultSlackBotName = slackBotNameForAgent(agentName);
  const [slackApp, setSlackApp] = useState<SlackAppConfiguration>(() =>
    endpoint.setup?.slackApp ?? {
      appName: defaultSlackAppName(agentName),
      botName: defaultSlackBotName,
      command: defaultSlackCommand,
    },
  );
  const slackDetailsEditable = endpoint.status === "draft" && !endpoint.botExternalId;
  const slackValidation = slackAppConfigurationSchema.safeParse(slackApp);
  const saveSlackApp = useMutation({
    scope: { id: `slack-app-details:${endpoint.id}` },
    mutationFn: (details: SlackAppConfiguration) =>
      chatEndpointsApi.update(endpoint.id, { slackApp: details }),
    onSuccess: onEndpointSaved,
  });
  const persistSlackApp = () => {
    if (!slackDetailsEditable || !slackValidation.success) return;
    if (JSON.stringify(slackValidation.data) === JSON.stringify(endpoint.setup?.slackApp)) return;
    saveSlackApp.mutate(slackValidation.data);
  };
  const slackAppName = slackApp.appName.trim();
  const slackBotName = slackApp.botName.trim();
  const slackCommand = slackApp.command.trim();
  const slackWebhookUrl =
    endpoint.setup?.webhookUrl ?? "<paperclip-webhook-url>";
  const slackManifest = `display_information:
  name: ${JSON.stringify(slackAppName)}
features:
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
  agent_view:
    agent_description: "Work with a Paperclip agent in a task-backed conversation."
  bot_user:
    display_name: ${JSON.stringify(slackBotName)}
  slash_commands:
    - command: ${JSON.stringify(slackCommand)}
      description: ${JSON.stringify(`Start or manage work with ${agentName}`)}
      usage_hint: ${JSON.stringify("status | new | close | <task>")}
      should_escape: false
      url: ${JSON.stringify(slackWebhookUrl)}
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - assistant:write
      - channels:history
      - channels:read
      - chat:write
      - commands
      - files:read
      - files:write
      - groups:history
      - groups:read
      - im:history
      - im:read
      - mpim:history
      - mpim:read
      - reactions:read
      - reactions:write
      - users:read
${SLACK_BOT_TOOL_SCOPES.map(scope => `      - ${scope}`).join("\n")}
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
  event_subscriptions:
    request_url: ${JSON.stringify(slackWebhookUrl)}
    bot_events:
      - agent_session_stopped
      - app_mention
      - message.channels
      - message.groups
      - message.im
      - message.mpim
      - member_joined_channel
      - member_left_channel
      - channel_left
      - group_left
      - reaction_added
      - reaction_removed
      - channel_archive
      - group_archive
      - channel_unarchive
      - group_unarchive
      - channel_deleted
      - channel_rename
      - group_rename
      - app_uninstalled
      - tokens_revoked
  interactivity:
    is_enabled: true
    request_url: ${JSON.stringify(slackWebhookUrl)}`;
  // Slack's documented creation link accepts a URL-encoded YAML manifest.
  const slackCreateUrl = `https://api.slack.com/apps?new_app=1&manifest_yaml=${encodeURIComponent(slackManifest)}`;
  useEffect(() => setManifestCopied(false), [slackManifest]);
  const teamsClientId =
    credentials.clientId?.trim() || "<application-client-id>";
  const teamsManifestSettings = JSON.stringify(
    {
      bots: [
        {
          botId: teamsClientId,
          scopes: ["personal", "team", "groupChat"],
          supportsFiles: true,
          isNotificationOnly: false,
          commandLists: [
            {
              scopes: ["personal", "groupChat"],
              commands: [
                {
                  title: "/status",
                  description: t("stability.5475e33e2aa2", { defaultValue: "Show the active Paperclip task status" }),
                },
                {
                  title: "/new",
                  description: t("stability.7986d3fbf140", { defaultValue: "Start a new Paperclip task in this chat" }),
                },
                {
                  title: "/close",
                  description: t("stability.0ac684eee59d", { defaultValue: "Close the active chat conversation" }),
                },
              ],
            },
          ],
        },
      ],
      webApplicationInfo: {
        id: teamsClientId,
        resource: "https://paperclip.ing",
      },
      authorization: {
        permissions: {
          resourceSpecific: [
            { name: "ChannelMessage.Read.Group", type: "Application" },
            { name: "ChatMessage.Read.Chat", type: "Application" },
          ],
        },
      },
    },
    null,
    2,
  );
  if (provider === "imessage-photon") return <PhotonConnectStep endpoint={endpoint} agentName={agentName} repairing={repairing} pending={pending} onAction={onAction} />;
  if (provider === "discord") {
    const applicationId = credentials.applicationId?.trim() ?? "";
    const guildId = credentials.guildId?.trim() ?? "";
    const installUrl = applicationId
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&permissions=309237763136&scope=bot${guildId ? `&guild_id=${encodeURIComponent(guildId)}&disable_guild_select=true` : ""}`
      : null;
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{t("connect")}{" "}{agentName}{" "}{t("stability.3bd0fc6ae387", { defaultValue: "to Discord" })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("stability.526a3c187748", { defaultValue: "Reconnect verifies this same Discord application and server installation. It does not add or remove the bot from the server. Leave fields blank to reuse saved credentials." })
              : t("stability.addb1ae38e9f", { defaultValue: "Create one dedicated Discord application and bot for this Paperclip agent." })}
          </p>
        </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>{t("stability.c64fd948d699", { defaultValue: "In Discord Developer Portal, create an application. Copy its Application ID from General Information." })}</li>
          <li>{t("stability.de4d6d6f472a", { defaultValue: "Open Bot, create the bot, enable Message Content Intent, then reset and copy its token." })}</li>
          <li>{t("stability.65acc2a71fa0", { defaultValue: "Enable Developer Mode in Discord, right-click the target server, and copy its Server ID." })}</li>
          <li>{t("stability.552ecc346b27", { defaultValue: "Enter those values below, then use the generated install link to add the bot to that server." })}</li>
        </ol>
        <Button
          variant="outline"
          onClick={() =>
            openProviderSetup("https://discord.com/developers/applications")
          }
        >{t("stability.090b2a59325a", { defaultValue: "Open Discord Developer Portal" })}{" "}<ExternalLink />
        </Button>
        {field("applicationId", "Application ID", "text")}
        {field("guildId", "Server ID", "text")}
        {field("botToken", "Bot token")}
        {installUrl && (
          <Button asChild variant="outline">
            <a href={installUrl} target="_blank" rel="noreferrer">{t("stability.8f6e4fbe8635", { defaultValue: "Install bot in this server" })}{" "}<ExternalLink />
            </a>
          </Button>
        )}
        <p className="text-sm text-muted-foreground">{t("stability.1f80c95a2cdb", { defaultValue: "The install link grants only View Channels, Send Messages, Create Public Threads, Send Messages in Threads, Read Message History, Add Reactions, Embed Links, and Attach Files. Paperclip still requires each discovered channel to be enabled in Access." })}</p>
        <Button
          disabled={
            (!repairing &&
              (!credentials.applicationId ||
                !credentials.guildId ||
                !credentials.botToken)) ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? t("stability.5abd85c1e3e9", { defaultValue: "Reconnect Discord bot" }) : t("stability.e2cc4408ae0a", { defaultValue: "Connect Discord bot" })}
        </Button>
      </div>
    );
  }
  if (provider === "telegram")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{t("common.create")}{" "}{agentName}{" "}{t("stability.df102afbe84a", { defaultValue: "in Telegram" })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("stability.ac88d22bb2f5", { defaultValue: "Reconnect verifies this same BotFather bot and automatically refreshes its Paperclip webhook and command menu. It does not recreate the bot or change its chat memberships. Leave the token blank to reuse the saved credential." })
              : t("stability.e7cbd41ef13c", { defaultValue: "Create a bot with BotFather, then paste the token it gives you." })}
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>{t("stability.42448ecad5a4", { defaultValue: "Open BotFather and send" })}{" "}<code>/newbot</code>.
          </li>
          <li>{t("stability.4feda6797085", { defaultValue: "Enter the bot display name." })}</li>
          <li>{t("stability.07917390b1ad", { defaultValue: "Choose an available username ending in" })}{" "}<code>bot</code>.
          </li>
        </ol>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{t("stability.b6d27e053db8", { defaultValue: "Paperclip works with Telegram's default bot privacy mode and registers its command menu automatically. In a group, ordinary mentions are not delivered to bots: start or continue work with" })}{" "}
          <code>/task@bot_username &lt;request&gt;</code>{t("stability.56c4e6eb881d", { defaultValue: ", or reply directly to a message from the bot." })}</p>
        <Button
          variant="outline"
          onClick={() => openProviderSetup("https://t.me/BotFather")}
        >{t("stability.a099b632035d", { defaultValue: "Open BotFather" })}{" "}<ExternalLink />
        </Button>
        {field("botToken", "Bot token")}
        {!endpoint.setup?.webhookUrl && (
          <p className="text-sm text-destructive">{t("stability.be61462c26cf", { defaultValue: "Configure a public HTTPS URL for this Paperclip instance before connecting Telegram." })}</p>
        )}
        <Button
          disabled={
            (!repairing && !credentials.botToken) ||
            !endpoint.setup?.webhookUrl ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? t("stability.56693e2eab78", { defaultValue: "Reconnect bot" }) : t("stability.301e424325f3", { defaultValue: "Connect bot" })}
        </Button>
      </div>
    );
  if (provider === "microsoft-teams")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{t("connect")}{" "}{agentName}{" "}{t("stability.75550de60263", { defaultValue: "to Microsoft Teams" })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("stability.328b17aa045e", { defaultValue: "Reconnect verifies this same Microsoft app, tenant, and bot identity. It does not upload or reinstall the Teams app. Leave fields blank to reuse saved credentials." })
              : t("stability.556108c3f440", { defaultValue: "Use your own Microsoft app credentials for this bot." })}
          </p>
        </div>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{t("stability.ec9dc0bc11c1", { defaultValue: "This setup requires a Microsoft 365 work or school organization where you can register an Entra app, create an Azure Bot, and upload or install a Teams app. Personal or free Teams accounts at teams.live.com cannot complete this setup. This release supports Microsoft 365 commercial cloud tenants only; GCC, GCC High, DoD, and Microsoft 365 operated by 21Vianet are not supported yet." })}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>{t("stability.4a2aace30449", { defaultValue: "In Microsoft Entra, create a single-tenant app registration. Copy its Application (client) ID and Directory (tenant) ID, then create a client secret and copy its value." })}</li>
          <li>{t("stability.cf68483b5e00", { defaultValue: "In Azure, create an Azure Bot. Choose Single Tenant, use that Application ID, set its messaging endpoint to the Paperclip URL below, and add the Microsoft Teams channel." })}</li>
          <li>{t("stability.d8d35eddf756", { defaultValue: "In Teams Developer Portal, create an app, add a bot with the same Application ID, then apply the manifest settings shown below. The block binds the Teams resource-specific consent permissions to that Entra app; these are not Microsoft Graph permissions in Entra. These permissions let the installed app receive every message in a team or group chat without an @mention, so describe that access to installers. Download the package and install it in the target team or group chat." })}</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noreferrer"
            >{t("stability.f23b82e1cdd0", { defaultValue: "Open Microsoft Entra" })}{" "}<ExternalLink />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://portal.azure.com/#create/Microsoft.AzureBot"
              target="_blank"
              rel="noreferrer"
            >{t("stability.adaaf3aeb941", { defaultValue: "Create Azure Bot" })}{" "}<ExternalLink />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://dev.teams.microsoft.com/apps"
              target="_blank"
              rel="noreferrer"
            >{t("stability.8606db85ec8a", { defaultValue: "Open Teams Developer Portal" })}{" "}<ExternalLink />
            </a>
          </Button>
        </div>
        {endpointValue(
          "Paperclip messaging endpoint",
          endpoint.setup?.messagingEndpoint,
        )}
        {field("clientId", "Application / Client ID", "text")}
        {field("tenantId", "Directory / Tenant ID", "text")}
        {field("clientSecret", "Client secret value")}
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">{t("stability.6a0f1431be43", { defaultValue: "Microsoft portal field map" })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("stability.8bea85095ea9", { defaultValue: "Use these exact portal sections and reuse the same Application ID in all three places." })}</p>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              <strong>{t("stability.b4935613ed46", { defaultValue: "Microsoft Entra admin center · App registrations" })}</strong>{t("stability.597e831fa5ee", { defaultValue: ": select" })}{" "}<strong>{t("stability.5c35cd89e8c7", { defaultValue: "New registration" })}</strong>{t("choose_1b24a7")}{" "}
              <strong>{t("stability.5c39323e4caf", { defaultValue: "Accounts in this organizational directory only (Single tenant)" })}</strong>{t("stability.6dc948aa5cfd", { defaultValue: ", then select" })}{" "}<strong>{t("stability.bb7234ec1245", { defaultValue: "Register" })}</strong>. Copy{" "}
              <strong>{t("stability.576111a7aee1", { defaultValue: "Application (client) ID" })}</strong>{" "}{t("zhComponents.text_cffa50a32c")}{" "}
              <strong>{t("stability.1dc4abe27594", { defaultValue: "Directory (tenant) ID" })}</strong>. Under{" "}
              <strong>{t("stability.5e4694835839", { defaultValue: "Certificates & secrets · Client secrets" })}</strong>{t("stability.ed6fac98cfbe", { defaultValue: ", select" })}{" "}<strong>{t("stability.02aac1d82e3a", { defaultValue: "New client secret" })}</strong>{" "}{t("stability.dda8c2c133fb", { defaultValue: "and copy its" })}{" "}
              <strong>{t("value")}</strong>{t("stability.98bac72b5d69", { defaultValue: ", not its Secret ID." })}</li>
            <li>
              <strong>{t("stability.245287276b83", { defaultValue: "Azure · Create Azure Bot" })}</strong>{t("stability.b28d625a3d71", { defaultValue: ": set" })}{" "}
              <strong>{t("stability.689f79d2ff9d", { defaultValue: "Microsoft App ID" })}</strong>{" "}{t("zhComponents.text_4374aaee24")}{" "}
              <strong>{t("stability.32517762f806", { defaultValue: "Single Tenant" })}</strong>{t("stability.1a7f496dc865", { defaultValue: ", set" })}{" "}<strong>{t("stability.a90668dbd91b", { defaultValue: "Creation type" })}</strong>{" "}{t("zhComponents.text_4374aaee24")}{" "}<strong>{t("stability.e7a8befdbbcd", { defaultValue: "Use existing app registration" })}</strong>{t("stability.6e689f279e25", { defaultValue: ", and enter the Application ID and Tenant ID above. After creation, open" })}{" "}
              <strong>{t("stability.15674b2bdd65", { defaultValue: "Settings · Configuration" })}</strong>{" "}{t("stability.480442a4fa1f", { defaultValue: "and paste the Paperclip" })}{" "}
              <strong>{t("stability.8dcb943dc3b2", { defaultValue: "Messaging endpoint" })}</strong>{t("stability.df051281e813", { defaultValue: "; then open" })}{" "}
              <strong>{t("stability.010583e236aa", { defaultValue: "Settings · Channels" })}</strong>{" "}{t("stability.e3adc62241ea", { defaultValue: "and enable" })}{" "}
              <strong>{t("stability.a7b52b269a23", { defaultValue: "Microsoft Teams" })}</strong>.
            </li>
            <li>
              <strong>{t("stability.ee4c150d1f05", { defaultValue: "Teams Developer Portal · Apps" })}</strong>{t("stability.597e831fa5ee", { defaultValue: ": select" })}{" "}
              <strong>{t("stability.747f1473fa17", { defaultValue: "New app" })}</strong>. Under{" "}
              <strong>{t("stability.e7d5d293927d", { defaultValue: "Configure · App features · Bot" })}</strong>{t("stability.84e44cfc4eb3", { defaultValue: ", add an existing bot using the same Application ID; enable" })}{" "}
              <strong>{t("personal")}</strong>, <strong>{t("team")}</strong>{t("and")}{" "}
              <strong>{t("stability.28c7d3f8b75d", { defaultValue: "Group chat" })}</strong>{" "}{t("stability.9fae582a60b8", { defaultValue: "scopes plus file support. Under" })}{" "}
              <strong>{t("stability.f45a200a679d", { defaultValue: "Configure · Permissions" })}</strong>{t("stability.d615211ffd20", { defaultValue: ", add the two RSC" })}{" "}
              <strong>{t("application")}</strong>{" "}{t("stability.48996c48fd6a", { defaultValue: "permissions shown below. Complete the required app details and icons, explain that the app can receive every message in an installed team or group chat, then download the app package." })}</li>
            <li>
              <strong>{t("stability.97fd174b0d1f", { defaultValue: "Microsoft Teams · Apps · Manage your apps" })}</strong>{t("stability.597e831fa5ee", { defaultValue: ": select" })}{" "}
              <strong>{t("stability.08d248a066d9", { defaultValue: "Upload an app · Upload a custom app" })}</strong>{t("stability.d04906007941", { defaultValue: ", choose the downloaded package, and install it in each intended personal chat, group chat, or team. One team install covers its standard channels. Private and shared channels require a separate app installation and are not supported by this release. If upload is unavailable, a Teams administrator must enable or approve custom apps." })}</li>
          </ol>
        </section>
        <label className="grid gap-2 text-sm font-medium">{t("stability.55ea4fc31a9f", { defaultValue: "Required Teams app manifest block" })}<Textarea
            className="min-h-80 font-mono text-xs"
            readOnly
            value={teamsManifestSettings}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!credentials.clientId?.trim()}
            onClick={() => {
              void copyTextToClipboard(teamsManifestSettings).then(
                () => setManifestCopied(true),
                reportCopyFailure,
              );
            }}
          >
            {manifestCopied
              ? t("stability.c8f17ea36180", { defaultValue: "Manifest settings copied" })
              : t("stability.b0b424ee3483", { defaultValue: "Copy manifest settings" })}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("stability.bb8a73b9fd79", { defaultValue: "Enter the Application / Client ID above before copying so the block contains the real bot identity. This block contains the Paperclip-specific fields to verify in Developer Portal or merge into a complete Teams app manifest. It is not a complete app package; Developer Portal supplies the remaining required metadata and packages the manifest with your app icons." })}</p>
        <p className="text-sm text-muted-foreground">{t("stability.3f37c908d903", { defaultValue: "Paperclip does not use Teams single sign-on in this release. The copied" })}{" "}<code>webApplicationInfo</code>{" "}{t("stability.797eed85ecf1", { defaultValue: "entry only associates the RSC permissions with the same Entra Application ID. Its nonempty resource is an RSC placeholder; you do not need to register an Entra Application ID URI or add delegated Microsoft Graph permissions." })}</p>
        <p className="text-sm text-muted-foreground">{t("stability.7578d0670188", { defaultValue: "The two application RSC permissions let the bot receive every message, without an @mention, in each team or group chat where it is installed. Paperclip retains and acts only on messages admitted by your Paperclip reach and access rules. Make this provider access clear in the app description shown to installers." })}</p>
        <p className="text-sm text-muted-foreground">{t("stability.96f2af1eab60", { defaultValue: "This release supports personal chats, group chats, and standard team channels—not private channels." })}{" "}<code>supportsFiles: true</code>{" "}{t("stability.57ef82b7288c", { defaultValue: "enables native file receipt and consent-based sending in personal chats; channel and group-chat files need a separate Microsoft Graph connection and are not ingested here." })}</p>
        {!endpoint.setup?.messagingEndpoint && (
          <p className="text-sm text-destructive">{t("stability.64624acecca1", { defaultValue: "Configure a public HTTPS URL for this Paperclip instance before connecting Microsoft Teams." })}</p>
        )}
        <Button
          disabled={
            (!repairing &&
              (!credentials.clientId ||
                !credentials.tenantId ||
                !credentials.clientSecret)) ||
            !endpoint.setup?.messagingEndpoint ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing
            ? t("stability.c3748cd7cef4", { defaultValue: "Reconnect Microsoft app" })
            : t("stability.716e44d2da79", { defaultValue: "Verify Microsoft credentials" })}
        </Button>
      </div>
    );
  if (provider === "github")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">
            {repairing
              ? t("stability.39ee43bf25a1", { defaultValue: "Reconnect GitHub App" })
              : t("stability.2ede47afae3b", { defaultValue: "Create or connect a GitHub App" })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("stability.e9a6cd4ea18b", { defaultValue: "Reconnect verifies this same App and installation, then updates its webhook URL, secret, and secure delivery settings. It does not reinstall the App or change repository access. Leave App ID and private key blank to reuse saved credentials. Keep Webhooks · Active enabled in GitHub; send a test conversation after reconnecting." })
              : t("stability.42a6576f1c19", { defaultValue: "Configure its webhook and permissions, then verify the App with Paperclip." })}
          </p>
        </div>
        {!repairing && (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>{t("stability.d17f40b3ba27", { defaultValue: "Under the target user or organization, create a new GitHub App. Give it a globally unique name (34 characters or fewer), use the Paperclip homepage URL below, and leave user authorization off." })}</li>
            <li>{t("stability.183f00f483d3", { defaultValue: "Keep" })}{" "}<strong>{t("stability.dde916ab7121", { defaultValue: "Webhooks · Active" })}</strong>{" "}{t("stability.5804a582a16d", { defaultValue: "on. Enter the Paperclip webhook URL and the Paperclip-generated webhook secret below, and keep" })}{" "}<strong>{t("stability.b817ccfbf8e6", { defaultValue: "Enable SSL verification" })}</strong>{" "}{t("stability.a1260b5d5a03", { defaultValue: "selected." })}</li>
            <li>{t("stability.6874414a6b5e", { defaultValue: "Under Repository permissions, set" })}{" "}<strong>{t("issues")}</strong>{" "}{t("zhComponents.text_cffa50a32c")}{" "}
              <strong>{t("pull_requests")}</strong>{" "}{t("zhComponents.text_4374aaee24")}{" "}
              <strong>{t("stability.5cf0e8247f39", { defaultValue: "Read & write" })}</strong>. Leave every other permission at
              its default; Metadata remains read-only.
            </li>
            <li>{t("stability.a067f416cd57", { defaultValue: "Subscribe to" })}{" "}<strong>{t("stability.b58fb1935afc", { defaultValue: "Issue comment" })}</strong> (
              <code>issue_comment</code>),{" "}
              <strong>{t("stability.a480a0e12be3", { defaultValue: "Pull request review comment" })}</strong> (
              <code>pull_request_review_comment</code>{t("stability.c85ce75b2982", { defaultValue: "). GitHub sends" })}{" "}
              <code>installation</code>{" "}{t("zhComponents.text_cffa50a32c")}{" "}
              <code>installation_repositories</code>{" "}{t("stability.688aa7ac60e8", { defaultValue: "to every GitHub App automatically; they are not selectable here." })}</li>
            <li>{t("choose")}{" "}<strong>{t("stability.bc291e525c9f", { defaultValue: "Only on this account" })}</strong>{t("stability.2c6514564cec", { defaultValue: ", create the App, copy its App ID, generate one private key, then install it on the selected repositories." })}</li>
          </ol>
        )}
        {endpointValue(
          "Paperclip homepage URL",
          publicOrigin(endpoint.setup?.webhookUrl),
        )}
        {endpointValue("Paperclip webhook URL", endpoint.setup?.webhookUrl)}
        <Button
          variant="outline"
          onClick={() =>
            window.open(
              repairing
                ? "https://github.com/settings/apps"
                : (endpoint.setup?.authorizationUrl ??
                    "https://github.com/settings/apps/new"),
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          {repairing ? t("stability.1395525a0077", { defaultValue: "Open GitHub App settings" }) : t("stability.09512a8dd1e1", { defaultValue: "Open new GitHub App form" })}{" "}
          <ExternalLink />
        </Button>
        {field("appId", "GitHub App ID", "text")}
        <div className="grid gap-2 text-sm font-medium">
          <label htmlFor="github-private-key">{t("stability.1a5ad9860afa", { defaultValue: "Private key (PEM)" })}</label>
          <div className="relative">
            {privateKeyVisible ? (
              <Textarea
                id="github-private-key"
                className="min-h-24 pr-11 font-mono text-xs"
                value={credentials.privateKey ?? ""}
                onChange={(event) => replacePrivateKey(event.target.value)}
              />
            ) : (
              <Input
                id="github-private-key"
                type="password"
                className="pr-11 font-mono text-xs"
                value={credentials.privateKey ?? ""}
                onChange={(event) => replacePrivateKey(event.target.value)}
                onPaste={(event) => {
                  event.preventDefault();
                  replacePrivateKey(event.clipboardData.getData("text"));
                }}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              aria-label={
                privateKeyVisible ? t("stability.6ffb67bcf58a", { defaultValue: "Hide private key" }) : t("stability.adde31d83a71", { defaultValue: "Show private key" })
              }
              onClick={() => setPrivateKeyVisible((visible) => !visible)}
            >
              {privateKeyVisible ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <input
            ref={privateKeyFileInputRef}
            type="file"
            accept=".pem,.key,application/x-pem-file,application/pkcs8,text/plain"
            className="hidden"
            aria-label={t("stability.67623763440d", { defaultValue: "Choose GitHub App private key file" })}
            onChange={loadPrivateKeyFile}
          />
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => privateKeyFileInputRef.current?.click()}
            >{t("stability.bd08402ee940", { defaultValue: "Choose .pem file" })}</Button>
          </div>
          {privateKeyFileError ? (
            <p role="alert" className="text-sm text-destructive">
              {privateKeyFileError}
            </p>
          ) : null}
          {privateKeyFileLoading ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >{t("stability.c5c9855e5cc2", { defaultValue: "Reading private key file…" })}</p>
          ) : privateKeyFileLoaded ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >{t("stability.13a97342ac87", { defaultValue: "Private key loaded. It stays in this form until you connect." })}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t("webhook_secret")}</p>
          {generatedWebhookSecret ? (
            <>
              <Input
                aria-label={t("stability.90e15bc010e3", { defaultValue: "Generated webhook secret" })}
                className="font-mono text-xs"
                readOnly
                value={generatedWebhookSecret}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Both signals, and each covers the other's blind spot.
                    // The toast is the loud one, the way this step's other two
                    // copy buttons report failure — but the provider dedupes an
                    // identical toast inside 3.5s, so a reader who clicks twice
                    // on a blocked clipboard would see nothing the second time.
                    // The inline state answers every click.
                    void webhookSecretCopy
                      .copy(generatedWebhookSecret)
                      .then((status) => {
                        if (status === "failed") reportCopyFailure();
                      });
                  }}
                >
                  {webhookSecretCopy.copied
                    ? t("stability.444c369db768", { defaultValue: "Webhook secret copied" })
                    : webhookSecretCopy.failed
                      ? t("stability.368f602dd21e", { defaultValue: "Couldn’t copy — select it manually" })
                      : t("stability.a6635b8ce037", { defaultValue: "Copy webhook secret" })}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{t("stability.32126b2c9c47", { defaultValue: "Copy this value now. Paperclip will not show it again." })}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {endpoint.setup?.webhookSecretConfigured
                ? t("stability.60ae90908849", { defaultValue: "A webhook secret is configured and cannot be shown again." })
                : t("stability.7651731df577", { defaultValue: "Generate the secret in Paperclip, then paste it into the GitHub App." })}
            </p>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={generatingSetupSecret}
              onClick={onGenerateSetupSecret}
            >
              {generatingSetupSecret && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {endpoint.setup?.webhookSecretConfigured
                ? t("stability.8256661f3875", { defaultValue: "Regenerate webhook secret" })
                : t("stability.cfbc14dea167", { defaultValue: "Generate webhook secret" })}
            </Button>
          </div>
          {endpoint.setup?.webhookSecretConfigured && (
            <p className="text-sm text-muted-foreground">
              {endpoint.providerAccountId || endpoint.botExternalId
                ? t("stability.ca9e3b5f05a8", { defaultValue: "Regenerating immediately invalidates GitHub webhook signatures until you replace the secret in the GitHub App settings." })
                : t("stability.7ac93157fe0e", { defaultValue: "Generating another secret replaces the previous value. Paste the newest value into GitHub before continuing." })}
            </p>
          )}
          {endpoint.setup?.webhookSecretConfigured && (
            <p
              className={`text-sm ${endpoint.setup.webhookVerifiedAt ? "text-foreground" : "text-muted-foreground"}`}
            >
              {endpoint.setup.webhookVerifiedAt
                ? t("stability.f7c4fecf9183", { defaultValue: "GitHub has verified this webhook." })
                : t("stability.4255e14b0fa2", { defaultValue: "Waiting for GitHub to deliver its signed webhook ping…" })}
            </p>
          )}
        </div>
        {!endpoint.setup?.webhookUrl && (
          <p className="text-sm text-destructive">{t("stability.54b7183f5911", { defaultValue: "Configure a public HTTPS URL for this Paperclip instance before connecting GitHub." })}</p>
        )}
        <Button
          disabled={
            (!repairing && (!credentials.appId || !credentials.privateKey)) ||
            !endpoint.setup?.webhookSecretConfigured ||
            !endpoint.setup?.webhookVerifiedAt ||
            !endpoint.setup?.webhookUrl ||
            privateKeyFileLoading ||
            generatingSetupSecret ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? t("stability.9487232d7a68", { defaultValue: "Reconnect and verify" }) : t("stability.a2bfc0e223ae", { defaultValue: "Connect and verify" })}
        </Button>
      </div>
    );
  if (slackStage === "finish")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{t("stability.f64c0a1d9ba6", { defaultValue: "Verify Slack connection" })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("stability.a2c02d935486", { defaultValue: "Slack needs to confirm that it can reach your Paperclip instance." })}</p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li><a className="underline underline-offset-4" href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">{t("stability.30cfde1ec067", { defaultValue: "Open Slack app Settings" })}{" "}<ExternalLink className="inline size-3" /></a>{" "}{t("stability.566c1f30e50c", { defaultValue: "and choose" })}{" "}<strong>{slackApp.appName}</strong>.</li>
          <li>{t("choose")}{" "}<strong>{t("stability.664326174c32", { defaultValue: "Event Subscriptions" })}</strong>.</li>
          <li>{t("stability.3b8a3f4a85ef", { defaultValue: "Beside the prefilled" })}{" "}<strong>{t("stability.dafbe40ca8b7", { defaultValue: "Request URL" })}</strong>{t("stability.254b3f7ae378", { defaultValue: ", click" })}{" "}<strong>{t("common.retry")}</strong>{" "}{t("stability.6f3f6848db0b", { defaultValue: "if it isn't verified. Save changes if Slack asks." })}</li>
        </ol>
        {endpoint.setup?.webhookVerifiedAt ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-(--status-task-done)" />{t("stability.5bb1e424795b", { defaultValue: "Slack verified your connection." })}{pending ? t("stability.e9fc8991ab02", { defaultValue: " Opening the message test…" }) : ""}
          </p>
        ) : slackVerificationError ? (
          <p role="alert" className="text-sm text-destructive">{t("stability.e9747d854a92", { defaultValue: "Couldn't check verification. We'll keep trying; check your connection if this continues." })}</p>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />{" "}{t("stability.340004ee6ab1", { defaultValue: "Waiting for Slack to verify. We'll continue automatically." })}</p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("stability.c3af076f92c5", { defaultValue: "Troubleshooting" })}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-muted-foreground">{t("stability.f35fe901dc55", { defaultValue: "If the Request URL is missing or different, paste this URL into Event Subscriptions. If verification fails, check that your public HTTPS server is reachable and your Signing Secret is correct." })}</p>
            {endpointValue("Paperclip webhook URL", endpoint.setup?.webhookUrl)}
          </div>
        </details>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => navigate("/apps")}>{t("stability.0bd63bf3d32e", { defaultValue: "Save & exit" })}</Button>
          <Button disabled={pending || !endpoint.setup?.webhookVerifiedAt} onClick={() =>
            endpoint.setup?.step === "provider_setup" ? onAction("verify") : onSlackVerificationContinue()
          }>
            {pending && <Loader2 className="size-4 animate-spin" />}{t("continue")}</Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      {!endpoint.setup?.webhookUrl && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t("stability.e211fdbdad86", { defaultValue: "Public HTTPS URL required" })}</p>
            <p className="text-sm">{t("stability.4d8a53f19a1f", { defaultValue: "Slack needs a public HTTPS URL to send messages to Paperclip. Configure one for this instance before creating or connecting your Slack app." })}</p>
            <a
              href="https://docs.paperclip.ing/reference/deploy/https/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-4"
            >{t("stability.d73f790b1709", { defaultValue: "Learn how to set up HTTPS" })}</a>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold">{slackStage === "app" ? t("stability.80a0f951288b", { defaultValue: "Create a Slack app" }) : t("stability.eafbd79fa826", { defaultValue: "Add Slack credentials" })}</h1>
        {repairing && (
          <p className="mt-1 text-sm text-muted-foreground">{t("stability.c4328e46cafe", { defaultValue: "Reconnect verifies or replaces credentials for this same Slack app. It does not reinstall the app or change its workspace or channel membership. Leave credentials blank to reuse the saved values." })}</p>
        )}
      </div>
      <div hidden={slackStage !== "app"} className="space-y-5">
        <div className="space-y-3 text-sm">
          {([
            ["appName", "Slack app name", 35, "The name of your app in Slack’s app directory and settings."],
            ["botName", "Bot display name", 80, "The name people see when your bot sends a message. Use lowercase letters, numbers, periods, hyphens, or underscores."],
            ["command", "Slash command", 32, "The command people type in Slack to talk to this agent. Start with /, followed by lowercase letters, numbers, hyphens, or underscores."],
          ] as const).map(([key, label, maxLength, help]) => (
            <div key={key} className="grid items-center gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor={`slack-${key}`}>{label}</label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("stability.cbe4affdec08", { value1: label.toLowerCase(), defaultValue: "Help with {{value1}}" })}
                      className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CircleHelp className="size-3.5" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{help}</TooltipContent>
                </Tooltip>
              </div>
              <Input
                id={`slack-${key}`}
                className="bg-background text-foreground dark:bg-background"
                value={slackApp[key]}
                maxLength={maxLength}
                readOnly={!slackDetailsEditable}
                aria-invalid={!slackValidation.success && slackValidation.error.issues.some((issue) => issue.path[0] === key)}
                onChange={(event) => setSlackApp({ ...slackApp, [key]: event.target.value })}
                onBlur={persistSlackApp}
              />
            </div>
          ))}
          {!slackValidation.success && (
            <p role="alert" className="text-sm text-destructive">{slackValidation.error.issues[0].message}</p>
          )}
          {saveSlackApp.isError && (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{t("stability.1219ab53cc03", { defaultValue: "Couldn't save the Slack app details. Try again before connecting." })}</p>
              <Button variant="outline" size="sm" onClick={persistSlackApp}>{t("stability.3adee60b2336", { defaultValue: "Retry saving" })}</Button>
            </div>
          )}
          <div className="flex justify-end">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground underline underline-offset-4">{t("stability.d0918c4c7d01", { defaultValue: "View Slack App Manifest" })}</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("stability.3d57b6051596", { defaultValue: "Slack app manifest" })}</DialogTitle>
                  <DialogDescription>{t("stability.1feb775e5af3", { defaultValue: "Generated from your app name, bot name, and slash command. Edit those fields to update the manifest." })}</DialogDescription>
                </DialogHeader>
                <Textarea
                  aria-label={t("stability.3d57b6051596", { defaultValue: "Slack app manifest" })}
                  className="h-80 font-mono text-xs"
                  readOnly
                  value={slackManifest}
                />
                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={!slackValidation.success}
                    onClick={() => {
                      void copyTextToClipboard(slackManifest).then(
                        () => setManifestCopied(true),
                        reportCopyFailure,
                      );
                    }}
                  >
                    {manifestCopied ? t("stability.64e6431bbff5", { defaultValue: "Manifest copied" }) : t("stability.415f928f80c3", { defaultValue: "Copy manifest" })}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => navigate("/apps")}>{t("stability.0bd63bf3d32e", { defaultValue: "Save & exit" })}</Button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" disabled={openingSlackApp || !endpoint.setup?.webhookUrl || !slackValidation.success || saveSlackApp.isPending || saveSlackApp.isError} onClick={onSlackAppCreated}>{t("stability.b71ded6b394f", { defaultValue: "I already created the app" })}</Button>
            {!repairing && (
              <Button
                disabled={openingSlackApp || !endpoint.setup?.webhookUrl || !slackValidation.success || saveSlackApp.isPending || saveSlackApp.isError}
                onClick={() => {
                  window.open(slackCreateUrl, "_blank", "noopener,noreferrer");
                  setOpeningSlackApp(true);
                  // Let Slack open before changing the step behind its new tab.
                  slackAdvanceTimer.current = setTimeout(() => {
                    slackAdvanceTimer.current = null;
                    setOpeningSlackApp(false);
                    onSlackAppCreated();
                  }, 1000);
                }}
              >{t("stability.7e043d9ff8df", { defaultValue: "Create Slack app" })}{" "}<ExternalLink />
              </Button>
            )}
          </div>
        </div>
      </div>
      <div hidden={slackStage !== "credentials"} className="space-y-5">
        <p className="text-sm">{t("stability.6aa5da6045aa", { defaultValue: "Now you need to find two secrets. They are in two different screens on Slack." })}</p>
        {slackCredentialsSaved && !repairing && (
          <p className="text-sm text-muted-foreground">{t("stability.817aa6e72b18", { defaultValue: "Your credentials are saved. Leave the fields blank to keep them, or enter replacements." })}</p>
        )}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold"><label htmlFor="slack-bot-token">{t("stability.d6b64bf5e951", { defaultValue: "Bot User OAuth Token" })}</label></h2>
          <ul id="slack-bot-token-help" className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("stability.30cfde1ec067", { defaultValue: "Open Slack app Settings" })}{" "}<ExternalLink className="inline size-3" />
              </a>{" "}{t("stability.566c1f30e50c", { defaultValue: "and choose" })}{" "}<strong>{slackApp.appName}</strong>.
            </li>
            <li>{t("choose")}{" "}<strong>{t("stability.552008101593", { defaultValue: "OAuth & Permissions" })}</strong></li>
            <li>{t("stability.ef79f9371149", { defaultValue: "Copy and paste your" })}{" "}<strong>{t("stability.9d89851e5da9", { defaultValue: "Bot OAuth Token" })}</strong></li>
          </ul>
          <Input
            id="slack-bot-token"
            type="password"
            placeholder={slackCredentialsSaved ? t("stability.f1a85f6bace4", { defaultValue: "Saved — leave blank to keep" }) : undefined}
            value={credentials.botToken ?? ""}
            aria-invalid={slackBotTokenInvalid || undefined}
            aria-describedby={`slack-bot-token-help${slackBotTokenInvalid ? " slack-bot-token-warning" : ""}`}
            onChange={(event) => setCredentials({ ...credentials, botToken: event.target.value })}
          />
          {slackBotTokenInvalid && (
            <p id="slack-bot-token-warning" role="alert" className="text-sm text-destructive">{t("stability.80bd918bbda1", { defaultValue: "Your Bot User OAuth Token must start with" })}{" "}<code>xoxb-</code>. Copy it from <strong>{t("stability.552008101593", { defaultValue: "OAuth & Permissions" })}</strong>.
            </p>
          )}
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold"><label htmlFor="slack-signing-secret">{t("stability.f5e81453d0e9", { defaultValue: "Signing Secret" })}</label></h2>
          <ul id="slack-signing-secret-help" className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("stability.30cfde1ec067", { defaultValue: "Open Slack app Settings" })}{" "}<ExternalLink className="inline size-3" />
              </a>{" "}{t("stability.566c1f30e50c", { defaultValue: "and choose" })}{" "}<strong>{slackApp.appName}</strong>.
            </li>
            <li>{t("choose")}{" "}<strong>{t("stability.d094b334d809", { defaultValue: "Basic Information" })}</strong></li>
            <li>{t("stability.ef79f9371149", { defaultValue: "Copy and paste your" })}{" "}<strong>{t("stability.f5e81453d0e9", { defaultValue: "Signing Secret" })}</strong></li>
          </ul>
          <Input
            id="slack-signing-secret"
            type="password"
            placeholder={slackCredentialsSaved ? t("stability.f1a85f6bace4", { defaultValue: "Saved — leave blank to keep" }) : undefined}
            value={credentials.signingSecret ?? ""}
            aria-invalid={slackSigningSecretHasTokenPrefix || undefined}
            aria-describedby={`slack-signing-secret-help${slackSigningSecretHasTokenPrefix ? " slack-signing-secret-warning" : ""}`}
            onChange={(event) => setCredentials({ ...credentials, signingSecret: event.target.value })}
          />
          {slackSigningSecretHasTokenPrefix && (
            <p id="slack-signing-secret-warning" role="alert" className="text-sm text-destructive">{t("stability.3ffa30fbc409", { defaultValue: "Use the" })}{" "}<strong>{t("stability.f5e81453d0e9", { defaultValue: "Signing Secret" })}</strong>{t("stability.1c2ae0821df5", { defaultValue: ", NOT an app or bot token. The Signing Secret has no token prefix." })}</p>
          )}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => navigate("/apps")}>{t("stability.0bd63bf3d32e", { defaultValue: "Save & exit" })}</Button>
          <Button
            className="ml-auto"
            disabled={
              (!repairing && !slackCredentialsSaved && (!slackBotToken || !credentials.signingSecret?.trim())) ||
              !endpoint.setup?.webhookUrl || !slackValidation.success ||
              saveSlackApp.isPending || saveSlackApp.isError || pending || slackSigningSecretHasTokenPrefix || slackBotTokenInvalid
            }
            onClick={() => continueWithSavedSlackCredentials
              ? onSlackCredentialsContinue()
              : onAction(repairing || slackCredentialsSaved ? "reconnect" : "configure", credentials)}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {continueWithSavedSlackCredentials ? t("continue") : repairing || slackCredentialsSaved ? t("stability.dcbcb32c3f0b", { defaultValue: "Reconnect Slack app" }) : t("stability.db03affc54d9", { defaultValue: "Connect Slack app" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TryStep({
  endpointId,
  provider,
  agentName,
  botLabel,
  botUsername,
  photonAllocation,
  providerUrl,
  guestIsolationState,
  pending,
  onOpenAccess,
  onTest,
  onSaveExit,
}: {
  endpointId: string;
  provider: ChatProvider;
  agentName: string;
  botLabel?: string | null;
  botUsername?: string | null;
  photonAllocation?: "dedicated" | "shared";
  providerUrl?: string | null;
  guestIsolationState: "loading" | "enabled" | "disabled" | "unknown";
  pending: boolean;
  onOpenAccess: () => void;
  onTest: () => void;
  onSaveExit: () => void;
}) {
  const messageStatus = useQuery({
    queryKey: ["chat-endpoint-setup-test-status", endpointId],
    queryFn: () => chatEndpointsApi.setupTestStatus(endpointId),
    enabled: provider === "slack", refetchInterval: 1_500,
  });
  const [commandCopied, setCommandCopied] = useState(false);
  const [commandCopyError, setCommandCopyError] = useState(false);
  const principalsQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.principals(endpointId),
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
    refetchInterval: 1_500,
  });
  const [numberCopied, setNumberCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const identities = principalsQuery.data ?? [];
  const unlinkedIdentities = identities.filter(
    (identity) => identity.status !== "linked",
  );
  const freshConversationInstruction =
    provider === "imessage-photon" ? "send a fresh message to your Photon number" : provider === "telegram"
      ? "start a fresh conversation with /new and send the test message again"
      : provider === "github"
        ? "start a new issue or pull request conversation and mention the agent again"
        : provider === "microsoft-teams"
          ? "start a new channel post and mention the agent again"
          : "send a new root mention to the agent";
  const identityGuidance = provider === "slack" ? null : provider === "imessage-photon" && principalsQuery.isSuccess && (identities.length === 0 || unlinkedIdentities.length > 0)
    ? { tone: "info" as const, title: "Link your Messages identity", body: "Send one message to discover your phone number or Apple account address, then link that exact identity in Access. Send a fresh request after linking; earlier messages do not start work." }
    : principalsQuery.isError
    ? {
        tone: "warning" as const,
        title: "Identity readiness could not be checked",
        body: `Review Access before expecting an agent reply. After linking the account you are testing, ${freshConversationInstruction}.`,
      }
    : !principalsQuery.isSuccess || guestIsolationState === "loading"
      ? null
      : identities.length === 0
        ? guestIsolationState === "disabled"
          ? {
              tone: "warning" as const,
              title: "Link the account you’re testing",
              body:
                provider === "telegram"
                  ? "Tap Start in Telegram to discover your account; the welcome does not start an agent run. Link the account privately in Access, then return and send the test message."
                  : `Your first ${providerNames[provider]} message discovers the external account, but isolated guest work is off, so it cannot safely start ${agentName}. Send it once, link that account privately in Access, then ${freshConversationInstruction}.`,
            }
          : {
              tone: "info" as const,
              title: "Your first message identifies your account",
              body:
                provider === "telegram"
                  ? "Tap Start in Telegram to discover your account. Until linked, it is a restricted guest and still needs a sandbox-backed isolated run; test that path intentionally, or link it in Access and then send the test message."
                  : `Until linked, the account is a restricted guest and still needs a sandbox-backed isolated run. Test that guest path intentionally, or link the account in Access and then ${freshConversationInstruction}.`,
            }
        : unlinkedIdentities.length > 0
          ? guestIsolationState === "disabled"
            ? {
                tone: "warning" as const,
                title: "Link the account you’re testing",
                body: `An observed external account is unlinked, and isolated guest work is off, so it cannot safely start ${agentName}. Link the account in Access, then ${freshConversationInstruction}; Paperclip does not replay the refused request.`,
              }
            : {
                tone: "info" as const,
                title: "Unlinked identity detected",
                body: `An unlinked account is a restricted guest and still needs a sandbox-backed isolated run. Test guest access intentionally, or link the account in Access and then ${freshConversationInstruction}.`,
              }
          : null;
  const providerBotUsername = botUsername?.replace(/^@/, "");
  const normalizedBotUsername =
    provider === "github"
      ? providerBotUsername?.replace(/\[bot\]$/i, "")
      : providerBotUsername;
  const botMention = normalizedBotUsername
    ? `@${normalizedBotUsername}`
    : (botLabel ?? agentName);
  const slackTestMessage = `${botMention.startsWith("@") ? botMention : `@${botMention}`} you there?`;
  const instructions =
    provider === "imessage-photon" ? [
      photonAllocation === "shared" ? "In your Photon project, enroll your sender in Users and find its assigned number in Get started. Send a fresh message to that number from Apple Messages." : `Open Apple Messages and send a fresh message to ${botUsername ?? botLabel ?? "the dedicated number"}.`,
      "Link the discovered sender to a Paperclip person in Access, then send a fresh request.",
      "Wait for the agent’s actual reply. Setup completes after that reply is delivered.",
      ...(photonAllocation === "shared" ? ["This Pro-compatible channel supports DMs only. Group messages cannot start work."] : ["For a group: add the number in Messages, send a message, enable the discovered group in Settings, then send a fresh request."]),
    ] : provider === "discord"
      ? [
          "Open a text channel where the bot is installed.",
          `Mention ${botMention} in a new root message.`,
          `Reply once inside ${agentName}'s new Discord thread.`,
        ]
      : provider === "telegram"
        ? [
            "Open the bot's private chat.",
            "Tap Start.",
            "Send “Help me test this”.",
          ]
        : provider === "github"
          ? [
              "Open an installed issue or pull request.",
              `Mention ${botMention} in a comment.`,
              "Add another comment to continue the same task.",
            ]
          : provider === "microsoft-teams"
            ? [
                "Open an installed channel and start a new post.",
                `Mention ${botMention} in the post.`,
                "Reply once beneath the post.",
              ]
            : [
                `Open a channel and invite ${botMention} if needed.`,
                `Mention ${botMention} in a new channel message.`,
                `Reply once in ${agentName}'s thread.`,
              ];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{t("try")}{" "}{agentName}{" "}{t("zhComponents.text_af10ef20dd")}{" "}{providerNames[provider]}
        </h1>
        {provider !== "slack" && <p className="mt-1 text-sm text-muted-foreground">{t("stability.fae6c4770a9b", { defaultValue: "Complete this real conversation to finish setup." })}</p>}
      </div>
      {(!principalsQuery.isSuccess || guestIsolationState === "loading") &&
      !principalsQuery.isError ? (
        <p role="status" className="text-sm text-muted-foreground">{t("stability.572f064e1675", { defaultValue: "Checking identity and guest readiness…" })}</p>
      ) : null}
      {identityGuidance ? (
        <div
          role={identityGuidance.tone === "warning" ? "alert" : "status"}
          className={
            identityGuidance.tone === "warning"
              ? "rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
              : "rounded-lg border border-border bg-muted/30 p-4 text-sm"
          }
        >
          <h2 className="font-medium">{identityGuidance.title}</h2>
          <p className="mt-1 text-muted-foreground">{identityGuidance.body}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={onOpenAccess}
          >{t("stability.31688e7ebbfc", { defaultValue: "Review identity access" })}</Button>
        </div>
      ) : null}
      {provider === "imessage-photon" && botUsername && <div className="space-y-2"><Button variant="outline" onClick={() => { void copyTextToClipboard(botUsername).then(() => { setNumberCopied(true); setCopyError(null); }, () => setCopyError("Could not copy the number. Select it in the instructions below.")); }}>{numberCopied ? t("stability.4bf3f054bc40", { defaultValue: "Number copied" }) : `Copy ${botUsername}`}</Button>{copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}</div>}
      {provider === "slack" ? (
        <>
          <ol className="list-decimal space-y-4 pl-5 text-sm">
            <li>{t("stability.8ef53ea7eb55", { defaultValue: "Open a channel and invite" })}{" "}{botMention}{" "}{t("stability.80b41565d71a", { defaultValue: "if needed." })}</li>
            <li>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <code>{slackTestMessage}</code>
                <Button size="sm" variant="ghost" onClick={() => {
                  void copyTextToClipboard(slackTestMessage).then(() => { setCommandCopied(true); setCommandCopyError(false); }, () => setCommandCopyError(true));
                }}><Copy className="size-4" />{commandCopied ? t("copied") : t("copy_message")}</Button>
              </div>
              <p className="mt-2 text-muted-foreground">{t("stability.dc432c935515", { defaultValue: "Select the bot from Slack’s @mention suggestions." })}</p>
            </li>
            <li>{t("stability.88bf894ffd73", { defaultValue: "Continue the conversation in the thread." })}</li>
          </ol>
          {commandCopyError && <p role="alert" className="text-sm text-destructive">{t("stability.2d6635486c28", { defaultValue: "Couldn't copy. Select and copy the command above." })}</p>}
          {messageStatus.data?.messageReceivedAt ? <p role="status" className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-(--status-task-done)" />{t("stability.5fa101ce9e5e", { defaultValue: "Received your Slack message." })}</p>
            : <p role={messageStatus.isError ? "alert" : "status"} className="text-sm text-muted-foreground">{messageStatus.isError ? t("stability.cf8b24f32438", { defaultValue: "Couldn’t check for your message. You can still finish setup." }) : t("stability.e7c6f9669f44", { defaultValue: "We’ll check for your message automatically. This test is optional." })}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" className="text-muted-foreground" onClick={onSaveExit}>{t("stability.0bd63bf3d32e", { defaultValue: "Save & exit" })}</Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" disabled={pending} onClick={onTest}>{t("stability.d41475fabe79", { defaultValue: "Skip test and finish" })}</Button>
              <Button disabled={pending} onClick={onTest}>{pending && <Loader2 className="size-4 animate-spin" />}{t("stability.a3c904fc3c0d", { defaultValue: "I've sent the test message" })}</Button>
            </div>
          </div>
        </>
      ) : <>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {instructions.map((item) => <li key={item}>{item}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        {providerUrl && (
          <Button asChild variant="outline">
            <a href={providerUrl} target="_blank" rel="noopener noreferrer">{t("open")}{" "}{providerNames[provider]} <ExternalLink />
            </a>
          </Button>
        )}
        <Button disabled={pending} onClick={onTest}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}{t("stability.a3c904fc3c0d", { defaultValue: "I've sent the test message" })}</Button>
      </div>
      </>}
    </div>
  );
}
