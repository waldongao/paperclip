import { i18n } from "@/i18n";
import { getDisplayLabel } from "@/lib/display-labels";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Card } from "@/components/ui/card";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { useTranslation } from "@/i18n";

export function InstanceAccess() {
  const { t } = useTranslation();
  const { companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([
      { label: t("settings_"), href: "/company/settings" },
      { label: t("instance_settings"), href: "/company/settings/instance/general" },
      { label: t("access") },
    ]);
  }, [setBreadcrumbs]);

  const usersQuery = useQuery({
    queryKey: queryKeys.access.adminUsers(search),
    queryFn: () => accessApi.searchAdminUsers(search),
  });

  const selectedUser = useMemo(
    () => usersQuery.data?.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, usersQuery.data],
  );

  const userAccessQuery = useQuery({
    queryKey: queryKeys.access.userCompanyAccess(selectedUserId ?? ""),
    queryFn: () => accessApi.getUserCompanyAccess(selectedUserId!),
    enabled: !!selectedUserId,
  });

  useEffect(() => {
    if (!selectedUserId && usersQuery.data?.[0]) {
      setSelectedUserId(usersQuery.data[0].id);
    }
  }, [selectedUserId, usersQuery.data]);

  useEffect(() => {
    if (!userAccessQuery.data) return;
    setSelectedCompanyIds(
      new Set(
        userAccessQuery.data.companyAccess
          .filter((membership) => membership.status === "active")
          .map((membership) => membership.companyId),
      ),
    );
  }, [userAccessQuery.data]);

  const updateCompanyAccessMutation = useMutation({
    mutationFn: () => accessApi.setUserCompanyAccess(selectedUserId!, [...selectedCompanyIds]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      pushToast({ title: t("organization_access_updated"), tone: "success" });
    },
  });

  const setAdminMutation = useMutation({
    mutationFn: async (makeAdmin: boolean) => {
      if (!selectedUserId) throw new Error(t("no_user_selected"));
      if (makeAdmin) return accessApi.promoteInstanceAdmin(selectedUserId);
      return accessApi.demoteInstanceAdmin(selectedUserId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      if (selectedUserId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId) });
      }
      pushToast({ title: t("instance_role_updated"), tone: "success" });
    },
  });

  if (usersQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loading_instance_users")}</div>;
  }

  if (usersQuery.error) {
    const message =
      usersQuery.error instanceof ApiError && usersQuery.error.status === 403
        ? t("instance_admin_access_is_required_to_manage_user")
        : usersQuery.error instanceof Error
          ? usersQuery.error.message
          : t("failed_to_load_users");
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("instance_access")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("search_users_manage_instance_admin_status_and_co")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-(--gtc-34)">
        <Card className="block space-y-4 p-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("search_users")}</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search_by_name_or_email")}
            />
          </label>
          <div className="space-y-2">
            {(usersQuery.data ?? []).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  user.id === selectedUserId
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.name || user.email || user.id}</div>
                    <div className="truncate text-sm text-muted-foreground">{user.email || user.id}</div>
                  </div>
                  {user.isInstanceAdmin ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {user.activeCompanyMembershipCount} {t("active_organization_memberships")}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="block space-y-4 p-5">
          {!selectedUserId ? (
            <div className="text-sm text-muted-foreground">{t("select_a_user_to_inspect_instance_access")}</div>
          ) : userAccessQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">{t("loading_user_access")}</div>
          ) : userAccessQuery.error ? (
            <div className="text-sm text-destructive">
              {userAccessQuery.error instanceof Error ? userAccessQuery.error.message : t("failed_to_load_user_access")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    {selectedUser?.name || selectedUser?.email || selectedUserId}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedUser?.email || selectedUserId}
                  </div>
                </div>
                <Button
                  variant={selectedUser?.isInstanceAdmin ? "outline" : "default"}
                  onClick={() => setAdminMutation.mutate(!(selectedUser?.isInstanceAdmin ?? false))}
                  disabled={setAdminMutation.isPending}
                >
                  {selectedUser?.isInstanceAdmin ? t("remove_instance_admin") : t("promote_to_instance_admin")}
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">{t("organization_access")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("toggle_organization_membership_for_this_user_new")}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-start gap-3 rounded-lg border border-border px-3 py-3"
                    >
                      <Checkbox
                        checked={selectedCompanyIds.has(company.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCompanyIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(company.id);
                            else next.delete(company.id);
                            return next;
                          });
                        }}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">{company.name}</span>
                        <span className="block text-xs text-muted-foreground">{company.issuePrefix}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => updateCompanyAccessMutation.mutate()}
                    disabled={updateCompanyAccessMutation.isPending}
                  >
                    {updateCompanyAccessMutation.isPending ? t("saving_56a228") : t("save_organization_access")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold">{t("current_memberships")}</h2>
                <div className="space-y-2">
                  {(userAccessQuery.data?.companyAccess ?? []).map((membership) => (
                    <div
                      key={membership.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{membership.companyName || membership.companyId}</div>
                        <div className="text-muted-foreground">
                          {membership.membershipRole ? getDisplayLabel(membership.membershipRole) : t("not_set")} • {getDisplayLabel(membership.status)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(membership.updatedAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
