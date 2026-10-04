import { t } from "@/i18n";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ToolConnection } from "@paperclipai/shared";
import {
  connectionDisplaySecondaryHint,
  isConnectableAppSlug,
  isToolConnectionAttentionHealth,
} from "@paperclipai/shared";
import { Navigate, useNavigate, useParams } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { timeAgo } from "@/lib/timeAgo";
import { toolsApi } from "@/api/tools";
import { agentsApi } from "@/api/agents";
import { accessApi } from "@/api/access";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCompanyUserProfileMap, type CompanyUserProfile } from "@/lib/company-members";
import { AppLogo } from "./AppLogo";
import {
  appApplicationSourceSlug,
  appDefinitionDarkLogoUrl,
  appDefinitionLogoUrl,
  appDefinitionName,
  appDefinitionSlug,
  type AppGalleryDisplayEntry,
} from "./app-definition-display";
import { connectionAddress, connectionTransportLabel, DangerZone } from "./AppDetail";
import { ActivityPanel } from "./app-detail/ActivityPanel";
import { ReviewPanel } from "./app-detail/ReviewPanel";
import { appApplicationTabHref, appTabHref, appTabLabel, isAppTabKey, type AppTabKey } from "./app-tabs";
import {
  ConnectionOwnerIdentity,
  connectionDisplayNameForOwner,
  connectionOwnerProfile,
} from "./connection-owner";
import { useTranslation } from "@/i18n";

export function AppNotConnected() {
  const { t } = useTranslation();
  const { applicationId = "", tab } = useParams<{ applicationId: string; tab?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const activeTab: AppTabKey | null = isAppTabKey(tab) ? tab : null;

  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const galleryQuery = useQuery({
    queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGallery(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const userDirectoryQuery = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId ?? "__none__"),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });

  const application = useMemo(
    () => (applicationsQuery.data?.applications ?? []).find((app) => app.id === applicationId),
    [applicationsQuery.data, applicationId],
  );
  const appSourceSlug = appApplicationSourceSlug(application);
  const relatedApplicationIds = useMemo(() => {
    if (!application) return new Set<string>();
    if (!appSourceSlug) return new Set([application.id]);
    return new Set(
      (applicationsQuery.data?.applications ?? [])
        .filter((candidate) => appApplicationSourceSlug(candidate) === appSourceSlug)
        .map((candidate) => candidate.id),
    );
  }, [application, applicationsQuery.data, appSourceSlug]);
  const appConnections = useMemo(
    () => (connectionsQuery.data?.connections ?? []).filter((c) => relatedApplicationIds.has(c.applicationId)),
    [connectionsQuery.data, relatedApplicationIds],
  );
  const activeConnections = useMemo(
    () => appConnections.filter((c) => c.status !== "archived" && c.status !== "draft"),
    [appConnections],
  );
  const activeConnection = activeConnections[0] ?? null;
  const previousConnection = useMemo(() => latestArchivedConnection(appConnections), [appConnections]);
  const userProfileById = useMemo(
    () => buildCompanyUserProfileMap(userDirectoryQuery.data?.users),
    [userDirectoryQuery.data],
  );
  const activityQuery = useQuery({
    queryKey: queryKeys.tools.connectionActivity(previousConnection?.id ?? "__none__"),
    queryFn: () => toolsApi.listConnectionActivity(previousConnection!.id, 20),
    enabled: !!previousConnection && activeTab === "activity",
  });
  const grantsQuery = useQuery({
    queryKey: queryKeys.tools.connectionGrants(previousConnection?.id ?? "__none__"),
    queryFn: () => toolsApi.listConnectionGrants(previousConnection!.id),
    enabled: !!previousConnection && activeTab === "setup",
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && activeTab === "activity",
  });

  const appName = application?.name ?? t("app_");
  useEffect(() => {
    if (!activeTab) return;
    setBreadcrumbs([
      { label: t("connectors"), href: "/apps" },
      { label: appName, href: appApplicationTabHref(applicationId, "setup") },
      { label: appTabLabel(activeTab) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, appName, applicationId, activeTab]);

  const remove = useMutation({
    mutationFn: () => toolsApi.updateApplication(applicationId, { status: "archived" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__") });
      pushToast({
        title: t("app_removed"),
        body: t("zhPages.7b5d54ed1ce0", { appName: appName }),
        tone: "success",
      });
      navigate("/apps");
    },
    onError: (error) => {
      pushToast({
        title: t("couldn_t_remove_the_app"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("select_an_organization_to_manage_apps")}</div>;
  }
  if (!applicationId || !activeTab) {
    return <Navigate to={applicationId ? appApplicationTabHref(applicationId, "setup") : "/apps"} replace />;
  }
  if (applicationsQuery.isLoading || connectionsQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!application) {
    return (
      <div className="max-w-3xl space-y-3 p-6 text-sm text-muted-foreground">
        <p>{t("this_app_doesn_t_exist_anymore")}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/apps")}>{t("back_to_connectors")}</Button>
      </div>
    );
  }
  if (activeConnection && activeTab !== "setup") {
    return <Navigate to={appTabHref(activeConnection.id, activeTab)} replace />;
  }

  const gallery = (galleryQuery.data?.apps ?? []) as AppGalleryDisplayEntry[];
  const logoEntry = (appSourceSlug
    ? gallery.find((entry) => appDefinitionSlug(entry) === appSourceSlug)
    : undefined) ?? gallery.find(
      (entry) => appDefinitionName(entry).toLowerCase() === application.name.toLowerCase(),
    );
  const logoUrl = appDefinitionLogoUrl(logoEntry);
  const darkLogoUrl = appDefinitionDarkLogoUrl(logoEntry);

  const previousAddress = previousConnection ? connectionAddress(previousConnection) : null;
  const retainedPersonalGrant = previousConnection?.credentialPolicy === "per_user"
    ? grantsQuery.data?.grants.find((grant) => (
      grant.kind === "user" && grant.subjectUserId === previousConnection.createdByUserId
    ))
      ?? grantsQuery.data?.grants.find((grant) => grant.kind === "user" && grant.status === "active")
      ?? grantsQuery.data?.grants.find((grant) => grant.kind === "user")
      ?? null
    : null;
  const retainedPersonalUserId = previousConnection?.credentialPolicy === "per_user"
    ? previousConnection.createdByUserId ?? retainedPersonalGrant?.subjectUserId ?? null
    : null;
  const canReconnect = !previousConnection
    || (previousConnection.credentialPolicy === "per_user"
      ? Boolean(
        retainedPersonalUserId
        && retainedPersonalUserId === grantsQuery.data?.currentUserId
        && grantsQuery.data?.capabilities.canConnectAsCurrentUser,
      )
      : grantsQuery.data?.capabilities.canConfigure === true);
  const reconnectUnavailableMessage = grantsQuery.isLoading
    ? t("checking_who_can_reconnect_this_identity")
    : grantsQuery.isError
      ? t("we_couldnt_verify_who_can_reconnect_this_identit")
      : previousConnection?.credentialPolicy === "per_user"
        && retainedPersonalUserId !== grantsQuery.data?.currentUserId
        ? t("the_person_this_connection_belongs_to_must_recon")
        : t("you_dont_have_permission_to_reconnect_this_ident");
  const connectHref = newConnectionHref({
    applicationId,
    appName: application.name,
    previousAddress,
    previousConnection,
    sourceSlug: isConnectableAppSlug(appSourceSlug) ? appSourceSlug : null,
  });

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <ApplicationHeader
        applicationName={application.name}
        description={application.description}
        logoUrl={logoUrl}
        darkLogoUrl={darkLogoUrl}
        connectedCount={activeConnections.length}
      />

      {activeTab === "setup" && (
        <div className="space-y-8">
          <SetupTab
            applicationName={application.name}
            activeConnections={activeConnections}
            previousConnection={previousConnection}
            previousAddress={previousAddress}
            userProfileById={userProfileById}
            canReconnect={canReconnect}
            reconnectUnavailableMessage={reconnectUnavailableMessage}
            onConnect={() => navigate(connectHref)}
            onEdit={(connectionId) => navigate(appTabHref(connectionId, "setup"))}
          />
          <DangerZone
            appName={application.name}
            removing={remove.isPending}
            onRemove={() => remove.mutate()}
          />
        </div>
      )}
      {activeTab === "review" && (
        previousConnection ? (
          <ReviewPanel connectionId={previousConnection.id} />
        ) : (
          <EmptyTab
            title={t("nothing_is_waiting_for_your_ok_right_now")}
            body={t("review_requests_will_appear_here_after_this_app")}
          />
        )
      )}
      {activeTab === "permissions" && (
        <PermissionsTab previousConnection={previousConnection} />
      )}
      {activeTab === "test" && (
        <EmptyTab
          title={t("reconnect_to_test_this_app")}
          body={t("testing_becomes_available_after_this_app_is_conn")}
        />
      )}
      {activeTab === "activity" && (
        previousConnection ? (
          <ActivityPanel
            events={activityQuery.data?.events ?? []}
            lifecycleEvents={activityQuery.data?.lifecycleEvents ?? []}
            issues={activityQuery.data?.issues ?? {}}
            actionRequests={activityQuery.data?.actionRequests ?? {}}
            loading={activityQuery.isLoading}
            agents={agentsQuery.data ?? []}
            connectionId={previousConnection.id}
            appName={appName}
          />
        ) : (
          <ActivityPanel
            events={[]}
            lifecycleEvents={[]}
            issues={{}}
            actionRequests={{}}
            loading={false}
            agents={[]}
            connectionId=""
            appName={appName}
          />
        )
      )}
    </div>
  );
}

function ApplicationHeader({
  applicationName,
  description,
  logoUrl,
  darkLogoUrl,
  connectedCount,
}: {
  applicationName: string;
  description: string | null;
  logoUrl: string | undefined;
  darkLogoUrl: string | undefined;
  connectedCount: number;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-wrap items-center gap-4">
      <AppLogo name={applicationName} logoUrl={logoUrl} darkLogoUrl={darkLogoUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight">{applicationName}</h1>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {connectedCount > 0 ? t("zhPages.89bdeb50836f", { connectedCount: connectedCount }) : t("not_connected")}
          </span>
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </header>
  );
}

function SetupTab({
  applicationName,
  activeConnections,
  previousConnection,
  previousAddress,
  userProfileById,
  canReconnect,
  reconnectUnavailableMessage,
  onConnect,
  onEdit,
}: {
  applicationName: string;
  activeConnections: ToolConnection[];
  previousConnection: ToolConnection | null;
  previousAddress: string | null;
  userProfileById: ReadonlyMap<string, CompanyUserProfile>;
  canReconnect: boolean;
  reconnectUnavailableMessage: string;
  onConnect: () => void;
  onEdit: (connectionId: string) => void;
}) {
  const { t } = useTranslation();
  if (activeConnections.length > 0) {
    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">{t("already_connected_to")} {applicationName}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("edit_an_existing_connection_or_deliberately_add")}
            </p>
          </div>
          <div className="divide-y divide-border">
            {activeConnections.map((connection) => {
              const owner = connectionOwnerProfile(connection, userProfileById);
              const secondary = connectionDisplaySecondaryHint(connection) ??
                (connection.lastUsedAt ? t("zhPages.d1caf454f147", { value: timeAgo(connection.lastUsedAt) }) : t("not_used_yet"));
              const status = connection.enabled === false || connection.status === "disabled"
                ? t("paused")
                : isToolConnectionAttentionHealth(connection.healthStatus)
                  ? t("needs_attention")
                  : t("connected");
              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => onEdit(connection.id)}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {connectionDisplayNameForOwner(connection, applicationName, owner)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{secondary}</div>
                  </div>
                  <ConnectionOwnerIdentity owner={owner} />
                  <span className="text-xs text-muted-foreground">{status}</span>
                  <span className="text-xs font-semibold text-primary">{t("edit_aed999")}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">{t("connect_another")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("add_another")} {applicationName} {t("account_without_changing_the_connections_above")}
              </p>
            </div>
            <Button onClick={onConnect}>{t("connect_another")}</Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {previousConnection ? t("reconnect_this_app") : t("connect_this_app")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {previousConnection
                ? previousConnection.authKind === "oauth"
                  ? t("we_kept_the_previous_setup_sign_in_again_to_brin")
                  : t("we_kept_the_previous_setup_add_a_working_key_to")
                : t("agents_cant_use_it_until_its_connected")}
            </p>
            {previousConnection && !canReconnect ? (
              <p className="mt-1 text-sm text-muted-foreground">{reconnectUnavailableMessage}</p>
            ) : null}
          </div>
          {!previousConnection || canReconnect ? (
            <Button onClick={onConnect}>
              {previousConnection ? t("reconnect") : t("connect")}
            </Button>
          ) : null}
        </div>
      </section>

      {previousConnection && (
        <PreviousSetup
          connection={previousConnection}
          previousAddress={previousAddress}
          owner={connectionOwnerProfile(previousConnection, userProfileById)}
        />
      )}
    </div>
  );
}

function PreviousSetup({
  connection,
  previousAddress,
  owner,
}: {
  connection: ToolConnection;
  previousAddress: string | null;
  owner: CompanyUserProfile | null;
}) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="text-sm font-bold text-foreground">{t("previous_setup")}</h2>
      {owner && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("connected_by")}</span>
          <ConnectionOwnerIdentity owner={owner} />
        </div>
      )}
      {connection.healthMessage && (
        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("last_error_867b92")} {connection.healthMessage}
        </p>
      )}
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-(--gtc-59)">
        <dt className="text-muted-foreground">{t("address")}</dt>
        <dd className="break-all font-mono text-foreground">{previousAddress}</dd>
        <dt className="text-muted-foreground">{t("connection_type")}</dt>
        <dd className="text-foreground">{connectionTransportLabel(connection.transport)}</dd>
        <dt className="text-muted-foreground">{t("last_used")}</dt>
        <dd className="text-foreground">
          {connection.lastUsedAt ? timeAgo(connection.lastUsedAt) : t("never")}
        </dd>
      </dl>
    </section>
  );
}

function PermissionsTab({ previousConnection }: { previousConnection: ToolConnection | null }) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="text-sm font-bold text-foreground">{t("permissions_paused")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("reconnect_this_app_to_edit_who_can_use_it_and_wh")}
      </p>
      {previousConnection && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("previous_setup_is_retained_for_reconnect_but_acc")}
        </p>
      )}
    </section>
  );
}

function EmptyTab({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </section>
  );
}

function latestArchivedConnection(connections: ToolConnection[]): ToolConnection | null {
  const archived = connections.filter((c) => c.status === "archived");
  if (archived.length === 0) return null;
  return archived.reduce((latest, connection) => {
    const latestTime = new Date(latest.updatedAt ?? latest.createdAt ?? 0).getTime();
    const connectionTime = new Date(connection.updatedAt ?? connection.createdAt ?? 0).getTime();
    return connectionTime > latestTime ? connection : latest;
  });
}

function newConnectionHref({
  applicationId,
  appName,
  previousAddress,
  previousConnection,
  sourceSlug,
}: {
  applicationId: string;
  appName: string;
  previousAddress: string | null;
  previousConnection: ToolConnection | null;
  sourceSlug: string | null;
}): string {
  const params = new URLSearchParams({ applicationId, name: appName, new: "1" });
  if (previousConnection) {
    params.set("reconnect", previousConnection.id);
    params.set("identity", previousConnection.credentialPolicy === "per_user" ? "user" : "organization");
  }
  if (sourceSlug) params.set("source", sourceSlug);
  else params.set("byo", "1");
  const storedLink = [
    previousConnection?.config?.url,
    previousConnection?.config?.endpoint,
    previousConnection?.config?.remoteUrl,
    previousConnection?.transportConfig.url,
    previousConnection?.transportConfig.endpoint,
    previousConnection?.transportConfig.remoteUrl,
    previousAddress,
  ].find((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));
  if (storedLink) params.set("link", storedLink);
  const path = previousConnection?.credentialSource === "vercel_connect"
    ? "/apps/vercel-connect"
    : "/apps/connect";
  return `${path}?${params.toString()}`;
}
