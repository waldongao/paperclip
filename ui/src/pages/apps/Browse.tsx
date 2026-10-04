import { translateDisplayMessage } from "@/i18n/display-message";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardPaste,
  Clock3,
  Link2,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  Search,
  ServerCog,
  Trash2,
} from "lucide-react";
import type { ToolApplication, ToolConnection } from "@paperclipai/shared";
import {
  appSupportsCatalogSetup,
  getAppDefinitionForUrl,
  getAppStoreDefinition,
  isToolConnectionAttentionHealth,
} from "@paperclipai/shared";
import { useNavigate } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { toolsApi } from "@/api/tools";
import { accessApi } from "@/api/access";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCompanyUserProfileMap } from "@/lib/company-members";
import { AppLogo } from "./AppLogo";
import {
  appApplicationSourceSlug,
  appDefinitionDarkLogoUrl,
  appDefinitionDescription,
  appDefinitionLogoUrl,
  appDefinitionName,
  appDefinitionSlug,
  type AppGalleryDisplayEntry,
} from "./app-definition-display";
import { appSourceConnectHref, appSourceResumeHref } from "./app-connect-policy";
import { composioChildParentConnectionId } from "./composio-services";
import {
  ConnectionOwnerIdentity,
  connectionDisplayNameForOwner,
  connectionOwnerProfile,
  type ConnectionOwnerProfile,
} from "./connection-owner";
import { t, useTranslation } from "@/i18n";

type ConnectorRowModel = {
  key: string;
  slug: string;
  name: string;
  description: string;
  brandKey: string;
  logoUrl?: string | null;
  darkLogoUrl?: string | null;
  entry: AppGalleryDisplayEntry | null;
  applications: ToolApplication[];
  connections: ToolConnection[];
};

type ConnectionState = {
  kind: "connected" | "attention" | "paused" | "draft";
  label: string;
  message: string | null;
};

type ConnectionRemovalTarget = {
  id: string;
  accountName: string;
  providerName: string;
  remainingConnectionCount: number;
  childConnectionCount: number;
};

function connectHrefFor(entry: AppGalleryDisplayEntry): string | null {
  const slug = appDefinitionSlug(entry);
  const definition = getAppStoreDefinition(slug);
  return appSupportsCatalogSetup(definition) ? appSourceConnectHref(slug) : null;
}

function additionalConnectionHref(
  entry: AppGalleryDisplayEntry,
  applicationId: string,
): string | null {
  const baseHref = connectHrefFor(entry);
  if (!baseHref) return null;
  const [path, rawQuery = ""] = baseHref.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("applicationId", applicationId);
  params.set("name", appDefinitionName(entry));
  params.set("new", "1");
  return `${path}?${params.toString()}`;
}

function connectionState(connection: ToolConnection): ConnectionState {
  if (connection.status === "draft") {
    return {
      kind: "draft",
      label: t("setup_incomplete"),
      message: t("finish_setup_before_agents_can_use_this_account"),
    };
  }
  if (connection.enabled === false || connection.status === "disabled") {
    return {
      kind: "paused",
      label: t("paused"),
      message: t("agents_can_t_use_this_account_right_now"),
    };
  }
  if (isToolConnectionAttentionHealth(connection.healthStatus)) {
    return {
      kind: "attention",
      label: t("needs_attention"),
      message:
        connection.healthMessage ??
        connection.lastError ??
        (connection.authKind === "oauth"
          ? t("sign_in_again_to_restore_access")
          : t("replace_the_credential_to_restore_access")),
    };
  }
  return { kind: "connected", label: t("connected"), message: null };
}

function connectionRank(connection: ToolConnection): number {
  return connection.status === "draft" ? 0 : 1;
}

function rowRank(row: ConnectorRowModel): number {
  if (row.connections.some((connection) => connectionRank(connection) === 1)) return 2;
  return row.connections.length > 0 ? 1 : 0;
}

function connectorAction(row: ConnectorRowModel): {
  label: string;
  href: string | null;
  title?: string;
} {
  const applicationId = row.applications[0]?.id ?? null;
  if (row.connections.length > 0) {
    if (row.entry && applicationId) {
      return {
        label: t("add_account"),
        href: additionalConnectionHref(row.entry, applicationId),
      };
    }
    return {
      label: t("add_account"),
      href: applicationId ? `/apps/app/${applicationId}/setup` : null,
    };
  }

  if (row.entry?.availability?.available === false) {
    return {
      label: t("unavailable"),
      href: null,
      title: row.entry.availability.reason ?? t("this_connector_is_unavailable_on_this_instance"),
    };
  }
  if (row.entry) return { label: t("connect"), href: connectHrefFor(row.entry) };
  return {
    label: t("connect"),
    href: applicationId ? `/apps/app/${applicationId}/setup` : null,
  };
}

function accountActionHref(row: ConnectorRowModel, connection: ToolConnection): string {
  if (connection.status === "draft" && row.entry) {
    return appSourceResumeHref(row.slug, connection.id);
  }
  return `/apps/${connection.id}/setup`;
}

/**
 * The Apps landing page is the single connector catalog and account-management
 * surface. Connected providers sort first and expand in place to show every
 * account; unconnected providers retain the same catalog setup flows.
 */
export function Browse() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [query, setQuery] = useState("");
  const [connectionToRemove, setConnectionToRemove] = useState<ConnectionRemovalTarget | null>(null);

  useEffect(() => {
    // Apps is already its own navigation root and the page has its own title.
    // Leave the global bar empty instead of duplicating "Connectors" or
    // offering a path back out of Apps.
    setBreadcrumbs([]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const galleryQuery = useQuery({
    queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGallery(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const userDirectoryQuery = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId ?? "__none__"),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const removeConnection = useMutation({
    mutationFn: (target: ConnectionRemovalTarget) =>
      toolsApi.archiveConnection(target.id, {
        confirmComposioChildren: target.childConnectionCount > 0,
      }),
    onSuccess: (_connection, target) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.applications(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId!) });
      pushToast({
        title: t("connection_removed"),
        body: target.remainingConnectionCount > 0
          ? t("zhPages.cb410e463810", { providerName: target.providerName, remainingConnectionCount: target.remainingConnectionCount , count: target.remainingConnectionCount })
          : t("zhPages.fe929b2744fd", { providerName: target.providerName }),
        tone: "success",
      });
      setConnectionToRemove(null);
    },
    onError: (error) =>
      pushToast({
        title: t("couldnt_remove_the_connection"),
        body: error instanceof Error ? error.message : t("please_try_again"),
        tone: "error",
      }),
  });

  const gallery = (galleryQuery.data?.apps ?? []) as AppGalleryDisplayEntry[];
  const userProfileById = useMemo(
    () => buildCompanyUserProfileMap(userDirectoryQuery.data?.users),
    [userDirectoryQuery.data],
  );

  const rows = useMemo<ConnectorRowModel[]>(() => {
    const activeConnections = (connectionsQuery.data?.connections ?? []).filter(
      (connection) => connection.status !== "archived",
    );
    const activeApplications = (applicationsQuery.data?.applications ?? []).filter(
      (application) => application.status !== "archived",
    );
    const connectionsByApplicationId = new Map<string, ToolConnection[]>();
    for (const connection of activeConnections) {
      connectionsByApplicationId.set(connection.applicationId, [
        ...(connectionsByApplicationId.get(connection.applicationId) ?? []),
        connection,
      ]);
    }

    const gallerySlugs = new Set(gallery.map((entry) => appDefinitionSlug(entry)));
    const gallerySlugByName = new Map(
      gallery.map((entry) => [
        appDefinitionName(entry).trim().toLocaleLowerCase(),
        appDefinitionSlug(entry),
      ]),
    );
    const rowsBySlug = new Map<string, ConnectorRowModel>();
    for (const entry of gallery) {
      const slug = appDefinitionSlug(entry);
      rowsBySlug.set(slug, {
        key: `gallery:${slug}`,
        slug,
        name: appDefinitionName(entry),
        description: translateDisplayMessage(appDefinitionDescription(entry)),
        brandKey: slug,
        logoUrl: appDefinitionLogoUrl(entry),
        darkLogoUrl: appDefinitionDarkLogoUrl(entry),
        entry,
        applications: [],
        connections: [],
      });
    }

    const customRows: ConnectorRowModel[] = [];
    for (const application of activeApplications) {
      const appConnections = connectionsByApplicationId.get(application.id) ?? [];
      const configuredConnectionSlug = appConnections
        .map(
          (connection) =>
            connection.config?.sourceTemplateKey ??
            connection.transportConfig?.sourceTemplateKey,
        )
        .find(
          (value): value is string =>
            typeof value === "string" && gallerySlugs.has(value),
        );
      const endpointMatchedSlug = appConnections
        .flatMap((connection) => [connection.config?.url, connection.transportConfig?.url])
        .map((value) =>
          typeof value === "string"
            ? appDefinitionSlug(getAppDefinitionForUrl(value, gallery)) || null
            : null,
        )
        .find((value): value is string => Boolean(value));
      const applicationSlug = appApplicationSourceSlug(application);
      const resolvedSlug =
        applicationSlug && applicationSlug !== "link" && gallerySlugs.has(applicationSlug)
          ? applicationSlug
          : (configuredConnectionSlug ??
            endpointMatchedSlug ??
            gallerySlugByName.get(application.name.trim().toLocaleLowerCase()) ??
            null);
      const galleryRow = resolvedSlug ? rowsBySlug.get(resolvedSlug) : null;
      if (galleryRow) {
        galleryRow.applications.push(application);
        galleryRow.connections.push(...appConnections);
        continue;
      }

      customRows.push({
        key: `application:${application.id}`,
        slug: applicationSlug ?? application.id,
        name: application.name,
        description: application.description ?? t("a_custom_connector_configured_for_this_organizat"),
        brandKey: applicationSlug ?? application.name,
        entry: null,
        applications: [application],
        connections: appConnections,
      });
    }

    return [...rowsBySlug.values(), ...customRows]
      .map((row) => ({
        ...row,
        connections: [...row.connections].sort(
          (left, right) =>
            connectionRank(right) - connectionRank(left) ||
            left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
        ),
      }))
      .sort(
        (left, right) =>
          rowRank(right) - rowRank(left) ||
          left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
          left.key.localeCompare(right.key),
      );
  }, [applicationsQuery.data, connectionsQuery.data, gallery]);

  const trimmed = query.trim().toLocaleLowerCase();
  const visibleRows = useMemo(() => {
    if (!trimmed) return rows;
    return rows.filter(
      (row) =>
        row.name.toLocaleLowerCase().includes(trimmed) ||
        row.description.toLocaleLowerCase().includes(trimmed) ||
        row.connections.some((connection) =>
          connection.name.toLocaleLowerCase().includes(trimmed),
        ),
    );
  }, [rows, trimmed]);
  const showCustomConnector =
    !trimmed || t("connect_your_own_tool_custom_mcp_server").includes(trimmed);

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("select_an_organization_to_manage_connectors")}
      </div>
    );
  }

  const loading =
    galleryQuery.isLoading || applicationsQuery.isLoading || connectionsQuery.isLoading;
  const loadFailed =
    galleryQuery.isError || applicationsQuery.isError || connectionsQuery.isError;
  const nothingMatches = visibleRows.length === 0 && !showCustomConnector;

  return (
    <div className="max-w-5xl space-y-5 pb-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="shrink-0 text-xl font-bold text-foreground">{t("connectors")}</h1>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search_connectors")}
            aria-label={t("search_connectors_9ffb52")}
            className="pl-9"
          />
        </div>
      </header>

      {loadFailed ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            {t("couldn_t_load_every_connector_existing_accounts")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void galleryQuery.refetch();
              void applicationsQuery.refetch();
              void connectionsQuery.refetch();
            }}
          >
            {t("try_again")}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-label={t("loading_connectors")}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : nothingMatches ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <Link2 className="h-4 w-4" />
          {t("no_connectors_match")}{query.trim()}”.
        </p>
      ) : (
        <div className="space-y-3" role="list" aria-label={t("connector_list")}>
          {visibleRows.map((row) => (
            <ConnectorCard
              key={row.key}
              row={row}
              allConnections={connectionsQuery.data?.connections ?? []}
              userProfileById={userProfileById}
              onNavigate={navigate}
              onRequestRemove={setConnectionToRemove}
            />
          ))}
          {showCustomConnector ? (
            <CustomConnectorCard onNavigate={navigate} />
          ) : null}
        </div>
      )}

      <AlertDialog
        open={connectionToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removeConnection.isPending) setConnectionToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {connectionToRemove?.accountName != null
                ? t("zhSupport.appsFinal.removeNamedConnection", { name: connectionToRemove.accountName })
                : t("zhSupport.appsFinal.removeThisConnection")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {connectionToRemove && connectionToRemove.childConnectionCount > 0
                ? t("zhPages.1f96e5074e94", { childConnectionCount: connectionToRemove.childConnectionCount , count: connectionToRemove.childConnectionCount })
                : connectionToRemove && connectionToRemove.remainingConnectionCount > 0
                ? t("zhPages.678c406798dd", { providerName: connectionToRemove.providerName, remainingConnectionCount: connectionToRemove.remainingConnectionCount , count: connectionToRemove.remainingConnectionCount })
                : t("the_saved_credentials_are_deleted_and_agents_los")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeConnection.isPending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!connectionToRemove || removeConnection.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (connectionToRemove) removeConnection.mutate(connectionToRemove);
              }}
            >
              {removeConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 />}
              {removeConnection.isPending ? t("removing") : t("remove_connection")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConnectorCard({
  row,
  allConnections,
  userProfileById,
  onNavigate,
  onRequestRemove,
}: {
  row: ConnectorRowModel;
  allConnections: ToolConnection[];
  userProfileById: ReadonlyMap<string, ConnectionOwnerProfile>;
  onNavigate: (href: string) => void;
  onRequestRemove: (target: ConnectionRemovalTarget) => void;
}) {
  const action = connectorAction(row);
  return (
    <div
      role="listitem"
      data-app-slug={row.slug}
      data-connected={row.connections.length > 0 ? "true" : "false"}
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <AppLogo
          name={row.name}
          brandKey={row.brandKey}
          logoUrl={row.logoUrl}
          darkLogoUrl={row.darkLogoUrl}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{row.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!action.href}
          title={action.title}
          onClick={() => {
            if (action.href) onNavigate(action.href);
          }}
          aria-label={`${action.label} ${row.name}`}
        >
          {action.label}
        </Button>
      </div>

      {row.connections.length > 0 ? (
        <div className="divide-y divide-border border-t border-border">
          {row.connections.map((connection) => (
            <ConnectionAccountRow
              key={connection.id}
              row={row}
              connection={connection}
              owner={connectionOwnerProfile(connection, userProfileById)}
              onNavigate={onNavigate}
              onRemove={() => {
                const accountName = connectionDisplayNameForOwner(
                  connection,
                  row.name,
                  connectionOwnerProfile(connection, userProfileById),
                );
                onRequestRemove({
                  id: connection.id,
                  accountName,
                  providerName: row.name,
                  remainingConnectionCount: row.connections.filter(
                    (candidate) =>
                      candidate.id !== connection.id &&
                      candidate.status === "active" &&
                      candidate.enabled,
                  ).length,
                  childConnectionCount: allConnections.filter(
                    (candidate) => composioChildParentConnectionId(candidate) === connection.id,
                  ).length,
                });
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConnectionAccountRow({
  row,
  connection,
  owner,
  onNavigate,
  onRemove,
}: {
  row: ConnectorRowModel;
  connection: ToolConnection;
  owner: ConnectionOwnerProfile | null;
  onNavigate: (href: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const state = connectionState(connection);
  const actionHref = accountActionHref(row, connection);
  const accountName = connectionDisplayNameForOwner(connection, row.name, owner);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <ConnectionStatusIcon state={state} />
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full cursor-pointer truncate text-left text-sm font-medium text-foreground hover:underline focus-visible:underline"
            aria-label={t("zhPages.6d3fe66fdb59", { accountName: accountName })}
            onClick={() => onNavigate(`/apps/${connection.id}/setup`)}
          >
            {accountName}
          </button>
          {state.message ? (
            <div
              className={
                state.kind === "attention"
                  ? "truncate text-xs text-destructive"
                  : "truncate text-xs text-muted-foreground"
              }
            >
              {translateDisplayMessage(state.message ?? "")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("connected_by")}</span>
          <ConnectionOwnerIdentity owner={owner} />
        </div>
        {state.kind === "attention" || state.kind === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onNavigate(actionHref)}
          >
            {state.kind === "attention" ? t("reconnect") : t("finish_setup")}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("zhPages.722b81f64188", { accountName: accountName })}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onNavigate(`/apps/${connection.id}/setup`)}>
              {t("edit_connection")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 />
              {t("remove_connection")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ConnectionStatusIcon({ state }: { state: ConnectionState }) {
  if (state.kind === "connected") {
    return (
      <span className="mt-0.5 text-emerald-600 dark:text-emerald-400" title={state.label}>
        <Check className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{state.label}</span>
      </span>
    );
  }
  if (state.kind === "attention") {
    return (
      <span className="mt-0.5 text-destructive" title={state.label}>
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{state.label}</span>
      </span>
    );
  }
  if (state.kind === "draft") {
    return (
      <span className="mt-0.5 text-amber-600 dark:text-amber-400" title={state.label}>
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{state.label}</span>
      </span>
    );
  }
  return (
    <span className="mt-0.5 text-muted-foreground" title={state.label}>
      <PauseCircle className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{state.label}</span>
    </span>
  );
}

function CustomConnectorCard({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="listitem"
      data-app-slug="custom-mcp"
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Link2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{t("connect_your_own_tool")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("add_a_custom_mcp_server_or_paste_an_existing_con")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          aria-controls="custom-connector-options"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t("close") : t("connect")}
        </Button>
      </div>

      {expanded ? (
        <div
          id="custom-connector-options"
          className="grid gap-2 border-t border-border px-4 py-3 sm:grid-cols-2"
        >
          <CustomConnectorOption
            icon={ServerCog}
            title={t("connect_your_own_mcp_server")}
            description={t("enter_the_url_for_a_custom_or_self_hosted_mcp_se")}
            onClick={() => onNavigate("/apps/byo")}
          />
          <CustomConnectorOption
            icon={ClipboardPaste}
            title={t("paste_a_config")}
            description={t("paste_an_existing_setup_snippet_and_connect_it")}
            onClick={() => onNavigate("/apps/advanced/paste-config")}
          />
        </div>
      ) : null}
    </div>
  );
}

function CustomConnectorOption({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof ServerCog;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40"
      onClick={onClick}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
