import { t } from "@/i18n";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Loader2, UserRound } from "lucide-react";
import type {
  ConnectionAudienceMember,
  ConnectionGrant,
  ConnectionGrantsResponse,
  ToolConnectionCredentialPolicy,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Identity } from "@/components/Identity";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineBanner } from "@/components/InlineBanner";
import { MemberMultiSelect } from "@/components/MemberMultiSelect";
import { RadioCardGroup } from "@/components/ui/radio-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { brandChipBadge } from "@/lib/status-colors";
import {
  audienceUserIds,
  grantAccountLabel,
  grantStatusLabel,
  grantStatusTone,
  memberLabel,
  organizationGrant,
  personalGrantFor,
  type GrantStatusTone,
} from "../connection-identity";
import { useTranslation } from "@/i18n";

const STATUS_CHIP: Record<GrantStatusTone, string> = {
  connected: brandChipBadge.green,
  attention: brandChipBadge.amber,
  inactive: brandChipBadge.gray,
  missing: brandChipBadge.gray,
};

function StatusText({ status }: { status: ConnectionGrant["status"] | null }) {
  const tone = grantStatusTone(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_CHIP[tone],
      )}
    >
      {grantStatusLabel(status)}
    </span>
  );
}

/**
 * Fixed identity for the connection Setup tab.
 *
 * The chosen personal/organization type comes from the connection policy and
 * the alternative is not rendered after setup. Every action is rendered from
 * a server capability — a policy-forbidden action is absent rather than
 * disabled, so a viewer sees the same legible state with no controls at all.
 */
export function IdentitiesSection({
  appName,
  credentialPolicy,
  ownerUserId,
  connectedUser,
  grantsQuery,
  loading,
  error,
  onConnectAsMe,
  onConnectOrganization,
  onReplaceAudience,
  connectPending,
  audiencePending,
  audienceError,
  audienceGrantId,
  onOpenAudience,
  onCloseAudience,
}: {
  appName: string;
  credentialPolicy: ToolConnectionCredentialPolicy;
  ownerUserId: string | null;
  connectedUser: { label: string; image: string | null } | null;
  grantsQuery: ConnectionGrantsResponse | undefined;
  loading: boolean;
  error: boolean;
  onConnectAsMe: () => void;
  onConnectOrganization: () => void;
  onReplaceAudience: (grant: ConnectionGrant, memberUserIds: string[]) => void;
  connectPending: boolean;
  audiencePending: boolean;
  audienceError: string | null;
  /**
   * The audience dialog is controlled by the page, not this section: a save that
   * the server rejects has to keep the dialog open with the selection intact,
   * which only the mutation's outcome knows.
   */
  audienceGrantId: string | null;
  onOpenAudience: (grantId: string) => void;
  onCloseAudience: () => void;
}) {
  const { t } = useTranslation();
  const grants = grantsQuery?.grants ?? [];
  const capabilities = grantsQuery?.capabilities;
  const currentUserId = grantsQuery?.currentUserId ?? null;
  const members = grantsQuery?.members ?? [];
  const orgGrant = useMemo(() => organizationGrant(grants), [grants]);
  const myGrant = useMemo(() => personalGrantFor(grants, currentUserId), [grants, currentUserId]);
  const personalGrant = useMemo(() => {
    const personalGrants = grants.filter((grant) => grant.kind === "user");
    return personalGrants.find((grant) => grant.subjectUserId === ownerUserId)
      ?? myGrant
      ?? personalGrants.find((grant) => grant.status === "active")
      ?? personalGrants[0]
      ?? null;
  }, [grants, myGrant, ownerUserId]);
  const personalSubjectLabel = memberLabel(
    members,
    personalGrant?.subjectUserId ?? ownerUserId ?? currentUserId,
  );
  const usesPersonalIdentity = credentialPolicy === "per_user"
    || (credentialPolicy === "per_user_with_fallback" && Boolean(myGrant));
  const audienceGrant = audienceGrantId
    ? grants.find((grant) => grant.id === audienceGrantId) ?? null
    : null;

  if (loading) {
    return (
      <section className="space-y-5" aria-busy="true">
        <IdentitiesHeading />
        <Skeleton className="h-14 w-full" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-5">
        <IdentitiesHeading />
        <InlineBanner tone="warning" compact>
          {t("we_couldnt_load_who_this_connection_acts_as_relo")}
        </InlineBanner>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <IdentitiesHeading />

      <ConnectionAudienceCallout
        personal={usesPersonalIdentity}
        connectedName={usesPersonalIdentity ? personalSubjectLabel ?? connectedUser?.label ?? null : null}
        connectedImage={usesPersonalIdentity ? connectedUser?.image ?? null : null}
        status={(usesPersonalIdentity ? personalGrant : orgGrant)?.status ?? null}
      />

      <div>
        {usesPersonalIdentity ? (
          personalGrant ? null : (
            <IdentityRow
              id="personal-identity"
              title={t("personal_account")}
              status={null}
              detail={t("personal_identity")}
              actions={capabilities?.canConnectAsCurrentUser ? (
                  <Button size="sm" disabled={connectPending} onClick={onConnectAsMe}>
                    {connectPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {t("connect_as_me")}
                  </Button>
                ) : null}
            />
          )
        ) : (
          orgGrant ? (
            orgGrant.capabilities?.canEditAudience ? (
              <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => onOpenAudience(orgGrant.id)}>
                    {t("manage_access")}
                  </Button>
              </div>
            ) : null
          ) : (
            <IdentityRow
              title={t("organization_account")}
              status={null}
              detail={t("organization_identity")}
              actions={capabilities?.canCreateOrganizationGrant ? (
                  <Button size="sm" disabled={connectPending} onClick={onConnectOrganization}>
                    {t("connect_organization_identity")}
                  </Button>
                ) : null}
            />
          )
        )}
      </div>

      {audienceGrant ? (
        <AudienceDialog
          appName={appName}
          grant={audienceGrant}
          members={members}
          pending={audiencePending}
          error={audienceError}
          onCancel={onCloseAudience}
          onSave={(memberUserIds) => onReplaceAudience(audienceGrant, memberUserIds)}
        />
      ) : null}

    </section>
  );
}

function IdentitiesHeading() {
  const { t } = useTranslation();
  return <h2 className="text-sm font-semibold text-foreground">{t("account_")}</h2>;
}

function ConnectionAudienceCallout({
  personal,
  connectedName,
  connectedImage,
  status,
}: {
  personal: boolean;
  connectedName: string | null;
  connectedImage: string | null;
  status: ConnectionGrant["status"] | null;
}) {
  const { t } = useTranslation();
  const Icon = personal ? UserRound : Building2;
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 space-y-3">
        <p className="text-lg font-semibold text-foreground">
          {personal
            ? t("only_you_can_use_this_connection")
            : t("anyone_in_your_company_can_use_this_connection")}
        </p>
        {connectedName && status !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <Identity name={connectedName} avatarUrl={connectedImage} />
            {status === "active" ? null : <StatusText status={status} />}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IdentityRow({
  id,
  title,
  status,
  detail,
  actions,
}: {
  id?: string;
  title: string;
  status: ConnectionGrant["status"] | null;
  detail: string | null;
  actions: ReactNode;
}) {
  return (
    <div id={id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {status === "active" ? null : <StatusText status={status} />}
        </div>
        {detail ? <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

/**
 * "Who can use this identity" (PAP-17835 Surface C). Scope is a two-option
 * radio: all organization members, persisted as no audience members, or a
 * selected set. The dialog stays open on a denial so the selection survives.
 */
export function AudienceDialog({
  appName,
  grant,
  members,
  pending,
  error,
  onCancel,
  onSave,
}: {
  appName: string;
  grant: ConnectionGrant;
  members: ConnectionAudienceMember[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (memberUserIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const initialSelection = useMemo(() => audienceUserIds(grant), [grant]);
  const [scope, setScope] = useState<"all" | "selected">(initialSelection.size === 0 ? "all" : "selected");
  const [selected, setSelected] = useState<Set<string>>(initialSelection);

  useEffect(() => {
    setSelected(initialSelection);
    setScope(initialSelection.size === 0 ? "all" : "selected");
  }, [initialSelection]);

  const canSave = scope === "all" || selected.size > 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("who_can_use_this_identity")}</DialogTitle>
          <DialogDescription>
            {grantAccountLabel(grant)} · {appName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <RadioCardGroup
            ariaLabel={t("who_can_use_this_identity")}
            value={scope}
            onValueChange={(next) => setScope(next as "all" | "selected")}
            options={[
              {
                value: "all",
                title: t("all_organization_members"),
                description: t("anyone_in_this_organization_can_have_work_use_th"),
              },
              {
                value: "selected",
                title: t("selected_members"),
                description: t("only_the_people_you_choose"),
              },
            ]}
          />

          {scope === "selected" ? (
            <MemberMultiSelect
              members={members.map((member) => ({
                userId: member.userId,
                name: member.name,
                email: member.email,
              }))}
              selectedUserIds={selected}
              onChange={setSelected}
              triggerLabel={selected.size === 0
                ? t("choose_people")
                : t("zhPages.ea6f7a5726e7", { size: selected.size , count: selected.size })}
            />
          ) : null}

          <p className="text-xs text-muted-foreground">
            {t("this_controls_whose_work_can_use_the_identity_it")}
          </p>

          {error ? (
            <InlineBanner tone="warning" compact>
              {error}
            </InlineBanner>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || !canSave}
            onClick={() => onSave(scope === "all" ? [] : [...selected])}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("save_audience")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Revoke confirmation (PAP-17835 Surface D). Revoke breaks active and future
 * runs, so it is an `AlertDialog` and the destructive action is not the initial
 * focus. The row survives afterwards showing Revoked, which keeps the context
 * and the reconnect path.
 */
export function RevokeGrantDialog({
  grant,
  providerName,
  pending,
  isOwnIdentity,
  credentialPolicy,
  onCancel,
  onConfirm,
}: {
  grant: ConnectionGrant;
  providerName: string;
  pending: boolean;
  isOwnIdentity: boolean;
  credentialPolicy: ToolConnectionCredentialPolicy;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const personal = grant.kind === "user";
  const title = personal
    ? isOwnIdentity
      ? t("zhPages.fd79f0f20ca3", { providerName: providerName })
      : t("zhPages.8b9f687273d0", { providerName: providerName })
    : t("revoke_the_organization_identity");
  const body = personal
    ? isOwnIdentity
      ? t("agents_will_stop_acting_as_you_work_that_needs_t")
      : t("agents_will_stop_acting_as_this_person_they_can")
    : credentialPolicy === "per_user"
      ? t("installed_agents_lose_this_shared_identity_immed")
      : t("eligible_members_and_installed_agents_will_lose");

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} autoFocus>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {t("revoke_identity")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
