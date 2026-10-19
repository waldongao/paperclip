import { Database, Gauge, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { t, useTranslation } from "@/i18n";

const SURFACES = [
  {
    title: t("inference_ledger"),
    description: t("request_scoped_usage_and_billed_runs_from_cost_e"),
    icon: Database,
    points: [t("tokens_billed_dollars"), t("provider_biller_model"), t("subscription_and_overage_aware")],
    tone: "from-sky-500/12 via-sky-500/6 to-transparent",
  },
  {
    title: t("finance_ledger"),
    description: t("account_level_charges_that_are_not_one_prompt_re"),
    icon: ReceiptText,
    points: [t("top_ups_refunds_fees"), t("bedrock_provisioned_or_training_charges"), t("credit_expiries_and_adjustments")],
    tone: "from-amber-500/14 via-amber-500/6 to-transparent",
  },
  {
    title: t("live_quotas"),
    description: t("provider_or_biller_windows_that_can_stop_traffic"),
    icon: Gauge,
    points: [t("provider_quota_windows"), t("biller_credit_systems"), t("errors_surfaced_directly")],
    tone: "from-emerald-500/14 via-emerald-500/6 to-transparent",
  },
] as const;

export function AccountingModelCard() {
  const { t } = useTranslation();
  return (
    <Card className="relative overflow-hidden border-border/70">
      <div className="absolute inset-0 bg-(image:--gradient-extract-3)" />
      <CardHeader className="relative px-5 pt-5 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("accounting_model")}
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6">
          {t("paperclip_now_separates_request_level_inference")}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid gap-3 px-5 pb-5 md:grid-cols-3">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          return (
            <div
              key={surface.title}
              className={`rounded-2xl border border-border/70 bg-gradient-to-br ${surface.tone} p-4 shadow-sm`}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{surface.title}</div>
                  <div className="text-xs text-muted-foreground">{surface.description}</div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {surface.points.map((point) => (
                  <div key={point}>{point}</div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
