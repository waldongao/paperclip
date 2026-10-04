import { getDisplayLabel } from "@/lib/display-labels";
// token-extraction: allowlisted — intentional one-off decoration (DECISION-SHEET.md B1
// user ruling). The bg-[...gradient...] / shadow-[...] literals in this demo/UX-lab page
// are deliberate one-off decoration, reverted from --gradient-extract-*/--shadow-extract-*
// tokens; the file is on the check-token-gates allowlist in ui/src/index.css.
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Link2,
  Loader2,
  MailPlus,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { t, useTranslation } from "@/i18n";

const inviteRoleOptions = [
  {
    value: "viewer",
    label: t("viewer"),
    description: t("can_view_organization_work_and_follow_along"),
    gets: t("view_only_organization_membership"),
  },
  {
    value: "operator",
    label: t("operator"),
    description: t("recommended_for_people_who_need_to_help_run_work"),
    gets: t("can_assign_tasks_969179"),
  },
  {
    value: "admin",
    label: t("admin"),
    description: t("recommended_for_operators_who_need_to_invite_peo"),
    gets: t("can_create_agents_invite_users_assign_tasks_and"),
  },
  {
    value: "owner",
    label: t("owner"),
    description: t("full_organization_access_including_membership_ma"),
    gets: t("everything_in_admin_plus_managing_members"),
  },
] as const;

const inviteHistory = [
  {
    id: "invite-active",
    state: t("active"),
    humanRole: "operator",
    invitedBy: t("board_user_25"),
    email: t("board25_paperclip_local"),
    createdAt: t("apr_25_2026_9_00_am"),
    action: t("revoke"),
    relatedLabel: t("review_request"),
  },
  {
    id: "invite-accepted",
    state: t("accepted"),
    humanRole: "viewer",
    invitedBy: t("board_user_24"),
    email: t("board24_paperclip_local"),
    createdAt: t("apr_24_2026_8_15_am"),
    action: t("inactive"),
    relatedLabel: "—",
  },
  {
    id: "invite-revoked",
    state: t("revoked"),
    humanRole: "admin",
    invitedBy: t("board_user_20"),
    email: t("board20_paperclip_local"),
    createdAt: t("apr_20_2026_2_45_pm"),
    action: t("inactive"),
    relatedLabel: "—",
  },
  {
    id: "invite-expired",
    state: t("expired"),
    humanRole: "owner",
    invitedBy: t("board_user_19"),
    email: t("board19_paperclip_local"),
    createdAt: t("apr_19_2026_7_10_pm"),
    action: t("inactive"),
    relatedLabel: "—",
  },
] as const;

const fieldClassName =
  "w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500";
const panelClassName = "border border-zinc-800 bg-zinc-950/95 p-6";

function LabSection({
  eyebrow,
  title,
  description,
  accentClassName,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  accentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-(--rad-28) border border-border/70 bg-background/80 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-5",
        accentClassName,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusCard({
  icon,
  title,
  body,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  tone?: "default" | "warn" | "success" | "error";
}) {
  const { t } = useTranslation();
  const toneClassName = {
    default: "border-border/70 bg-background/85",
    warn: "border-amber-400/40 bg-amber-500/[0.08]",
    success: "border-emerald-400/40 bg-emerald-500/[0.08]",
    error: t("border_rose_400_40_bg_rose_500_0_08"),
  }[tone];

  return (
    <Card className={cn("rounded-(--rad-24) shadow-none", toneClassName)}>
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-current/10 bg-background/70 text-muted-foreground">
          {icon}
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">{body}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function InviteLandingShell({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-(--rad-28) border border-zinc-800 bg-zinc-950 shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
      <div className="grid gap-px bg-zinc-800 lg:grid-cols-(--gtc-37)">
        <section className={cn(panelClassName, "space-y-6 bg-zinc-950")}>{left}</section>
        <section className={cn(panelClassName, "h-full bg-zinc-950")}>{right}</section>
      </div>
    </div>
  );
}

function InviteSummaryPanel({
  title,
  description,
  inviteMessage,
  requestedAccess,
  signedInLabel,
}: {
  title: string;
  description: string;
  inviteMessage?: string;
  requestedAccess: string;
  signedInLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-start gap-4">
        <CompanyPatternIcon
          companyName="Acme Robotics"
          logoUrl="/api/invites/pcp_invite_test/logo"
          className="h-16 w-16 rounded-none border border-zinc-800"
        />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-(--tracking-caps) text-zinc-500">{t("youve_been_invited_to_join_paperclip")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-zinc-100">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">{description}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetaCard label={t("organization")} value="Acme Robotics" />
        <MetaCard label={t("invited_by")} value="Board User" />
        <MetaCard label={t("requested_access")} value={requestedAccess} />
        <MetaCard label={t("invite_expires")} value="Mar 7, 2027" />
      </div>

      {inviteMessage ? (
        <div className="border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="text-xs uppercase tracking-(--tracking-caps) text-amber-200/80">{t("message_from_inviter")}</div>
          <p className="mt-2 text-sm leading-6 text-amber-50">{inviteMessage}</p>
        </div>
      ) : null}

      {signedInLabel ? (
        <div className="border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-50">
          {t("signed_in_as")} <span className="font-medium">{signedInLabel}</span>.
        </div>
      ) : null}
    </>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 p-3">
      <div className="text-xs uppercase tracking-(--tracking-caps) text-zinc-500">{label}</div>
      <div className="mt-1 text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function InlineAuthPreview({
  mode,
  feedback,
  working,
}: {
  mode: "sign_up" | "sign_in";
  feedback?: { tone: "info" | "error"; text: string };
  working?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">
          {mode === "sign_up" ? t("create_your_account") : t("sign_in_to_continue")}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          {mode === "sign_up"
            ? t("start_with_a_paperclip_account_after_that_youll")
            : t("use_the_paperclip_account_that_already_matches_t")}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={cn(
            "flex-1 border px-3 py-2 text-sm transition-colors",
            mode === "sign_up"
              ? "border-zinc-100 bg-zinc-100 text-zinc-950"
              : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
          )}
        >
          {t("create_account_aaf374")}
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 border px-3 py-2 text-sm transition-colors",
            mode === "sign_in"
              ? "border-zinc-100 bg-zinc-100 text-zinc-950"
              : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
          )}
        >
          {t("i_already_have_an_account")}
        </button>
      </div>

      <form className="space-y-4">
        {mode === "sign_up" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">{t("name")}</span>
            <input name="name" className={fieldClassName} defaultValue="Jane Example" readOnly />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-400">{t("email")}</span>
          <input name="email" type="email" className={fieldClassName} defaultValue="jane@example.com" readOnly />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-400">{t("password")}</span>
          <input name="password" type="password" className={fieldClassName} defaultValue="supersecret" readOnly />
        </label>
        {feedback ? (
          <p className={cn("text-xs", feedback.tone === "info" ? "text-amber-300" : "text-red-400")}>
            {feedback.text}
          </p>
        ) : null}
        <Button type="button" className="w-full rounded-none" disabled={working}>
          {working ? t("working_049ac8") : mode === "sign_in" ? t("sign_in_and_continue") : t("create_account_and_continue")}
        </Button>
      </form>

      <p className="text-xs leading-5 text-zinc-500">
        {mode === "sign_up"
          ? t("already_signed_up_before_use_the_existing_accoun")
          : t("no_account_yet_switch_back_to_create_account_so")}
      </p>
    </div>
  );
}

function AgentRequestPreview() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">{t("submit_agent_details")}</h3>
        <p className="mt-1 text-sm text-zinc-400">
          {t("this_invite_will_create_an_approval_request_for_1bda4b")}
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-400">{t("agent_name")}</span>
        <input className={fieldClassName} defaultValue="Acme Ops Agent" readOnly />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-400">{t("adapter_type")}</span>
        <select className={fieldClassName} defaultValue="codex_local" disabled>
          <option value="codex_local">{t("codex")}</option>
          <option value="claude_local">{t("claude_code")}</option>
          <option value="cursor">{t("cursor")}</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-400">{t("capabilities")}</span>
        <textarea
          className={fieldClassName}
          rows={4}
          defaultValue="Reviews invites, triages requests, and keeps the board queue moving."
          readOnly
        />
      </label>
      <Button type="button" className="w-full rounded-none">
        {t("submit_request")}
      </Button>
    </div>
  );
}

function AcceptInvitePreview({
  autoAccept,
  isCurrentMember,
  error,
}: {
  autoAccept?: boolean;
  isCurrentMember?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">{t("accept_organization_invite")}</h3>
        <p className="mt-1 text-sm text-zinc-400">
          {autoAccept
            ? t("granting_your_access_to_acme_robotics")
            : isCurrentMember
              ? t("this_account_already_belongs_to_acme_robotics")
              : t("this_will_grant_or_complete_your_access_to_acme")}
        </p>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {autoAccept ? (
        <div className="text-sm text-zinc-400">{t("submitting_request")}</div>
      ) : (
        <Button type="button" className="w-full rounded-none" disabled={isCurrentMember}>
          {t("accept_invite")}
        </Button>
      )}
    </div>
  );
}

function InviteResultPreview({
  title,
  description,
  claimSecret,
  onboardingTextUrl,
  joinedNow = false,
}: {
  title: string;
  description: string;
  claimSecret?: string;
  onboardingTextUrl?: string;
  joinedNow?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
      <div className="flex items-center gap-3">
        <CompanyPatternIcon
          companyName="Acme Robotics"
          logoUrl="/api/invites/pcp_invite_test/logo"
          className="h-12 w-12 rounded-none border border-zinc-800"
        />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-zinc-400">{description}</p>
        {joinedNow ? (
          <Button type="button" className="w-full rounded-none">
            {t("open_board")}
          </Button>
        ) : (
          <>
            <div className="border border-zinc-800 p-3">
              <p className="mb-1 text-xs text-zinc-500">{t("approval_page")}</p>
              <a className="text-sm text-zinc-200 underline underline-offset-2" href="/company/settings/members">
                {t("settings_members")}
              </a>
            </div>
            <p className="text-xs text-zinc-500">
              {t("refresh_this_page_after_youve_been_approved_youl")}
            </p>
          </>
        )}
        {claimSecret ? (
          <div className="space-y-1 border border-zinc-800 p-3 text-xs text-zinc-400">
            <div className="text-zinc-200">{t("claim_secret")}</div>
            <div className="font-mono break-all">{claimSecret}</div>
            <div className="font-mono break-all">{t("post_api_agents_claim_api_key")}</div>
          </div>
        ) : null}
        {onboardingTextUrl ? (
          <div className="text-xs text-zinc-400">
            {t("onboarding")} <span className="font-mono break-all">{onboardingTextUrl}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AuthScreenPreview({ mode, error }: { mode: "sign_in" | "sign_up"; error?: string }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-(--rad-28) border border-border/70 bg-background shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="grid gap-px bg-border/60 md:grid-cols-2">
        <div className="flex min-h-(--sz-420px) flex-col justify-center bg-background px-8 py-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("paperclip")}</span>
            </div>
            <h3 className="text-xl font-semibold">
              {mode === "sign_in" ? t("sign_in_to_paperclip") : t("create_your_paperclip_account")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "sign_in"
                ? t("use_your_email_and_password_to_access_this_insta")
                : t("create_an_account_for_this_instance_email_confir")}
            </p>
            <div className="mt-6 space-y-4">
              {mode === "sign_up" ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t("name")}</span>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                    defaultValue="Jane Example"
                    readOnly
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t("email")}</span>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  defaultValue="jane@example.com"
                  readOnly
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t("password")}</span>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  defaultValue="supersecret"
                  readOnly
                />
              </label>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <Button type="button" className="w-full">
                {mode === "sign_in" ? t("sign_in_f8492c") : t("create_account")}
              </Button>
            </div>
            <div className="mt-5 text-sm text-muted-foreground">
              {mode === "sign_in" ? t("need_an_account") : t("already_have_an_account")}{" "}
              <span className="font-medium text-foreground underline underline-offset-2">
                {mode === "sign_in" ? t("create_one") : t("sign_in")}
              </span>
            </div>
          </div>
        </div>
        <div className="hidden min-h-(--sz-420px) items-center justify-center bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.18),transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,1))] px-8 py-10 md:flex">
          <div className="max-w-sm space-y-4 text-zinc-200">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/[0.08] px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps) text-cyan-200">
              {t("auth_preview")}
            </div>
            <div className="text-2xl font-semibold">{t("side_by_side_signup_styling_review")}</div>
            <p className="text-sm leading-6 text-zinc-400">
              {t("this_frame_mirrors_the_production_auth_surface_s")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompanyInvitesPreview() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-5 xl:grid-cols-(--gtc-38)">
      <Card className="rounded-(--rad-28) shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MailPlus className="h-4 w-4" />
            {t("organization_invites")}
          </div>
          <div>
            <CardTitle>{t("create_invite")}</CardTitle>
            <CardDescription className="mt-2">
              {t("generate_a_human_invite_link_and_choose_the_defa")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t("choose_a_role")}</legend>
            <div className="rounded-2xl border border-border">
              {inviteRoleOptions.map((option, index) => (
                <label
                  key={option.value}
                  className={cn("flex cursor-default gap-3 px-4 py-4", index > 0 && "border-t border-border")}
                >
                  <input
                    type="radio"
                    readOnly
                    checked={option.value === "operator"}
                    className="mt-1 h-4 w-4 border-border text-foreground"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.value === "operator" ? (
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {t("default_808d7d")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{option.description}</span>
                    <span className="block text-sm text-foreground">{option.gets}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
            {t("each_invite_link_is_single_use_human_invitees_ge")}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">{t("create_invite")}</Button>
            <span className="text-sm text-muted-foreground">{t("invite_history_below_keeps_the_audit_trail")}</span>
          </div>

          <div className="space-y-3 rounded-2xl border border-border px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t("latest_invite_link")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("this_url_includes_the_current_paperclip_domain_r")}
                </div>
              </div>
              <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <Check className="h-3.5 w-3.5" />
                {t("copied")}
              </div>
            </div>
            <button
              type="button"
              className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm break-all"
            >
              https://paperclip.local/invite/new-token
            </button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline">
                <ExternalLink className="h-4 w-4" />
                {t("open_invite")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-(--rad-28) shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{t("invite_history")}</CardTitle>
              <CardDescription className="mt-2">
                {t("review_invite_status_role_inviter_and_any_linked")}
              </CardDescription>
            </div>
            <a href="/inbox/requests" className="text-sm underline underline-offset-4">
              {t("open_join_request_queue")}
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("state")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("role")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("invited_by")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("created")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("join_request")}</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">{t("action")}</th>
                </tr>
              </thead>
              <tbody>
                {inviteHistory.map((invite) => (
                  <tr key={invite.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-3 align-top">
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {invite.state}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 align-top">{getDisplayLabel(invite.humanRole)}</td>
                    <td className="px-5 py-3 align-top">
                      <div>{invite.invitedBy}</div>
                      <div className="text-xs text-muted-foreground">{invite.email}</div>
                    </td>
                    <td className="px-5 py-3 align-top text-muted-foreground">{invite.createdAt}</td>
                    <td className="px-5 py-3 align-top">
                      {invite.relatedLabel === "Review request" ? (
                        <a href="/inbox/requests" className="underline underline-offset-4">
                          {invite.relatedLabel}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{invite.relatedLabel}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      {invite.action === "Revoke" ? (
                        <Button type="button" size="sm" variant="outline">
                          {t("revoke")}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("inactive")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-medium">{t("empty_history_state")}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {t("no_invites_have_been_created_for_this_organizati")}
              </div>
            </div>
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/[0.07] p-4">
              <div className="text-sm font-medium text-foreground">{t("permission_error")}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {t("you_do_not_have_permission_to_manage_organizatio")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function InviteUxLab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-(--rad-32) border border-border/70 bg-[linear-gradient(135deg,rgba(8,145,178,0.10),transparent_28%),linear-gradient(180deg,rgba(245,158,11,0.10),transparent_44%),var(--background)] shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <div className="grid gap-6 lg:grid-cols-(--gtc-39)">
          <div className="p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/[0.08] px-3 py-1 text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-caps) text-cyan-700 dark:text-cyan-300">
              <FlaskConical className="h-3.5 w-3.5" />
              {t("invite_ux_lab")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t("invite_and_signup_ux_review_surface")}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("this_page_collects_the_current_invite_landing_si")}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                /tests/ux/invites
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                {t("signup_invite_states")}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                {t("fixture_backed_preview")}
              </Badge>
            </div>
          </div>

          <aside className="border-t border-border/60 bg-background/70 p-6 lg:border-l lg:border-t-0">
            <div className="mb-4 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
              {t("covered_states")}
            </div>
            <div className="space-y-3">
              {[
                t("invite_loading_access_check_missing_token_and_un"),
                t("inline_account_creation_and_sign_in_variants_inc"),
                t("human_accept_agent_request_and_auto_accept_trans"),
                t("pending_approval_joined_now_claim_secret_and_onb"),
                t("organization_invite_creation_copied_link_history"),
              ].map((highlight) => (
                <div
                  key={highlight}
                  className="rounded-2xl border border-border/70 bg-background/85 px-4 py-3 text-sm text-muted-foreground"
                >
                  {highlight}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      <LabSection
        eyebrow="Top-level states"
        title={t("landing_state_coverage")}
        description={t("small_cards_for_the_fast_return_invite_states_th")}
        accentClassName="bg-[linear-gradient(180deg,rgba(59,130,246,0.05),transparent_30%),var(--background)]"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            icon={<Loader2 className="h-4 w-4 animate-spin" />}
            title={t("loading_invite_392edb")}
            body={t("shown_while_invite_summary_deployment_mode_or_au")}
          />
          <StatusCard
            icon={<Clock3 className="h-4 w-4" />}
            title={t("checking_your_access_87bd70")}
            body={t("shown_after_sign_in_while_the_app_verifies_wheth")}
          />
          <StatusCard
            icon={<KeyRound className="h-4 w-4" />}
            title={t("invalid_invite_token_ecd61c")}
            body={t("the_token_is_missing_entirely_so_the_page_short")}
            tone="error"
          />
          <StatusCard
            icon={<Link2 className="h-4 w-4" />}
            title={t("invite_not_available")}
            body={t("used_for_expired_revoked_already_consumed_or_oth")}
            tone="warn"
          />
          <StatusCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title={t("bootstrap_complete")}
            body={t("result_screen_for_bootstrap_ceo_invites_after_se")}
            tone="success"
          />
          <StatusCard
            icon={<ArrowRight className="h-4 w-4" />}
            title={t("auto_accept_in_progress")}
            body={t("signed_in_human_users_skip_the_extra_button_clic")}
          />
          <StatusCard
            icon={<Users className="h-4 w-4" />}
            title={t("already_a_member")}
            body={t("acceptance_stays_disabled_and_the_page_redirects")}
          />
          <StatusCard
            icon={<UserPlus className="h-4 w-4" />}
            title={t("invite_result_surfaces")}
            body={t("both_pending_approval_and_joined_now_confirmatio")}
            tone="success"
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow="Invite landing"
        title={t("split_screen_invite_flows")}
        description={t("these_frames_mirror_the_production_invite_surfac")}
        accentClassName="bg-[linear-gradient(180deg,rgba(234,179,8,0.06),transparent_28%),var(--background)]"
      >
        <div className="space-y-5">
          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("join_acme_robotics")}
                description={t("create_your_paperclip_account_first_if_you_alrea")}
                inviteMessage={t("welcome_aboard")}
                requestedAccess="Operator"
              />
            }
            right={<InlineAuthPreview mode="sign_up" />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("join_acme_robotics")}
                description={t("create_your_paperclip_account_first_if_you_alrea")}
                inviteMessage={t("welcome_aboard")}
                requestedAccess="Operator"
              />
            }
            right={
              <InlineAuthPreview
                mode="sign_in"
                feedback={{
                  tone: "info",
                  text: t("an_account_already_exists_for_jane_example_com_s"),
                }}
              />
            }
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("join_acme_robotics")}
                description={t("your_account_is_ready_review_the_invite_details")}
                inviteMessage={t("welcome_aboard")}
                requestedAccess="Operator"
                signedInLabel={t("jane_example")}
              />
            }
            right={<AcceptInvitePreview autoAccept />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("join_acme_robotics")}
                description={t("review_the_invite_details_then_submit_the_agent")}
                requestedAccess="Agent join request"
              />
            }
            right={<AgentRequestPreview />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("join_acme_robotics")}
                description={t("your_account_is_ready_review_the_invite_details")}
                requestedAccess="Operator"
                signedInLabel={t("jane_example")}
              />
            }
            right={<AcceptInvitePreview error={t("this_account_already_belongs_to_the_organization")} isCurrentMember />}
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow="Result states"
        title={t("approval_and_completion_screens")}
        description={t("these_are_the_post_submit_states_returned_from_i")}
        accentClassName="bg-[linear-gradient(180deg,rgba(16,185,129,0.06),transparent_30%),var(--background)]"
      >
        <div className="grid gap-5 xl:grid-cols-3">
          <InviteResultPreview
            title={t("request_to_join_acme_robotics")}
            description={t("board_user_must_approve_your_request_to_join")}
            claimSecret="pcp_claim_secret_demo"
            onboardingTextUrl="/api/invites/pcp_invite_test/onboarding.txt"
          />
          <InviteResultPreview
            title={t("you_joined_the_organization")}
            description={t("your_account_already_matched_the_approved_invite")}
            joinedNow
          />
          <InviteResultPreview
            title={t("request_to_join_acme_robotics")}
            description={t("ask_them_to_visit_settings_members_to_approve_yo")}
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow="Standalone auth"
        title={t("auth_page_states")}
        description={t("the_general_auth_page_uses_a_different_compositi")}
        accentClassName="bg-[linear-gradient(180deg,rgba(168,85,247,0.06),transparent_28%),var(--background)]"
      >
        <div className="space-y-5">
          <AuthScreenPreview mode="sign_in" error={t("invalid_email_or_password")} />
          <AuthScreenPreview mode="sign_up" />
        </div>
      </LabSection>

      <LabSection
        eyebrow="Settings"
        title={t("organization_invite_management")}
        description={t("this_section_captures_the_board_side_invite_crea")}
        accentClassName="bg-[linear-gradient(180deg,rgba(244,114,182,0.06),transparent_28%),var(--background)]"
      >
        <CompanyInvitesPreview />
      </LabSection>
    </div>
  );
}
