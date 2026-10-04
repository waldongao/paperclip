import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { useTranslation } from "@/i18n";

export function CliAuthPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const challengeId = (params.id ?? "").trim();
  const token = (searchParams.get("token") ?? "").trim();
  const currentPath = useMemo(
    () => `/cli-auth/${encodeURIComponent(challengeId)}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
    [challengeId, token],
  );

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const challengeQuery = useQuery({
    queryKey: ["cli-auth-challenge", challengeId, token],
    queryFn: () => accessApi.getCliAuthChallenge(challengeId, token),
    enabled: challengeId.length > 0 && token.length > 0,
    retry: false,
  });

  const approveMutation = useMutation({
    mutationFn: () => accessApi.approveCliAuthChallenge(challengeId, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await challengeQuery.refetch();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => accessApi.cancelCliAuthChallenge(challengeId, token),
    onSuccess: async () => {
      await challengeQuery.refetch();
    },
  });

  if (!challengeId || !token) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{t("invalid_cli_auth_url")}</div>;
  }

  if (sessionQuery.isLoading || challengeQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{t("loading_cli_auth_challenge")}</div>;
  }

  if (challengeQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{t("cli_auth_challenge_unavailable")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {challengeQuery.error instanceof Error ? challengeQuery.error.message : t("challenge_is_invalid_or_expired")}
          </p>
        </Card>
      </div>
    );
  }

  const challenge = challengeQuery.data;
  if (!challenge) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{t("cli_auth_challenge_unavailable_1cc5a5")}</div>;
  }

  if (challenge.status === "approved") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-xl font-semibold">{t("cli_access_approved")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("the_paperclip_cli_can_now_finish_authentication")}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("command_e7d3c5")} <span className="font-mono text-foreground">{challenge.command}</span>
          </p>
        </Card>
      </div>
    );
  }

  if (challenge.status === "cancelled" || challenge.status === "expired") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-xl font-semibold">
            {challenge.status === "expired" ? t("cli_auth_challenge_expired") : t("cli_auth_challenge_cancelled")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("start_the_cli_auth_flow_again_from_your_terminal")}
          </p>
        </Card>
      </div>
    );
  }

  if (challenge.requiresSignIn || !sessionQuery.data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-xl font-semibold">{t("sign_in_required")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("sign_in_or_create_an_account_then_return_to_this_0a1632")}
          </p>
          <Button asChild className="mt-4">
            <Link to={`/auth?next=${encodeURIComponent(currentPath)}`}>{t("sign_in_create_account")}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="block p-6">
        <h1 className="text-xl font-semibold">{t("approve_paperclip_cli_access")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("a_local_paperclip_cli_process_is_requesting_boar")}
        </p>

        <div className="mt-5 space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">{t("command")}</div>
            <div className="font-mono text-foreground">{challenge.command}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("client")}</div>
            <div className="text-foreground">{challenge.clientName ?? t("paperclipai_cli")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("requested_access")}</div>
            <div className="text-foreground">
              {challenge.requestedAccess === "instance_admin_required" ? t("instance_admin") : t("board")}
            </div>
          </div>
          {challenge.requestedCompanyName && (
            <div>
              <div className="text-muted-foreground">{t("requested_organization")}</div>
              <div className="text-foreground">{challenge.requestedCompanyName}</div>
            </div>
          )}
        </div>

        {(approveMutation.error || cancelMutation.error) && (
          <p className="mt-4 text-sm text-destructive">
            {(approveMutation.error ?? cancelMutation.error) instanceof Error
              ? ((approveMutation.error ?? cancelMutation.error) as Error).message
              : t("failed_to_update_cli_auth_challenge")}
          </p>
        )}

        {!challenge.canApprove && (
          <p className="mt-4 text-sm text-destructive">
            {t("this_challenge_requires_instance_admin_access_si")}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={!challenge.canApprove || approveMutation.isPending || cancelMutation.isPending}
          >
            {approveMutation.isPending ? t("approving") : t("approve_cli_access")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => cancelMutation.mutate()}
            disabled={approveMutation.isPending || cancelMutation.isPending}
          >
            {cancelMutation.isPending ? t("cancelling") : t("cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
