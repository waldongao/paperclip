import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil } from "lucide-react";
import type {
  ToolApplication,
  ToolConnection,
  ToolPolicy,
  ToolProfileWithDetails,
} from "@paperclipai/shared";
import {
  connectionDisplaySecondaryHint,
  humanizeConnectionDisplayName,
  isToolConnectionAttentionHealth as isAttentionHealthStatus,
} from "@paperclipai/shared";
import { Navigate, useParams, useNavigate, useSearchParams } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { toolsApi } from "@/api/tools";
import { agentsApi } from "@/api/agents";
import { accessApi } from "@/api/access";
import { authApi } from "@/api/auth";
import { buildCompanyUserLabelMap, buildCompanyUserProfileMap } from "@/lib/company-members";
import { installPayload, installStateFrom, type InstallState } from "@/lib/tool-installs";
import { resolveAuthorizationTarget } from "@/lib/authorizationUrl";
import { navigateTopLevel } from "@/lib/browserNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppLogo } from "./AppLogo";
import { UnverifiedServerBadge } from "./UnverifiedServerBadge";
import {
  appApplicationSourceSlug,
  appConnectionSourceSlug,
  appDefinitionDarkLogoUrl,
  appDefinitionLogoUrl,
  appDefinitionName,
  appDefinitionSlug,
  type AppGalleryDisplayEntry,
} from "./app-definition-display";
import { appTabHref, appTabLabel, isAppTabKey, type AppTabKey } from "./app-tabs";
import { SetupPanel } from "./app-detail/SetupPanel";
import { ServicesPanel } from "./app-detail/ServicesPanel";
import { ConnectionProvenanceChip } from "./ComposioProvenanceChip";
import { IdentitiesSection } from "./app-detail/IdentitiesSection";
import { PermissionsPanel } from "./app-detail/PermissionsPanel";
import { TestPanel } from "./app-detail/TestPanel";
import {
  formatActionPermissionSummary,
  summarizeActionPermissions,
} from "./app-detail/action-permission-summary";
import { ReviewPanel } from "./app-detail/ReviewPanel";
import { ActivityPanel } from "./app-detail/ActivityPanel";
import {
  AdvancedPanel,
  ReconnectCard,
  DangerZone,
  connectionAddress,
  connectionTransportLabel,
} from "./app-detail/AdvancedPanel";
import type { AccessDraft } from "./app-detail/types";
import {
  connectionDisplayNameForOwner,
  connectionOwnerProfile,
} from "./connection-owner";
import { t, useTranslation } from "@/i18n";

export { DangerZone, connectionAddress, connectionTransportLabel };

export function AppDetail() {
  const { t } = useTranslation();
  const { connectionId = "", tab } = useParams<{ connectionId: string; tab?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const activeTab: AppTabKey | null = isAppTabKey(tab) ? tab : null;
  const needsCatalog = activeTab === "setup" || activeTab === "review" || activeTab === "permissions" || activeTab === "test";

  const connectionQuery = useQuery({
    queryKey: queryKeys.tools.connection(connectionId),
    queryFn: () => toolsApi.getConnection(connectionId),
    enabled: !!connectionId && !!activeTab,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId && activeTab === "setup",
  });
  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const installsQuery = useQuery({
    queryKey: queryKeys.tools.connectionInstalls(connectionId),
    queryFn: () => toolsApi.getConnectionInstalls(connectionId),
    enabled: !!connectionId && activeTab === "permissions",
  });
  const galleryQuery = useQuery({
    queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGallery(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const catalogQuery = useQuery({
    queryKey: queryKeys.tools.catalog(connectionId),
    queryFn: () => toolsApi.listCatalog(connectionId),
    enabled: !!connectionId && needsCatalog,
  });
  const profilesQuery = useQuery({
    queryKey: queryKeys.tools.profiles(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listProfiles(selectedCompanyId!),
    enabled: !!selectedCompanyId && (
      activeTab === "setup" || activeTab === "review" || activeTab === "permissions"
    ),
  });
  const policiesQuery = useQuery({
    queryKey: queryKeys.tools.policies(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listPolicies(selectedCompanyId!),
    enabled: !!selectedCompanyId && (
      activeTab === "setup" || activeTab === "review" || activeTab === "permissions"
    ),
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && (
      activeTab === "setup" || activeTab === "permissions" || activeTab === "activity"
    ),
  });
  const activityQuery = useQuery({
    queryKey: queryKeys.tools.connectionActivity(connectionId),
    queryFn: () => toolsApi.listConnectionActivity(connectionId, 20),
    enabled: !!connectionId && activeTab === "activity",
  });
  // Resolve who ran Test-tab calls ("<User> tested as <Agent>") in the Activity feed (PAP-11415).
  const userDirectoryQuery = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId ?? "__none__"),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: activeTab === "activity",
  });
  // Identity grants drive reconnect authorization on every tab as well as the
  // Setup identities and Permissions controls. A personal reconnect belongs to
  // one fixed user, so the banner must not offer that action to anyone else.
  const grantsQuery = useQuery({
    queryKey: queryKeys.tools.connectionGrants(connectionId),
    queryFn: () => toolsApi.listConnectionGrants(connectionId),
    enabled: !!connectionId && !!activeTab,
  });

  const connection = connectionQuery.data;
  const application = connection
    ? (applicationsQuery.data?.applications ?? []).find((candidate) => candidate.id === connection.applicationId)
    : undefined;
  const grantRows = grantsQuery.data?.grants ?? [];
  const retainedPersonalGrant = connection?.credentialPolicy === "per_user"
    ? grantRows.find((grant) => (
      grant.kind === "user" && grant.subjectUserId === connection.createdByUserId
    ))
      ?? grantRows.find((grant) => grant.kind === "user" && grant.status === "active")
      ?? grantRows.find((grant) => grant.kind === "user")
      ?? null
    : null;
  const currentUserPersonalGrant = grantRows.find((grant) => (
    grant.kind === "user" && grant.subjectUserId === grantsQuery.data?.currentUserId
  )) ?? null;
  const retainedOrganizationGrant = grantRows.find((grant) => (
    grant.kind === "organization" && grant.isDefault
  )) ?? grantRows.find((grant) => grant.kind === "organization") ?? null;
  const managedIdentityGrant = connection?.credentialPolicy === "per_user"
    ? retainedPersonalGrant
    : connection?.credentialPolicy === "per_user_with_fallback"
      ? currentUserPersonalGrant ?? retainedOrganizationGrant
      : retainedOrganizationGrant;
  const managedPersonalUserId = managedIdentityGrant?.kind === "user"
    ? managedIdentityGrant.subjectUserId ?? connection?.createdByUserId ?? null
    : null;
  const canReconnect = managedIdentityGrant?.kind === "user"
    ? Boolean(
      managedPersonalUserId
      && managedPersonalUserId === grantsQuery.data?.currentUserId
      && grantsQuery.data?.capabilities.canConnectAsCurrentUser,
    )
    : grantsQuery.data?.capabilities.canConfigure === true;
  const reconnectUnavailableMessage = grantsQuery.isLoading
    ? t("checking_who_can_reconnect_this_identity")
    : grantsQuery.isError
      ? t("we_couldnt_verify_who_can_reconnect_this_identit")
      : managedIdentityGrant?.kind === "user"
        && managedPersonalUserId !== grantsQuery.data?.currentUserId
        ? t("the_person_this_connection_belongs_to_must_recon")
        : t("you_dont_have_permission_to_reconnect_this_ident");
  const composioChildConnectionCount = (connectionsQuery.data?.connections ?? []).filter(
    (candidate) => candidate.status !== "archived"
      && candidate.config?.provider === "composio"
      && candidate.config?.parentConnectionId === connectionId,
  ).length;
  const logoEntry = useMemo(
    () => galleryEntryFor((galleryQuery.data?.apps ?? []) as AppGalleryDisplayEntry[], connection, application),
    [galleryQuery.data, connection, application],
  );
  const brandKey = appApplicationSourceSlug(application)
    ?? appConnectionSourceSlug(connection)
    ?? (logoEntry ? appDefinitionSlug(logoEntry) : null);
  const userProfileById = useMemo(
    () => buildCompanyUserProfileMap(userDirectoryQuery.data?.users),
    [userDirectoryQuery.data],
  );
  const owner = connection ? connectionOwnerProfile(connection, userProfileById) : null;
  const baseAppName = connection
    ? logoEntry ? appDefinitionName(logoEntry) : humanizeConnectionDisplayName(connection)
    : t("app_");
  const appName = connection
    ? connectionDisplayNameForOwner(connection, baseAppName, owner)
    : t("app_");
  const successNoticeShownFor = useRef<string | null>(null);

  useEffect(() => {
    if (activeTab !== "setup" || searchParams.get("oauth") !== "choose-access") return;
    // Older OAuth states may still return to the retired post-authorization
    // identity screen. Identity is now selected before consent, so normalize
    // the stale URL without asking a contradictory second question.
    navigate(appTabHref(connectionId, "setup"), { replace: true });
  }, [activeTab, connectionId, navigate, searchParams]);

  useEffect(() => {
    if (
      activeTab !== "test"
      || searchParams.get("success") !== "1"
      || !connection
      || successNoticeShownFor.current === connection.id
    ) return;
    successNoticeShownFor.current = connection.id;
    pushToast({
      title: t("zhPages.e257e27d3e9b", { appName: appName }),
      body: t("the_connection_is_ready_you_can_test_an_action_b"),
      tone: "success",
    });
    navigate(appTabHref(connection.id, "test"), { replace: true });
  }, [activeTab, appName, connection, navigate, pushToast, searchParams]);

  useEffect(() => {
    if (!activeTab) return;
    setBreadcrumbs([
      { label: t("connectors"), href: "/apps" },
      { label: appName, href: appTabHref(connectionId, "setup") },
      { label: appTabLabel(activeTab) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, appName, connectionId, activeTab]);

  const catalog = catalogQuery.data?.catalog ?? [];
  const profile = useMemo(
    () => (profilesQuery.data?.profiles ?? []).find((p) => p.profileKey === `app:${connectionId}`),
    [profilesQuery.data, connectionId],
  );
  const enabledIds = useMemo(() => enabledCatalogIds(profile), [profile]);
  const askFirstIds = useMemo(
    () => askFirstCatalogIds(policiesQuery.data?.policies ?? [], connectionId),
    [policiesQuery.data, connectionId],
  );
  const install = useMemo(
    () => installStateFrom(installsQuery.data?.installs ?? connection?.installs),
    [connection?.installs, installsQuery.data?.installs],
  );
  const access = useMemo(() => accessFrom(profile, install), [profile, install]);
  const agents = agentsQuery.data ?? [];
  const userLabelById = useMemo(() => {
    const labels = buildCompanyUserLabelMap(userDirectoryQuery.data?.users);
    const session = sessionQuery.data;
    // Prefer the viewer's own profile name for their own test runs ("Dotta", not a fallback).
    if (session?.user?.id && session.user.name?.trim()) {
      labels.set(session.user.id, session.user.name.trim());
    }
    return labels;
  }, [userDirectoryQuery.data, sessionQuery.data]);
  const [pending, setPending] = useState(false);
  const persist = useMutation({
    mutationFn: (next: {
      enabled: Set<string>;
      askFirst: Set<string>;
      access: AccessDraft;
      reviewed?: Set<string>;
    }) =>
      toolsApi.finishApp(selectedCompanyId!, connectionId, {
        enabledCatalogEntryIds: [...next.enabled],
        askFirstCatalogEntryIds: [...next.askFirst].filter((id) => next.enabled.has(id)),
        ...(next.reviewed ? { reviewedCatalogEntryIds: [...next.reviewed] } : {}),
        access: next.access.mode === "all" ? "all_agents" : { agentIds: [...next.access.agentIds] },
      }),
    onMutate: () => setPending(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.testAgentAccessesForConnection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.catalog(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.profiles(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.policies(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_save_that"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
    onSettled: () => setPending(false),
  });

  const persistInstall = useMutation({
    mutationFn: (next: InstallState) =>
      toolsApi.putConnectionInstalls(connectionId, installPayload(selectedCompanyId!, next)),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKeys.tools.connectionInstalls(connectionId), snapshot);
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.testAgentAccessesForConnection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.profiles(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_save_installs"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const rename = useMutation({
    mutationFn: (name: string) => toolsApi.updateConnection(connectionId, { name }),
    onSuccess: () => {
      setRenaming(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_rename_the_app"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const updateConfig = useMutation({
    mutationFn: (config: Record<string, unknown>) => toolsApi.updateConnection(connectionId, {
      config,
      transportConfig: connection?.transportConfig ?? {},
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_save_that"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const startOAuth = useMutation({
    mutationFn: () => toolsApi.startOAuth(connectionId),
    onSuccess: ({ authorizationUrl }) => {
      // Checked again at the navigation boundary (PAP-17099): the address came
      // from the remote server, and this is where an unsafe scheme would run.
      const target = resolveAuthorizationTarget(authorizationUrl);
      if (!target.ok) {
        pushToast({ title: t("couldnt_start_sign_in"), body: target.message, tone: "error" });
        return;
      }
      navigateTopLevel(target.url);
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_start_sign_in"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const invalidateGrants = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tools.connectionGrants(connectionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
  };

  /**
   * "Connect as me" and "Reconnect" for the signed-in user's own identity. The
   * subject is always the caller — the server refuses any other subject — so
   * there is no path here to start consent on a coworker's behalf.
   */
  const startPersonalAuth = useMutation({
    mutationFn: () => {
      const subjectUserId = grantsQuery.data?.currentUserId;
      if (!subjectUserId) throw new Error(t("sign_in_again_to_connect_your_own_account"));
      return toolsApi.startPersonalAuthorization(selectedCompanyId!, connectionId, {
        subjectUserId,
        returnTo: appTabHref(connectionId, "setup"),
      });
    },
    onSuccess: ({ url }) => {
      const target = resolveAuthorizationTarget(url);
      if (!target.ok) {
        pushToast({ title: t("couldnt_start_sign_in"), body: target.message, tone: "error" });
        return;
      }
      navigateTopLevel(target.url);
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_start_sign_in"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const revokeGrant = useMutation({
    mutationFn: (grantId: string) => toolsApi.revokeConnectionGrant(connectionId, grantId),
    onSuccess: (grant) => {
      invalidateGrants();
      pushToast({
        title: grant.kind === "user" ? t("identity_revoked") : t("organization_identity_revoked"),
        body: grant.kind === "user"
          ? t("agents_will_stop_acting_as_this_person")
          : t("installed_agents_no_longer_have_the_shared_ident"),
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_revoke_that_identity"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  // A denied or conflicting audience save keeps the dialog open with the
  // selection intact, so the error is surfaced inline rather than as a toast.
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [audienceOpenGrantId, setAudienceOpenGrantId] = useState<string | null>(null);
  const replaceAudience = useMutation({
    mutationFn: ({ grantId, memberUserIds }: { grantId: string; memberUserIds: string[] }) =>
      toolsApi.replaceConnectionGrantMembers(connectionId, grantId, memberUserIds),
    onMutate: () => setAudienceError(null),
    onSuccess: (grant) => {
      invalidateGrants();
      setAudienceOpenGrantId(null);
      pushToast({
        title: t("audience_saved"),
        body: (grant.members?.length ?? 0) === 0
          ? t("every_organization_member_can_use_this_identity")
          : t("zhPages.3d0827d3389b", { length: grant.members?.length , count: grant.members?.length }),
        tone: "success",
      });
    },
    onError: (error) =>
      setAudienceError(error instanceof Error ? error.message : t("we_couldnt_save_that_audience")),
  });

  const removeApp = useMutation({
    mutationFn: () => toolsApi.archiveConnection(connectionId, {
      confirmComposioChildren: composioChildConnectionCount > 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.applications(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
      pushToast({
        title: t("app_removed"),
        body: t("zhPages.519077eae251", { appName: appName }),
        tone: "success",
      });
      navigate("/apps");
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_remove_the_app"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const toggleEnabled = useMutation({
    mutationFn: () => toolsApi.updateConnection(connectionId, { enabled: !connection?.enabled }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.applications(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
      pushToast({
        title: updated.enabled ? t("app_resumed") : t("app_paused"),
        body: updated.enabled
          ? t("zhPages.c97b39658033", { updated: humanizeConnectionDisplayName(updated) })
          : t("zhPages.981925995197", { updated: humanizeConnectionDisplayName(updated) }),
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_update_the_app"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const refreshTools = useMutation({
    mutationFn: () => toolsApi.refreshCatalog(connectionId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.testAgentAccessesForConnection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.catalog(connectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
      pushToast({
        title: t("zhPages.a2069d236abb", { discoveredCount: result.discoveredCount , count: result.discoveredCount }),
        body: result.quarantinedCount > 0
          ? t("zhPages.ad86a9a201da", { quarantinedCount: result.quarantinedCount , count: result.quarantinedCount })
          : undefined,
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_refresh_actions"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const apply = (mutate: {
    enabled?: Set<string>;
    askFirst?: Set<string>;
    access?: AccessDraft;
    reviewed?: Set<string>;
  }) =>
    persist.mutate({
      enabled: mutate.enabled ?? new Set(enabledIds),
      askFirst: mutate.askFirst ?? new Set(askFirstIds),
      access: mutate.access ?? access,
      reviewed: mutate.reviewed,
    });

  const reviewQuarantined = (allowedIds: string[]) => {
    const quarantinedIds = new Set(quarantined.map((entry) => entry.id));
    const nextEnabled = new Set([...enabledIds].filter((id) => !quarantinedIds.has(id)));
    for (const id of allowedIds) nextEnabled.add(id);
    apply({ enabled: nextEnabled, reviewed: quarantinedIds });
  };

  if (!connectionId || !activeTab) {
    return <Navigate replace to={connectionId ? appTabHref(connectionId, "setup") : "/apps"} />;
  }

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("select_an_organization_to_manage_apps")}</div>;
  }
  if (connectionQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!connection) {
    return (
      <div className="max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">{t("we_couldnt_find_that_app")}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/apps")}>
          {t("back_to_connectors")}
        </Button>
      </div>
    );
  }

  const status = statusFor(connection);
  const needsReconnect = status.tone === "attention" && connection.healthStatus !== "unknown";
  const quarantined = catalog.filter((e) => e.status === "quarantined");
  const active = catalog.filter((e) => e.status === "active");
  const readOnly = active.filter((e) => e.isReadOnly);
  const canChange = active.filter((e) => !e.isReadOnly);
  const actionCount = catalogQuery.data ? active.length : null;
  const setupPermissionsLoading = catalogQuery.isLoading || profilesQuery.isLoading || policiesQuery.isLoading;
  const setupPermissionsSummary = setupPermissionsLoading || catalogQuery.isError
    || profilesQuery.isError || policiesQuery.isError
    ? null
    : formatActionPermissionSummary(summarizeActionPermissions(active, enabledIds, askFirstIds));
  // Setup summarizes app access, not personal-identity delegations. Identity
  // delegation answers who an agent may act as; the profile binding below is
  // the source of truth for which agents may use the connection at all.
  const setupAgentsSummary = access.mode === "all"
    ? t("every_agent")
    : access.agentIds.size === 0
      ? t("no_agents_56b58f")
      : t("zhSupport.appsFinal.agentCount", { count: access.agentIds.size });
  const reviewLoading = catalogQuery.isLoading || profilesQuery.isLoading || policiesQuery.isLoading;
  const permissionsLoading = reviewLoading || installsQuery.isLoading || agentsQuery.isLoading;
  const reviewFailed = catalogQuery.isError || profilesQuery.isError || policiesQuery.isError;
  const permissionsFailed = reviewFailed || installsQuery.isError || agentsQuery.isError;

  return (
    <div className="max-w-4xl space-y-10 pb-12">
      <AppDetailHeader
        appName={appName}
        connection={connection}
        logoEntry={logoEntry}
        brandKey={brandKey}
        allowRemoteLogo={!applicationsQuery.isPending}
        status={status}
        actionCount={activeTab === "setup" ? null : actionCount}
        renaming={renaming}
        nameDraft={nameDraft}
        renamePending={rename.isPending}
        onNameDraftChange={setNameDraft}
        onRenameStart={() => {
          setNameDraft(appName);
          setRenaming(true);
        }}
        onRenameCancel={() => setRenaming(false)}
        onRenameSubmit={(next) => {
          if (next && next !== appName) rename.mutate(next);
          else setRenaming(false);
        }}
      />

      {needsReconnect && (
        <ReconnectCard
          connection={connection}
          galleryEntry={logoEntry}
          canReconnect={canReconnect}
          reconnectUnavailableMessage={reconnectUnavailableMessage}
          onReconnected={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId) });
          }}
        />
      )}

      {activeTab === "setup" && (
          <div className="space-y-12">
            <SetupPanel
              connection={connection}
              galleryEntry={logoEntry}
              configUpdateDisabled={updateConfig.isPending}
              onUpdateConfig={(config) => updateConfig.mutate(config)}
              agentsSummary={setupAgentsSummary}
              permissionsSummary={setupPermissionsSummary}
              permissionsLoading={setupPermissionsLoading}
              onOpenPermissions={() => navigate(appTabHref(connectionId, "permissions"))}
              identities={
                <IdentitiesSection
                  appName={appName}
                  credentialPolicy={connection.credentialPolicy}
                  ownerUserId={connection.createdByUserId}
                  connectedUser={owner}
                  grantsQuery={grantsQuery.data}
                  loading={grantsQuery.isLoading}
                  error={grantsQuery.isError}
                  connectPending={startPersonalAuth.isPending || startOAuth.isPending}
                  audiencePending={replaceAudience.isPending}
                  audienceError={audienceError}
                  audienceGrantId={audienceOpenGrantId}
                  onOpenAudience={(grantId) => {
                    setAudienceError(null);
                    setAudienceOpenGrantId(grantId);
                  }}
                  onCloseAudience={() => {
                    setAudienceOpenGrantId(null);
                    setAudienceError(null);
                  }}
                  onConnectAsMe={() => startPersonalAuth.mutate()}
                  // The organization identity is a shared credential, so it goes
                  // through the connection-level OAuth start, not a personal one.
                  onConnectOrganization={() => startOAuth.mutate()}
                  onReplaceAudience={(grant, memberUserIds) =>
                    replaceAudience.mutate({ grantId: grant.id, memberUserIds })}
                />
              }
            />
            <AdvancedPanel
              connection={connection}
              appName={appName}
              galleryEntry={logoEntry}
              childConnectionCount={composioChildConnectionCount}
              removing={removeApp.isPending}
              onRemove={() => removeApp.mutate()}
              canReplaceCredential={canReconnect}
              credentialUnavailableMessage={reconnectUnavailableMessage}
              appToggleDisabled={toggleEnabled.isPending || removeApp.isPending}
              onToggleApp={() => toggleEnabled.mutate()}
              identityGrant={managedIdentityGrant}
              identityCurrentUserId={grantsQuery.data?.currentUserId ?? null}
              identityProviderName={baseAppName}
              credentialPolicy={connection.credentialPolicy}
              identityActionPending={
                startPersonalAuth.isPending || startOAuth.isPending || revokeGrant.isPending
              }
              onReconnectIdentity={managedIdentityGrant ? () => {
                if (managedIdentityGrant.kind === "user") startPersonalAuth.mutate();
                else startOAuth.mutate();
              } : undefined}
              onRevokeIdentity={(grant) => revokeGrant.mutate(grant.id)}
              onReplaced={() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connectionId) });
                queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId) });
                queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId) });
              }}
            />
          </div>
      )}
      {activeTab === "services" && (
        <ServicesPanel connectionId={connectionId} appName={appName} />
      )}
      {activeTab === "review" && (
        reviewFailed
          ? <ToolsLoadError onRetry={() => {
              void catalogQuery.refetch();
              void profilesQuery.refetch();
              void policiesQuery.refetch();
            }} />
          : reviewLoading
          ? <ToolsLoading />
          : <ReviewPanel
              connectionId={connectionId}
              quarantined={quarantined}
              pending={pending}
              onReviewQuarantined={reviewQuarantined}
            />
      )}
      {activeTab === "permissions" && (
        permissionsFailed
          ? <ToolsLoadError onRetry={() => {
              void catalogQuery.refetch();
              void profilesQuery.refetch();
              void policiesQuery.refetch();
              void installsQuery.refetch();
              void agentsQuery.refetch();
            }} />
          : permissionsLoading
          ? <ToolsLoading />
          : <PermissionsPanel
              capabilities={grantsQuery.data?.capabilities}
              appName={appName}
              agents={agents}
              access={access}
              install={install}
              readOnly={readOnly}
              canChange={canChange}
              quarantined={quarantined}
              enabledIds={enabledIds}
              askFirstIds={askFirstIds}
              pending={pending}
              installPending={persistInstall.isPending}
              refreshPending={refreshTools.isPending}
              onSaveAccess={(next) => apply({ access: accessIncludingInstalls(next, install) })}
              onSaveInstall={(next) => persistInstall.mutate(next)}
              onRefreshActions={() => refreshTools.mutate()}
              onSetActionPermission={(id, next) => apply(actionPermissionMutation(id, next, enabledIds, askFirstIds))}
              onReviewQuarantined={reviewQuarantined}
            />
      )}
      {activeTab === "test" && (
        catalogQuery.isError
          ? <ToolsLoadError onRetry={() => { void catalogQuery.refetch(); }} />
          : catalogQuery.isLoading
          ? <ToolsLoading mcpActions />
          : <TestPanel connectionId={connectionId} appName={appName} active={active} quarantined={quarantined} />
      )}
      {activeTab === "activity" && (
        <ActivityPanel
          events={activityQuery.data?.events ?? []}
          lifecycleEvents={activityQuery.data?.lifecycleEvents ?? []}
          issues={activityQuery.data?.issues ?? {}}
          actionRequests={activityQuery.data?.actionRequests ?? {}}
          loading={activityQuery.isLoading}
          agents={agents}
          connectionId={connectionId}
          appName={appName}
          userLabelById={userLabelById}
        />
      )}
    </div>
  );
}

function AppDetailHeader({
  appName,
  connection,
  logoEntry,
  brandKey,
  allowRemoteLogo,
  status,
  actionCount,
  renaming,
  nameDraft,
  renamePending,
  onNameDraftChange,
  onRenameStart,
  onRenameCancel,
  onRenameSubmit,
}: {
  appName: string;
  connection: ToolConnection;
  logoEntry: AppGalleryDisplayEntry | null;
  brandKey: string | null;
  allowRemoteLogo: boolean;
  status: StatusInfo;
  actionCount: number | null;
  renaming: boolean;
  nameDraft: string;
  renamePending: boolean;
  onNameDraftChange: (value: string) => void;
  onRenameStart: () => void;
  onRenameCancel: () => void;
  onRenameSubmit: (value: string) => void;
}) {
  const { t } = useTranslation();
  const unverifiedHost = unverifiedRemoteHost(connection);
  return (
    <header>
      <div className="flex items-center gap-3">
        <AppLogo
          name={appName}
          brandKey={brandKey}
          logoUrl={appDefinitionLogoUrl(logoEntry)}
          darkLogoUrl={appDefinitionDarkLogoUrl(logoEntry)}
          allowRemoteFallback={allowRemoteLogo}
          size={44}
        />
        <div className="min-w-0">
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onRenameSubmit(nameDraft.trim());
              }}
            >
              <Input
                aria-label={t("app_name")}
                value={nameDraft}
                onChange={(event) => onNameDraftChange(event.target.value)}
                className="h-9 w-64 text-lg font-bold"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={renamePending || !nameDraft.trim()}>
                {renamePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("save")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onRenameCancel} disabled={renamePending}>
                {t("cancel")}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-xl font-bold">{appName}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-label={t("rename_app")}
                onClick={onRenameStart}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {actionCount !== null && (
              <span className="text-xs text-muted-foreground">
                {t("zhSupport.appsFinal.actionsAvailable", { count: actionCount })}</span>
            )}
            {connectionDisplaySecondaryHint(connection) ? (
              <span className="text-xs text-muted-foreground">
                {connectionDisplaySecondaryHint(connection)}
              </span>
            ) : null}
            {unverifiedHost ? <UnverifiedServerBadge host={unverifiedHost} /> : null}
            <ConnectionProvenanceChip connection={connection} />
          </div>
        </div>
      </div>
    </header>
  );
}

function ToolsLoading({ mcpActions = false }: { mcpActions?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {mcpActions ? t("loading_mcp_actions_this_may_take_a_minute") : t("loading_tools")}
    </div>
  );
}

function ToolsLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 py-8">
      <p className="text-sm text-destructive">{t("couldn_t_load_tools_for_this_app")}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>{t("try_again")}</Button>
    </div>
  );
}

function unverifiedRemoteHost(connection: ToolConnection): string | null {
  const sourceTemplateKey = connection.config?.sourceTemplateKey ?? connection.transportConfig.sourceTemplateKey;
  if (
    connection.transport !== "mcp_remote"
    || (typeof sourceTemplateKey === "string" && sourceTemplateKey.trim())
  ) return null;

  const value = connection.config?.url
    ?? connection.config?.endpoint
    ?? connection.config?.remoteUrl
    ?? connection.transportConfig.url
    ?? connection.transportConfig.endpoint
    ?? connection.transportConfig.remoteUrl;
  if (typeof value !== "string") return null;

  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

type StatusInfo = { label: string; tone: "connected" | "attention" | "paused" };

function statusFor(connection: ToolConnection): StatusInfo {
  if (connection.enabled === false || connection.status === "disabled") {
    return { label: t("paused"), tone: "paused" };
  }
  if (isAttentionHealthStatus(connection.healthStatus)) {
    return { label: t("needs_attention"), tone: "attention" };
  }
  return { label: t("connected"), tone: "connected" };
}

function StatusBadge({ status }: { status: StatusInfo }) {
  const klass: Record<StatusInfo["tone"], string> = {
    connected: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    attention: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    paused: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        klass[status.tone],
      )}
    >
      {status.tone === "connected" && <Check className="h-3 w-3" />}
      {status.label}
    </span>
  );
}

function enabledCatalogIds(profile: ToolProfileWithDetails | undefined): Set<string> {
  const ids = new Set<string>();
  for (const entry of profile?.entries ?? []) {
    if (entry.effect === "include" && entry.catalogEntryId) ids.add(entry.catalogEntryId);
  }
  return ids;
}

function askFirstCatalogIds(policies: ToolPolicy[], connectionId: string): Set<string> {
  const ids = new Set<string>();
  for (const policy of policies) {
    if (policy.policyType !== "require_approval" || policy.enabled === false) continue;
    const config = (policy.config ?? {}) as { source?: unknown; connectionId?: unknown; catalogEntryId?: unknown };
    if (config.source === "app_gallery_finish" && config.connectionId === connectionId && typeof config.catalogEntryId === "string") {
      ids.add(config.catalogEntryId);
    }
  }
  return ids;
}

/**
 * Who may use this connection, read back from the app profile's bindings.
 *
 * `finishApp` replaces a profile's whole binding set, so every save from this
 * page — including an action-permission toggle — has to restate this. The
 * Permissions tab exposes the bindings as Agent access, while installs remain
 * a separate "always loaded" choice. If the profile has no bindings yet, the
 * install state remains the safest legacy fallback.
 *
 * That fallback is the important part. It used to return "all agents" for an
 * unbound profile, which turned any unrelated save into a silent company-wide
 * grant from a control the reader could not see. Installs authorize their
 * targets, so mirroring the install state is both the truthful reading and the
 * one that agrees with what the tab displays.
 */
function accessFrom(
  profile: ToolProfileWithDetails | undefined,
  install: InstallState,
): AccessDraft {
  const bindings = profile?.bindings ?? [];
  if (bindings.some((b) => b.targetType === "company")) {
    return { mode: "all", agentIds: new Set() };
  }
  const agentIds = new Set(bindings.filter((b) => b.targetType === "agent").map((b) => b.targetId));
  if (agentIds.size > 0) return { mode: "specific", agentIds };
  return install.onAll
    ? { mode: "all", agentIds: new Set() }
    : { mode: "specific", agentIds: new Set(install.agentIds) };
}

function accessIncludingInstalls(next: AccessDraft, install: InstallState): AccessDraft {
  if (install.onAll || next.mode === "all") {
    return { mode: "all", agentIds: new Set() };
  }
  return {
    mode: "specific",
    agentIds: new Set([...next.agentIds, ...install.agentIds]),
  };
}

function galleryEntryFor(
  apps: AppGalleryDisplayEntry[],
  connection: ToolConnection | undefined,
  application: ToolApplication | undefined,
): AppGalleryDisplayEntry | null {
  if (!connection) return null;
  const sourceSlug = appApplicationSourceSlug(application) ?? appConnectionSourceSlug(connection);
  if (sourceSlug) {
    const keyed = apps.find((app) => appDefinitionSlug(app) === sourceSlug);
    if (keyed) return keyed;
  }
  const name = connection.name.toLowerCase();
  return apps.find((app) => appDefinitionName(app).toLowerCase() === name) ??
    apps.find((app) => appDefinitionSlug(app) === name) ??
    null;
}

function actionPermissionMutation(
  id: string,
  next: "off" | "allowed" | "ask",
  enabledIds: Set<string>,
  askFirstIds: Set<string>,
) {
  const enabled = new Set(enabledIds);
  const askFirst = new Set(askFirstIds);
  if (next === "off") {
    enabled.delete(id);
    askFirst.delete(id);
  } else {
    enabled.add(id);
    if (next === "ask") askFirst.add(id);
    else askFirst.delete(id);
  }
  return { enabled, askFirst };
}
