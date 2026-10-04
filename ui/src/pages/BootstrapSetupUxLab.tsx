import type { ReactElement, ReactNode } from "react";
import { Loader2, ShieldCheck, Terminal, TriangleAlert } from "lucide-react";
import { BOOTSTRAP_FALLBACK_COMMAND } from "@/bootstrapSetup";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/i18n";
import { t } from "@/i18n";

type LabFixtureKey =
  | "signed-out-private"
  | "signed-in-private"
  | "claiming"
  | "claim-error"
  | "claim-success"
  | "public-invite-only";

const FIXTURE_LABELS: Record<LabFixtureKey, string> = {
  "signed-out-private": t("1_authenticated_private_signed_out_browser_claim"),
  "signed-in-private": t("2_authenticated_private_signed_in_claim_cta_prim"),
  claiming: t("3_authenticated_private_claim_in_flight"),
  "claim-error": t("4_authenticated_private_claim_error_e_g_409_alre"),
  "claim-success": t("5_authenticated_private_claim_succeeded_redirect"),
  "public-invite-only": t("6_authenticated_public_invite_only_no_browser_cl"),
};

const FIXTURE_ORDER: LabFixtureKey[] = [
  "signed-out-private",
  "signed-in-private",
  "claiming",
  "claim-error",
  "claim-success",
  "public-invite-only",
];

function CliFallback({ hasActiveInvite }: { hasActiveInvite: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Terminal className="size-4 text-muted-foreground" aria-hidden />
        <span>{t("prefer_to_finish_setup_from_the_host")}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasActiveInvite
          ? t("a_bootstrap_invite_is_already_active_check_your_cf70e7")
          : t("run_this_command_on_the_host_that_runs_paperclip_8f7384")}
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
{BOOTSTRAP_FALLBACK_COMMAND}
      </pre>
    </div>
  );
}

function StateChrome({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="block p-6">{children}</Card>
    </div>
  );
}

function SignedOutPrivate() {
  const { t } = useTranslation();
  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("finish_setting_up_this_paperclip")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("no_admin_has_claimed_this_instance_yet_sign_in_o")}
      </p>
      <div className="mt-5">
        <Button asChild>
          <a href="/auth?next=/">{t("sign_in_create_account")}</a>
        </Button>
      </div>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function SignedInPrivate() {
  const { t } = useTranslation();
  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("finish_setting_up_this_paperclip")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("no_admin_has_claimed_this_instance_yet_claim_it")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button>{t("claim_this_instance")}</Button>
        <span className="text-sm text-muted-foreground">
          {t("signed_in_as")} <span className="font-medium text-foreground">{t("jane_appliance_local")}</span>
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("wrong_account")}{" "}
        <a href="/auth?next=/" className="underline underline-offset-2">
          {t("switch_account")}
        </a>
        .
      </p>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function ClaimingPrivate() {
  const { t } = useTranslation();
  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("finish_setting_up_this_paperclip")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("no_admin_has_claimed_this_instance_yet_claim_it")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled>
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          {t("claiming_25b55e")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t("signed_in_as")} <span className="font-medium text-foreground">{t("jane_appliance_local")}</span>
        </span>
      </div>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function ClaimErrorPrivate() {
  const { t } = useTranslation();
  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("finish_setting_up_this_paperclip")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("no_admin_has_claimed_this_instance_yet_claim_it")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button>{t("claim_this_instance")}</Button>
        <span className="text-sm text-muted-foreground">
          {t("signed_in_as")} <span className="font-medium text-foreground">{t("jane_appliance_local")}</span>
        </span>
      </div>
      <div
        role="alert"
        className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
      >
        <TriangleAlert className="mt-0.5 size-4 flex-shrink-0" aria-hidden />
        <div>
          <p className="font-medium">{t("someone_else_has_already_claimed_this_instance")}</p>
          <p className="mt-1 text-destructive/90">
            {t("refresh_to_sign_in_or_ask_the_existing_admin_to_fcb25f")}{" "}
            <span className="font-mono">{t("settings_access")}</span>.
          </p>
        </div>
      </div>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function ClaimSuccess() {
  const { t } = useTranslation();
  return (
    <StateChrome>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{t("you_re_the_instance_admin")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("setup_is_complete_taking_you_to_onboarding_to_cr_88b7dd")}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">{t("redirecting_1af797")}</span>
      </div>
      <div className="mt-5">
        <Button asChild variant="outline">
          <a href="/">{t("continue_to_dashboard")}</a>
        </Button>
      </div>
    </StateChrome>
  );
}

function PublicInviteOnly() {
  const { t } = useTranslation();
  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("this_paperclip_is_waiting_on_its_first_admin")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("this_instance_runs_in_invite_only_mode_the_opera_b2ff61")}
      </p>
      <CliFallback hasActiveInvite />
      <p className="mt-4 text-xs text-muted-foreground">
        {t("browser_based_claim_is_intentionally_disabled_in_e6b2fb")}
      </p>
    </StateChrome>
  );
}

const FIXTURE_BODIES: Record<LabFixtureKey, ReactElement> = {
  "signed-out-private": <SignedOutPrivate />,
  "signed-in-private": <SignedInPrivate />,
  claiming: <ClaimingPrivate />,
  "claim-error": <ClaimErrorPrivate />,
  "claim-success": <ClaimSuccess />,
  "public-invite-only": <PublicInviteOnly />,
};

export function BootstrapSetupUxLab() {
  const { t } = useTranslation();
  return (
    <div className="bg-background min-h-screen pb-16">
      <header className="border-b border-border bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("ux_lab")}</p>
          <h1 className="mt-1 text-2xl font-semibold">{t("bootstrap_pending_setup_states")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("fixtures_for_the_bootstrap_pending_screen_in")} <span className="font-mono">{t("cloudaccessgate")}</span>{t("zhPages.3f7eb048a08e")}{" "}
            <a className="underline underline-offset-2" href="/PAP/issues/PAP-10113">
              {t("pap_10113")}
            </a>{" "}
            {t("and_the_implementation_reference_for")}{" "}
            <a className="underline underline-offset-2" href="/PAP/issues/PAP-10114">
              {t("pap_10114")}
            </a>{t("zhPages.815915c459af")}{" "}
            <span className="font-mono">{t("deploymentmode_authenticated")}</span>{t("zhPages.6201111b83a0")}{" "}
            <span className="font-mono">{t("deploymentexposure_private")}</span>.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-12 px-6 pt-10">
        {FIXTURE_ORDER.map((key) => (
          <section key={key} aria-labelledby={`lab-${key}`}>
            <h2
              id={`lab-${key}`}
              className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {FIXTURE_LABELS[key]}
            </h2>
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-2">
              {FIXTURE_BODIES[key]}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
