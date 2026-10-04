import { getDisplayLabel } from "@/lib/display-labels";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENT_ADAPTER_TYPES } from "@paperclipai/shared";
import type { AgentAdapterType, JoinRequest } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { useCompany } from "@/context/CompanyContext";
import { Link, useNavigate, useParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { fetchCompanyListForCurrentAccount, useCompanyListQuery } from "../api/companies-query";
import { healthApi } from "../api/health";
import { getAdapterLabel } from "../adapters/adapter-display-registry";
import { clearPendingInviteToken, rememberPendingInviteToken } from "../lib/invite-memory";
import { queryKeys } from "../lib/queryKeys";
import { formatDate } from "../lib/utils";
import { t, useTranslation } from "@/i18n";

type AuthMode = "sign_in" | "sign_up";
type AuthFeedback = { tone: "error" | "info"; message: string };

// Agent-invite onboarding remains a legacy-adapter flow. Native runner setup
// belongs in authenticated agent configuration after an administrator enables
// the experimental flag.
const joinAdapterOptions: AgentAdapterType[] = AGENT_ADAPTER_TYPES.filter(
  (type) => type !== "paperclip_runner",
);
const ENABLED_INVITE_ADAPTERS = new Set([
  "claude_local",
  "codex_local",
  "gemini_local",
  "kimi_local",
  "opencode_local",
  "pi_local",
  "cursor",
]);

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

const fieldClassName =
  "w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500";
const panelClassName = "border border-zinc-800 bg-zinc-950/95 p-6";
const modeButtonBaseClassName =
  "flex-1 border px-3 py-2 text-sm transition-colors";

function formatHumanRole(role: string | null | undefined) {
  if (!role) return null;
  return getDisplayLabel(role.charAt(0).toUpperCase() + role.slice(1));
}

function getAuthErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim().length > 0 ? code : null;
}

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null;
  const message = error.message.trim();
  return message.length > 0 ? message : null;
}

function mapInviteAuthFeedback(
  error: unknown,
  authMode: AuthMode,
  email: string,
): AuthFeedback {
  const code = getAuthErrorCode(error);
  const message = getAuthErrorMessage(error);
  const authError = error && typeof error === "object"
    ? error as { status?: unknown; rawMessage?: unknown }
    : null;
  const status = typeof authError?.status === "number" ? authError.status : null;
  const rawMessage = typeof authError?.rawMessage === "string" ? authError.rawMessage.trim() : message;
  const emailLabel = email.trim().length > 0 ? email.trim() : t("that_email");

  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return {
      tone: "info",
      message: t("zhPages.1f1c7e2e2bc2", { emailLabel: emailLabel }),
    };
  }

  if (code === "INVALID_EMAIL_OR_PASSWORD") {
    return {
      tone: "error",
      message:
        t("that_email_and_password_did_not_match_an_existin"),
    };
  }

  if (authMode === "sign_in" && (status === 401 || rawMessage === "Request failed: 401")) {
    return {
      tone: "error",
      message:
        t("that_email_and_password_did_not_match_an_existin"),
    };
  }

  if (authMode === "sign_up" && (status === 422 || rawMessage === "Request failed: 422")) {
    return {
      tone: "info",
      message: t("zhPages.e60e36705490", { emailLabel: emailLabel }),
    };
  }

  return {
    tone: "error",
    message: message ?? t("authentication_failed"),
  };
}

function isBootstrapAcceptancePayload(payload: unknown) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "bootstrapAccepted" in (payload as Record<string, unknown>),
  );
}

function isApprovedHumanJoinPayload(payload: unknown, showsAgentForm: boolean) {
  if (!payload || typeof payload !== "object" || showsAgentForm) return false;
  const status = (payload as { status?: unknown }).status;
  return status === "approved";
}

type AwaitingJoinApprovalPanelProps = {
  companyDisplayName: string;
  companyLogoUrl: string | null;
  invitedByUserName: string | null;
  claimSecret?: string | null;
  claimApiKeyPath?: string | null;
  onboardingTextUrl?: string | null;
};

function InviteCompanyLogo({
  companyDisplayName,
  companyLogoUrl,
  className,
}: {
  companyDisplayName: string;
  companyLogoUrl: string | null;
  className?: string;
}) {
  return (
    <CompanyPatternIcon
      companyName={companyDisplayName}
      logoUrl={companyLogoUrl}
      logoFit="contain"
      className={className}
    />
  );
}

function AwaitingJoinApprovalPanel({
  companyDisplayName,
  companyLogoUrl,
  invitedByUserName,
  claimSecret = null,
  claimApiKeyPath = null,
  onboardingTextUrl = null,
}: AwaitingJoinApprovalPanelProps) {
  const { t } = useTranslation();
  const approverLabel = invitedByUserName ?? t("an_organization_admin");

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6" data-testid="invite-pending-approval">
        <div className="flex items-center gap-3">
          <InviteCompanyLogo
            companyDisplayName={companyDisplayName}
            companyLogoUrl={companyLogoUrl}
            className="h-12 w-12 border border-zinc-800 rounded-none"
          />
          <h1 className="text-lg font-semibold">{t("request_to_join")} {companyDisplayName}</h1>
        </div>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-400">
            {t("your_request_is_still_awaiting_approval")} {approverLabel} {t("must_approve_your_request_to_join")}
          </p>
          <div className="border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500 mb-1">{t("approval_page")}</p>
            <p className="text-sm text-zinc-200">{t("settings_members")}</p>
          </div>
          <p className="text-sm text-zinc-400">
            {t("ask_them_to_visit")} <span className="text-zinc-200">{t("settings_members")}</span> {t("to_approve_your_request")}
          </p>
          <p className="text-xs text-zinc-500">
            {t("refresh_this_page_after_youve_been_approved_youl")}
          </p>
        </div>
        {claimSecret && claimApiKeyPath ? (
          <div className="mt-4 space-y-1 border border-zinc-800 p-3 text-xs text-zinc-400">
            <div className="text-zinc-200">{t("claim_secret")}</div>
            <div className="font-mono break-all">{claimSecret}</div>
            <div className="font-mono break-all">POST {claimApiKeyPath}</div>
          </div>
        ) : null}
        {onboardingTextUrl ? (
          <div className="mt-4 text-xs text-zinc-400">
            {t("onboarding")} <span className="font-mono break-all">{onboardingTextUrl}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InviteLandingPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setSelectedCompanyId } = useCompany();
  const params = useParams();
  const token = (params.token ?? "").trim();
  const [authMode, setAuthMode] = useState<AuthMode>("sign_up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agentName, setAgentName] = useState("");
  const [adapterType, setAdapterType] = useState<AgentAdapterType>("claude_local");
  const [capabilities, setCapabilities] = useState("");
  const [result, setResult] = useState<{ kind: "bootstrap" | "join"; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authFeedback, setAuthFeedback] = useState<AuthFeedback | null>(null);
  const [autoAcceptStarted, setAutoAcceptStarted] = useState(false);
  const authErrorId = "invite-auth-error";

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const inviteQuery = useQuery({
    queryKey: queryKeys.access.invite(token),
    queryFn: () => accessApi.getInvite(token),
    enabled: token.length > 0,
    retry: false,
  });

  // Whose list this is, is no longer this page's problem: the entry is keyed by
  // account, so another account's list is unreachable rather than merely
  // distrusted. What is left for the gate below is narrower and still real — do
  // we have an answer *yet*. Without it, a pending query reads as an empty list,
  // which reads as "not a member", which auto-accepts an invite the customer may
  // already hold.
  //
  // Hence `staleTime: 0` and a mount-scoped flag rather than `isSuccess`: a
  // cached list is the right account's now, but it can be thirty seconds old, and
  // acting on "not a member" is the direction that costs something.
  //
  // `local_trusted` has no accounts at all, so there is no identity to key on and
  // nothing to check the list against; the gate stays open.
  const companiesQuery = useCompanyListQuery({
    enabled: !!sessionQuery.data && !!inviteQuery.data?.companyId,
    staleTime: 0,
  });
  const membershipIsAccountScoped = healthQuery.data?.deploymentMode !== "local_trusted";
  // No `sessionQuery.data` term: the query only fetches while a session exists, so
  // the flag cannot be true without one, and if the session lapses the observer
  // re-keys to the anonymous entry and holds no data to leak.
  const membershipListIsCurrent = membershipIsAccountScoped
    ? companiesQuery.isFetchedAfterMount
    : true;
  const companyList = membershipListIsCurrent ? companiesQuery.data?.companies ?? [] : [];

  useEffect(() => {
    if (token) rememberPendingInviteToken(token);
  }, [token]);

  useEffect(() => {
    setAutoAcceptStarted(false);
  }, [token]);

  useEffect(() => {
    if (!membershipListIsCurrent) return;
    const list = companiesQuery.data?.companies;
    if (!list || !inviteQuery.data?.companyId) return;
    if (list.some((c) => c.id === inviteQuery.data!.companyId)) {
      clearPendingInviteToken(token);
    }
  }, [companiesQuery.data, inviteQuery.data, membershipListIsCurrent, token]);

  const invite = inviteQuery.data;
  const isCheckingExistingMembership =
    Boolean(sessionQuery.data) &&
    Boolean(invite?.companyId) &&
    !membershipListIsCurrent;
  const isCurrentMember =
    Boolean(invite?.companyId) &&
    companyList.some((company) => company.id === invite?.companyId);
  const companyName = invite?.companyName?.trim() || null;
  const companyDisplayName = companyName || t("this_paperclip_company");
  const companyLogoUrl = invite?.companyLogoUrl?.trim() || null;
  const invitedByUserName = invite?.invitedByUserName?.trim() || null;
  const inviteMessage = invite?.inviteMessage?.trim() || null;
  const requestedHumanRole = formatHumanRole(invite?.humanRole);
  const inviteJoinRequestStatus = invite?.joinRequestStatus ?? null;
  const inviteJoinRequestType = invite?.joinRequestType ?? null;
  const canCompleteAcceptedHumanInvite =
    inviteJoinRequestType === "human" &&
    (inviteJoinRequestStatus === "pending_approval" || inviteJoinRequestStatus === "approved");
  const requiresHumanAccount =
    healthQuery.data?.deploymentMode === "authenticated" &&
    !sessionQuery.data &&
    invite?.allowedJoinTypes !== "agent";
  const showsAgentForm = invite?.inviteType !== "bootstrap_ceo" && invite?.allowedJoinTypes === "agent";
  const shouldAutoAcceptHumanInvite =
    Boolean(sessionQuery.data) &&
    !showsAgentForm &&
    invite?.inviteType !== "bootstrap_ceo" &&
    (!inviteJoinRequestStatus || canCompleteAcceptedHumanInvite) &&
    !isCheckingExistingMembership &&
    !isCurrentMember &&
    !result &&
    error === null;
  const sessionLabel =
    sessionQuery.data?.user.name?.trim() ||
    sessionQuery.data?.user.email?.trim() ||
    t("this_account");

  const authCanSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (authMode === "sign_in" || (name.trim().length > 0 && password.trim().length >= 8));

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!invite) throw new Error(t("invite_not_found"));
      if (isCheckingExistingMembership) {
        throw new Error(t("checking_your_organization_access_try_again_in_a"));
      }
      if (isCurrentMember) {
        throw new Error(t("this_account_already_belongs_to_the_organization"));
      }
      if (invite.inviteType === "bootstrap_ceo" || invite.allowedJoinTypes !== "agent") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      return accessApi.acceptInvite(token, {
        requestType: "agent",
        agentName: agentName.trim(),
        adapterType,
        capabilities: capabilities.trim() || null,
      });
    },
    onSuccess: async (payload) => {
      setError(null);
      clearPendingInviteToken(token);
      const asBootstrap = isBootstrapAcceptancePayload(payload);
      setResult({ kind: asBootstrap ? "bootstrap" : "join", payload });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.currentBoardAccess });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      if (invite?.companyId && isApprovedHumanJoinPayload(payload, showsAgentForm)) {
        setSelectedCompanyId(invite.companyId, { source: "manual" });
        navigate("/", { replace: true });
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("failed_to_accept_invite"));
    },
  });

  useEffect(() => {
    if (!shouldAutoAcceptHumanInvite || autoAcceptStarted || acceptMutation.isPending) return;
    setAutoAcceptStarted(true);
    setError(null);
    acceptMutation.mutate();
  }, [acceptMutation, autoAcceptStarted, shouldAutoAcceptHumanInvite]);

  const authMutation = useMutation({
    mutationFn: async () => {
      if (authMode === "sign_in") {
        await authApi.signInEmail({ email: email.trim(), password });
        return;
      }
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    },
    onSuccess: async () => {
      setAuthFeedback(null);
      rememberPendingInviteToken(token);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.currentBoardAccess });
      // Keyed to the account that just signed in — the helper resolves the
      // identity past the invalidation above rather than trusting the session
      // entry still sitting in the cache — and forced past whatever is cached
      // for it. This replaces the hand-rolled cancel-and-refetch this PR
      // originally carried, which #11488 made both unnecessary and weaker.
      const { companies: freshCompanies } = await fetchCompanyListForCurrentAccount(queryClient);

      if (invite?.companyId && freshCompanies.some((company) => company.id === invite.companyId)) {
        clearPendingInviteToken(token);
        setSelectedCompanyId(invite.companyId, { source: "manual" });
        navigate("/", { replace: true });
        return;
      }

      if (!invite || invite.inviteType !== "bootstrap_ceo") {
        return;
      }

      try {
        const payload = await acceptMutation.mutateAsync();
        if (isBootstrapAcceptancePayload(payload)) {
          navigate("/", { replace: true });
        }
      } catch {
        return;
      }
    },
    onError: (err) => {
      const nextFeedback = mapInviteAuthFeedback(err, authMode, email);
      if (getAuthErrorCode(err) === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        setAuthMode("sign_in");
        setPassword("");
      }
      setAuthFeedback(nextFeedback);
    },
  });

  const joinButtonLabel = useMemo(() => {
    if (!invite) return t("continue");
    if (isCurrentMember) return t("open_organization");
    if (invite.inviteType === "bootstrap_ceo") return t("accept_invite");
    if (showsAgentForm) return t("submit_request");
    return sessionQuery.data ? t("accept_invite") : t("continue");
  }, [invite, isCurrentMember, sessionQuery.data, showsAgentForm]);

  if (!token) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{t("invalid_invite_token")}</div>;
  }

  if (inviteQuery.isLoading || healthQuery.isLoading || sessionQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{t("loading_invite")}</div>;
  }

  if (isCheckingExistingMembership) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{t("checking_your_access")}</div>;
  }

  if (inviteQuery.error || !invite) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="border border-border bg-card p-6" data-testid="invite-error">
          <h1 className="text-lg font-semibold">{t("invite_not_available")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("this_invite_may_be_expired_revoked_or_already_us")}
          </p>
        </div>
      </div>
    );
  }

  if (
    inviteJoinRequestStatus === "approved" &&
    inviteJoinRequestType === "human" &&
    isCurrentMember
  ) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{t("opening_organization")}</div>;
  }

  if (inviteJoinRequestStatus === "pending_approval" && !canCompleteAcceptedHumanInvite) {
    return (
      <AwaitingJoinApprovalPanel
        companyDisplayName={companyDisplayName}
        companyLogoUrl={companyLogoUrl}
        invitedByUserName={invitedByUserName}
      />
    );
  }

  if (inviteJoinRequestStatus && !canCompleteAcceptedHumanInvite) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="border border-border bg-card p-6" data-testid="invite-error">
          <h1 className="text-lg font-semibold">{t("invite_not_available")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {inviteJoinRequestStatus === "rejected"
              ? t("this_join_request_was_not_approved")
              : t("this_invite_has_already_been_used")}
          </p>
        </div>
      </div>
    );
  }

  if (result?.kind === "bootstrap") {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
        <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-lg font-semibold">{t("bootstrap_complete")}</h1>
          <div className="mt-4">
            <Button asChild className="rounded-none">
              <Link to="/">{t("open_board")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (result?.kind === "join") {
    const payload = result.payload as JoinRequest & {
      claimSecret?: string;
      claimApiKeyPath?: string;
      onboarding?: Record<string, unknown>;
    };
    const claimSecret = typeof payload.claimSecret === "string" ? payload.claimSecret : null;
    const claimApiKeyPath = typeof payload.claimApiKeyPath === "string" ? payload.claimApiKeyPath : null;
    const onboardingTextUrl = readNestedString(payload.onboarding, ["textInstructions", "url"]);
    const joinedNow = !showsAgentForm && payload.status === "approved";

    return (
      joinedNow ? (
        <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
          <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex items-center gap-3">
              <InviteCompanyLogo
                companyDisplayName={companyDisplayName}
                companyLogoUrl={companyLogoUrl}
                className="h-12 w-12 border border-zinc-800 rounded-none"
              />
              <h1 className="text-lg font-semibold">{t("you_joined_the_organization")}</h1>
            </div>
            <div className="mt-4">
              <Button asChild className="w-full rounded-none">
                <Link to="/">{t("open_board")}</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <AwaitingJoinApprovalPanel
          companyDisplayName={companyDisplayName}
          companyLogoUrl={companyLogoUrl}
          invitedByUserName={invitedByUserName}
          claimSecret={claimSecret}
          claimApiKeyPath={claimApiKeyPath}
          onboardingTextUrl={onboardingTextUrl}
        />
      )
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-(--gtc-36)">
          <section className={`${panelClassName} space-y-6`}>
            <div className="flex items-start gap-4">
              <InviteCompanyLogo
                companyDisplayName={companyDisplayName}
                companyLogoUrl={companyLogoUrl}
                className="h-16 w-16 rounded-none border border-zinc-800"
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-(--tracking-caps) text-zinc-500">
                  {t("youve_been_invited_to_join_paperclip")}
                </p>
                <h1 className="mt-2 text-2xl font-semibold">
                  {invite.inviteType === "bootstrap_ceo" ? t("set_up_paperclip") : t("zhPages.2ed83168fecb", { companyDisplayName: companyDisplayName })}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                  {showsAgentForm
                    ? t("review_the_invite_details_then_submit_the_agent")
                    : requiresHumanAccount
                      ? t("create_your_paperclip_account_first_if_you_alrea")
                      : t("your_account_is_ready_review_the_invite_details")}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border border-zinc-800 p-3">
                <div className="text-xs uppercase tracking-(--tracking-caps) text-zinc-500">{t("organization")}</div>
                <div className="mt-1 text-sm text-zinc-100">{companyDisplayName}</div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="text-xs uppercase tracking-(--tracking-caps) text-zinc-500">{t("invited_by")}</div>
                <div className="mt-1 text-sm text-zinc-100">{invitedByUserName ?? t("paperclip_board")}</div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="text-xs uppercase tracking-(--tracking-caps) text-zinc-500">{t("requested_access")}</div>
                <div className="mt-1 text-sm text-zinc-100">
                  {showsAgentForm ? t("agent_join_request") : requestedHumanRole ?? t("organization_access")}
                </div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="text-xs uppercase tracking-(--tracking-caps) text-zinc-500">{t("invite_expires")}</div>
                <div className="mt-1 text-sm text-zinc-100">{formatDate(invite.expiresAt)}</div>
              </div>
            </div>

            {inviteMessage ? (
              <div className="border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="text-xs uppercase tracking-(--tracking-caps) text-amber-200/80">{t("message_from_inviter")}</div>
                <p className="mt-2 text-sm leading-6 text-amber-50">{inviteMessage}</p>
              </div>
            ) : null}

            {sessionQuery.data ? (
              <div className="border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                {t("signed_in_as")} <span className="font-medium">{sessionLabel}</span>.
              </div>
            ) : null}
          </section>

          <section className={`${panelClassName} h-fit`}>
            {showsAgentForm ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{t("submit_agent_details")}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {t("this_invite_will_create_an_approval_request_for")} {companyDisplayName}.
                  </p>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-400">{t("agent_name")}</span>
                  <input
                    className={fieldClassName}
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-400">{t("adapter_type")}</span>
                  <select
                    className={fieldClassName}
                    value={adapterType}
                    onChange={(event) => setAdapterType(event.target.value as AgentAdapterType)}
                  >
                    {joinAdapterOptions.map((type) => (
                      <option key={type} value={type} disabled={!ENABLED_INVITE_ADAPTERS.has(type)}>
                        {getAdapterLabel(type)}{!ENABLED_INVITE_ADAPTERS.has(type) ? t("coming_soon_bb4659") : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-400">{t("capabilities")}</span>
                  <textarea
                    className={fieldClassName}
                    rows={4}
                    value={capabilities}
                    onChange={(event) => setCapabilities(event.target.value)}
                  />
                </label>
                {error ? <p className="text-xs text-red-400">{error}</p> : null}
                <Button
                  className="w-full rounded-none"
                  disabled={acceptMutation.isPending || agentName.trim().length === 0}
                  onClick={() => acceptMutation.mutate()}
                >
                  {acceptMutation.isPending ? t("working_049ac8") : joinButtonLabel}
                </Button>
              </div>
            ) : requiresHumanAccount ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">
                    {authMode === "sign_up" ? t("create_your_account") : t("sign_in_to_continue")}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {authMode === "sign_up"
                      ? t("zhPages.72162f4440ef", { companyDisplayName: companyDisplayName })
                      : t("use_the_paperclip_account_that_already_matches_t")}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${modeButtonBaseClassName} ${
                      authMode === "sign_up"
                        ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                        : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                    onClick={() => {
                      setAuthFeedback(null);
                      setAuthMode("sign_up");
                    }}
                  >
                    {t("create_account_aaf374")}
                  </button>
                  <button
                    type="button"
                    className={`${modeButtonBaseClassName} ${
                      authMode === "sign_in"
                        ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                        : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                    onClick={() => {
                      setAuthFeedback(null);
                      setAuthMode("sign_in");
                    }}
                  >
                    {t("i_already_have_an_account")}
                  </button>
                </div>

                <form
                  className="space-y-4"
                  method="post"
                  action={authMode === "sign_up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (authMutation.isPending) return;
                    if (!authCanSubmit) {
                      setAuthFeedback({ tone: "error", message: t("please_fill_in_all_required_fields") });
                      return;
                    }
                    authMutation.mutate();
                  }}
                  data-testid="invite-inline-auth"
                >
                  {authMode === "sign_up" ? (
                    <label className="block text-sm" htmlFor="invite-name">
                      <span className="mb-1 block text-zinc-400">{t("name")}</span>
                      <input
                        id="invite-name"
                        name="name"
                        className={fieldClassName}
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                          setAuthFeedback(null);
                        }}
                        autoComplete="name"
                        required
                        aria-required="true"
                        aria-invalid={authFeedback?.tone === "error" ? true : undefined}
                        aria-describedby={authFeedback ? authErrorId : undefined}
                        autoFocus
                      />
                    </label>
                  ) : null}
                  <label className="block text-sm" htmlFor="invite-email">
                    <span className="mb-1 block text-zinc-400">{t("email")}</span>
                    <input
                      id="invite-email"
                      name="email"
                      type="email"
                      className={fieldClassName}
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setAuthFeedback(null);
                      }}
                      autoComplete="username"
                      required
                      aria-required="true"
                      aria-invalid={authFeedback?.tone === "error" ? true : undefined}
                      aria-describedby={authFeedback ? authErrorId : undefined}
                      autoFocus={authMode === "sign_in"}
                    />
                  </label>
                  <label className="block text-sm" htmlFor="invite-password">
                    <span className="mb-1 block text-zinc-400">{t("password")}</span>
                    <input
                      id="invite-password"
                      name="password"
                      type="password"
                      className={fieldClassName}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setAuthFeedback(null);
                      }}
                      autoComplete={authMode === "sign_in" ? "current-password" : "new-password"}
                      required
                      aria-required="true"
                      aria-invalid={authFeedback?.tone === "error" ? true : undefined}
                      aria-describedby={authFeedback ? authErrorId : undefined}
                    />
                  </label>
                  {authFeedback ? (
                    <p
                      id={authErrorId}
                      role="alert"
                      className={`text-xs ${
                        authFeedback.tone === "info" ? "text-amber-300" : "text-red-400"
                      }`}
                    >
                      {authFeedback.message}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full rounded-none"
                    disabled={authMutation.isPending}
                    aria-disabled={!authCanSubmit || authMutation.isPending}
                  >
                    {authMutation.isPending
                      ? t("working_049ac8")
                      : authMode === "sign_in"
                        ? t("sign_in_and_continue")
                        : t("create_account_and_continue")}
                  </Button>
                </form>

                <p className="text-xs leading-5 text-zinc-500">
                  {authMode === "sign_up"
                    ? t("already_signed_up_before_use_the_existing_accoun")
                    : t("no_account_yet_switch_back_to_create_account_so")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {isCurrentMember
                      ? t("already_in_this_organization")
                      : shouldAutoAcceptHumanInvite
                      ? t("completing_organization_access")
                      : invite.inviteType === "bootstrap_ceo"
                        ? t("accept_bootstrap_invite")
                        : t("accept_organization_invite")}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {shouldAutoAcceptHumanInvite
                      ? t("zhPages.14d2ac993592", { companyDisplayName: companyDisplayName })
                      : isCurrentMember
                      ? t("zhPages.1526a4e92ffb", { companyDisplayName: companyDisplayName })
                      : t("zhPages.d5a889efa52a", { value: invite.inviteType === "bootstrap_ceo" ? t("finish_setting_up_paperclip") : t("zhPages.d54341bd5f5d", { companyDisplayName: companyDisplayName }) })}
                  </p>
                </div>
                {error ? <p className="text-xs text-red-400">{error}</p> : null}
                {shouldAutoAcceptHumanInvite ? (
                  <div className="text-sm text-zinc-400">
                    {acceptMutation.isPending ? t("submitting_request") : t("finishing_sign_in")}
                  </div>
                ) : (
                  <Button
                    className="w-full rounded-none"
                    disabled={acceptMutation.isPending}
                    onClick={() => {
                      if (isCurrentMember && invite.companyId) {
                        clearPendingInviteToken(token);
                        setSelectedCompanyId(invite.companyId, { source: "manual" });
                        navigate("/", { replace: true });
                        return;
                      }
                      acceptMutation.mutate();
                    }}
                  >
                    {acceptMutation.isPending ? t("working_049ac8") : joinButtonLabel}
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
