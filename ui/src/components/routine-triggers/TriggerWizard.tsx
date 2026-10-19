import { t } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  AlertCircle,
  Globe,
  GitBranch,
  Radio,
  Webhook,
} from "lucide-react";
import {
  SetupWizardNavigation,
  SetupWizardFooter,
} from "@/components/SetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import { AgentInstructions, CopyField } from "./WebhookFields";
import { WebhookUrlWarning } from "./WebhookUrlWarning";

export type TriggerDraft = {
  kind: "choose" | "schedule" | "webhook";
  step: number;
  availableStep: number;
  sender: "custom" | "github";
  /** Retained when resuming webhooks created before generic signed-app support. */
  signingMode?: "bearer" | "app_webhook" | "fireflies_hmac";
  frequency: string;
  time: string;
  weekday: string;
  timezone: string;
  created: boolean;
};
export const defaultTriggerDraft: TriggerDraft = {
  kind: "choose",
  step: 0,
  availableStep: 0,
  sender: "custom",
  frequency: "weekdays",
  time: "09:00",
  weekday: "Monday",
  timezone: "America/Chicago",
  created: false,
};
export function webhookAgentInstructions(
  sender: TriggerDraft["sender"],
  routineTitle: string,
  webhookUrl: string,
  webhookSecret: string,
  setupPending = true,
  signingMode: TriggerDraft["signingMode"] = "app_webhook",
) {
  const common = [
    `Connect the sending app to the Paperclip routine ${JSON.stringify(routineTitle)}.`,
    `Webhook URL: ${webhookUrl}`,
    "Send an HTTP POST request with a JSON object as the body (not an array or string).",
    "Content-Type: application/json",
  ];
  const auth =
    sender === "github"
      ? [
          "In GitHub, open your repository → Settings → Webhooks → Add webhook.",
          "Use the webhook URL above as Payload URL and select application/json as Content type.",
          `Secret: ${webhookSecret}`,
          "Paste this value into GitHub’s Secret field. GitHub signs requests with X-Hub-Signature-256; do not use Bearer authentication.",
          "Select the events that should start this routine, enable the webhook, and save.",
          "To check the connection, open Recent Deliveries and redeliver an event.",
        ]
      : [
          `Secret key: ${webhookSecret}`,
          ...(signingMode === "bearer" ? [] : [
            `If the app asks for a signing secret, paste the secret key above. Paperclip accepts HMAC-SHA256 over the exact request body in ${signingMode === "fireflies_hmac" ? "X-Hub-Signature" : "X-Hub-Signature or X-Hub-Signature-256"}, formatted sha256=<hex digest>.`,
          ]),
          ...(signingMode === "fireflies_hmac" ? [] : [
            `For apps with custom headers, use Authorization: Bearer ${webhookSecret}`,
          ]),
          "Subscribe only to the events that should start this routine. Public services need a publicly reachable HTTPS URL.",
          "In the sending app, add a webhook using this URL, POST method, JSON body, and headers, then save it.",
          "Send a unique Idempotency-Key header for each event and reuse it on retries, so retrying a setup test after activation cannot start the routine.",
          'Example JSON body: {"event":"deployment.completed","environment":"production"}',
          "To check the connection, send a test event from the app or perform the action that triggers a delivery.",
        ];
  return [
    ...common,
    ...auth,
    "Open Check connection in Paperclip to see whether the event arrived and authentication passed.",
    ...(setupPending
      ? [
          "During setup, deliveries only test the connection. They do not start the routine or create a task.",
          "Finish setup in Paperclip to enable this webhook for future events. Test events are not replayed.",
        ]
      : [
          "This webhook is enabled. Deliveries can start the routine and create tasks.",
        ]),
    "Store the key securely; do not put it in source control or logs.",
  ].join("\n");
}
export function describeSchedule(draft: TriggerDraft) {
  return `${draft.frequency === "daily" ? "Every day" : draft.frequency === "weekly" ? `Every ${draft.weekday}` : "Every weekday"} at ${draft.time}`;
}
export function RoutineTriggerWizard({
  initialDraft,
  onSaveExit,
  onFinish,
  onCreateWebhook,
  onRotateKey,
  routineTitle,
  routineId,
  routineActive = true,
  webhookUrl = "",
  webhookSecret = "",
  checkResult = "waiting",
}: {
  initialDraft: TriggerDraft;
  routineTitle: string;
  routineId: string;
  routineActive?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  onCreateWebhook?: (draft: TriggerDraft) => Promise<void>;
  onRotateKey?: () => Promise<void>;
  onSaveExit: (draft: TriggerDraft) => void | Promise<void>;
  onFinish: (draft: TriggerDraft) => void | Promise<void>;
  checkResult?: "waiting" | "received" | "rejected" | "no_event";
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { setBreadcrumbs } = useBreadcrumbs();
  const perform = useCallback(
    async (action: () => void | Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setSaveError("");
      try {
        await action();
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Couldn’t save. Please try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );
  const saveAndExit = useCallback(() => {
    void perform(() => onSaveExit(draft));
  }, [draft, onSaveExit, perform]);
  useEffect(() => {
    setBreadcrumbs([
      {
        label: routineTitle,
        href: `/routines/${routineId}/triggers`,
        onClick: (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          saveAndExit();
        },
      },
      { label: t("add_trigger") },
    ]);
  }, [saveAndExit, setBreadcrumbs, routineTitle, routineId]);
  const schedule = draft.kind === "schedule";
  const github = draft.sender === "github";
  const labels = schedule
    ? ["Choose trigger", "Set schedule", "Review schedule"]
    : ["Choose trigger", "Connect your app", "Check connection"];
  function patch(values: Partial<TriggerDraft>) {
    setDraft((current) => ({ ...current, ...values }));
  }
  function advance() {
    void perform(async () => {
      if (draft.kind === "webhook" && draft.step === 0 && !draft.created)
        await onCreateWebhook?.(draft);
      const step = draft.step + 1;
      patch({
        step,
        availableStep: Math.max(draft.availableStep, step),
        created:
          draft.created || (draft.kind === "webhook" && draft.step === 0),
      });
    });
  }
  const title =
    draft.step === 0
      ? "When should this routine run?"
      : schedule
        ? draft.step === 1
          ? "Set a schedule"
          : "Review your schedule"
        : draft.step === 1
          ? `Connect ${github ? "GitHub" : "your app"}`
          : "Check your connection";
  const subtitle =
    draft.step === 0
      ? `Choose how to start “${routineTitle}”. You can add another trigger later.`
      : schedule
        ? draft.step === 1
          ? "Choose when Paperclip should start this routine automatically."
          : "This schedule starts the routine automatically. You can pause or change it later."
        : draft.step === 1
          ? "Copy these details into the sending app, then save its webhook settings."
          : "Test that events arrive and authentication works. This won’t start the routine.";
  const selectClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  const goBack = (
    <Button variant="outline" onClick={() => patch({ step: draft.step - 1 })}>{t("common.back")}</Button>
  );
  return (
    <div className="min-w-0 w-full max-w-2xl space-y-6">
      <SetupWizardNavigation
        takeover
        disabled={busy}
        ariaLabel="Trigger setup progress"
        labels={labels}
        step={draft.step}
        availableStep={draft.availableStep}
        onSelect={(step) => patch({ step })}
      />
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {!schedule && draft.step > 0 && <WebhookUrlWarning url={webhookUrl} />}
        {draft.step === 0 && (
          <fieldset className="space-y-3">
            <legend className="sr-only">{t("stability.31a9d2bd7aed", { defaultValue: "Trigger type" })}</legend>
            {(
              [
                {
                  kind: "schedule",
                  label: t("stability.8c4f34506ebc", { defaultValue: "On a schedule" }),
                  detail: "Every day, on weekdays, or once a week.",
                  Icon: CalendarClock,
                },
                {
                  kind: "webhook",
                  label: t("stability.d7f97da16118", { defaultValue: "When another app sends a webhook" }),
                  detail:
                    "When something happens in GitHub, another app, or a script.",
                  Icon: Webhook,
                },
              ] as const
            ).map(({ kind, label, detail, Icon }) => (
              <label
                key={kind}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-4 focus-within:ring-2 focus-within:ring-ring",
                  draft.kind === kind
                    ? "border-primary bg-accent/30"
                    : "border-border hover:bg-accent/20",
                )}
              >
                <input
                  type="radio"
                  name="trigger-kind"
                  checked={draft.kind === kind}
                  disabled={draft.created && kind !== draft.kind}
                  onChange={() =>
                    patch({
                      kind,
                      availableStep:
                        kind === draft.kind ? draft.availableStep : 0,
                    })
                  }
                  className="sr-only"
                />
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {detail}
                  </span>
                </span>
                {draft.kind === kind && <Check className="h-4 w-4" />}
              </label>
            ))}
          </fieldset>
        )}
        {schedule && draft.step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="repeat">{t("stability.b6b7a0065808", { defaultValue: "Repeat" })}</Label>
                <select
                  id="repeat"
                  className={selectClass}
                  value={draft.frequency}
                  onChange={(event) => patch({ frequency: event.target.value })}
                >
                  <option value="daily">{t("every_day")}</option>
                  <option value="weekdays">{t("stability.0ea2df5ff8ad", { defaultValue: "Weekdays (Monday–Friday)" })}</option>
                  <option value="weekly">{t("stability.1b7e18513af4", { defaultValue: "Every week" })}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-time">{t("stability.33b93476cf59", { defaultValue: "Time" })}</Label>
                <Input
                  id="run-time"
                  type="time"
                  value={draft.time}
                  onChange={(event) => patch({ time: event.target.value })}
                />
              </div>
            </div>
            {draft.frequency === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="run-day">{t("stability.8f2364e11b8b", { defaultValue: "Day" })}</Label>
                <select
                  id="run-day"
                  className={selectClass}
                  value={draft.weekday}
                  onChange={(event) => patch({ weekday: event.target.value })}
                >
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((day) => (
                    <option key={day}>{day}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="timezone">{t("stability.b9fe1464783e", { defaultValue: "Time zone" })}</Label>
              <select
                id="timezone"
                className={selectClass}
                value={draft.timezone}
                onChange={(event) => patch({ timezone: event.target.value })}
              >
                {Array.from(
                  new Set([
                    draft.timezone,
                    "America/Chicago",
                    "America/New_York",
                    "America/Los_Angeles",
                    "Europe/London",
                    "UTC",
                  ]),
                ).map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("stability.ea2bf434668f", { defaultValue: "The time follows this zone, including daylight saving changes." })}</p>
            </div>
          </div>
        )}
        {schedule && draft.step === 2 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-md bg-muted/40 p-4">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{describeSchedule(draft)}</p>
                <p className="text-xs text-muted-foreground">
                  {draft.timezone}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t("stability.ee4ebabb6717", { defaultValue: "Each scheduled run creates a task for the routine’s assigned agent. Any existing webhook triggers will continue to work." })}</p>
          </div>
        )}
        {draft.step === 0 && draft.kind === "webhook" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("stability.850bfd5b6f32", { defaultValue: "What’s sending the webhook?" })}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    sender: "custom",
                    label: t("stability.3368721465f9", { defaultValue: "Another app or script" }),
                    Icon: Globe,
                  },
                  { sender: "github", label: "GitHub", Icon: GitBranch },
                ] as const
              ).map(({ sender, label, Icon }) => (
                <label
                  key={sender}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border p-3 focus-within:ring-2 focus-within:ring-ring",
                    draft.sender === sender
                      ? "border-primary bg-accent/30"
                      : "border-border",
                    draft.created && "cursor-default",
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="sender"
                    checked={draft.sender === sender}
                    disabled={draft.created}
                    onChange={() => patch({ sender })}
                  />
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-sm">{label}</span>
                  {draft.sender === sender && <Check className="h-4 w-4" />}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {draft.kind === "webhook" && draft.step === 0 && (
          <p className="text-sm text-muted-foreground">{t("stability.090e88c6260e", { defaultValue: "Public services need a publicly reachable HTTPS webhook URL." })}</p>
        )}
        {!schedule && draft.step === 1 && (
          <div className="space-y-5">
            {webhookSecret && (
              <AgentInstructions
                value={webhookAgentInstructions(
                  draft.sender,
                  routineTitle,
                  webhookUrl,
                  webhookSecret,
                  true,
                  draft.signingMode,
                )}
              />
            )}
            <CopyField
              label={github ? t("stability.1de5cdcfa7ca", { defaultValue: "Payload URL" }) : t("webhook_url")}
              value={webhookUrl}
            />
            {!github && draft.signingMode !== "bearer" && (
              <p className="text-sm text-muted-foreground">{t("stability.3dd90f15925b", { defaultValue: "Paste this key into your app’s signing secret field." })}{draft.signingMode !== "fireflies_hmac" && <>
                  {" "}{t("stability.4d7327f21d8e", { defaultValue: "If your app uses custom headers instead, set Authorization to Bearer followed by a space and this key." })}</>}
              </p>
            )}
            {webhookSecret ? (
              <CopyField
                label={github ? t("secret") : draft.signingMode === "bearer" ? t("stability.39a91b3db30e", { defaultValue: "Authorization header value" }) : t("stability.f47a99ebcf29", { defaultValue: "Secret key" })}
                value={!github && draft.signingMode === "bearer" ? `Bearer ${webhookSecret}` : webhookSecret}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("stability.8e6e20d139ef", { defaultValue: "The key is hidden after leaving setup. If you haven’t saved it in your app, generate a replacement." })}</p>
                <Button
                  variant="outline"
                  onClick={() => void perform(() => onRotateKey?.())}
                >{t("stability.3a14b7bb1a2d", { defaultValue: "Generate new key" })}</Button>
              </div>
            )}
          </div>
        )}
        {!schedule && draft.step === 2 && (
          <div className="space-y-5">
            <div className="space-y-1 rounded-md border border-border p-4">
              <p className="text-sm font-medium">{t("stability.fd7045f15f97", { defaultValue: "Connection test only" })}</p>
              <p className="text-sm text-muted-foreground">{t("stability.ca8e4cd46363", { defaultValue: "Events received during setup won’t start the routine or create tasks." })}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("stability.af0f9889db03", { defaultValue: "Send an event from" })}{" "}{github ? "GitHub" : t("stability.4696a33536d7", { defaultValue: "your app" })}
              </p>
              <p className="text-sm text-muted-foreground">
                {github
                  ? t("stability.e2c845a58aac", { defaultValue: "Open this webhook in your repository settings. Under Recent Deliveries, choose Redeliver on an event." })
                  : t("stability.643e56b82219", { defaultValue: "Look for “Send test” in your app’s webhook settings. If it doesn’t have one, do the action that should trigger the webhook—for example, complete a deployment." })}
              </p>
              <p className="text-xs text-muted-foreground">{t("stability.f5c741548eae", { defaultValue: "Keep this page open to see the test result." })}</p>
            </div>
            <div
              role="status"
              className="flex items-start gap-3 rounded-md bg-muted/40 p-4"
            >
              {checkResult === "received" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-(--status-task-done)" />
              ) : checkResult === "rejected" ? (
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              ) : (
                <Radio className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {checkResult === "received"
                    ? t("stability.b57a6eee90b0", { defaultValue: "Test event received · Connection working" })
                    : checkResult === "rejected"
                      ? t("stability.8ac7b7edc6a0", { defaultValue: "Event arrived, but the key was rejected" })
                      : checkResult === "no_event"
                        ? t("stability.4d6fd6a8ec99", { defaultValue: "No event received yet" })
                        : t("stability.6da2e8bcc917", { defaultValue: "Waiting for an event from your app…" })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {checkResult === "received"
                    ? t("stability.407050a5a842", { defaultValue: "Authentication passed. No routine run or task was created." })
                    : checkResult === "rejected"
                      ? t("stability.d5b974d7c1eb", { defaultValue: "Go back to Connect your app, update the key in your sending app, and resend. No task was created." })
                      : t("stability.f29bb26ef7a2", { defaultValue: "Waiting to verify delivery and authentication. The routine is not running." })}
                </p>
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">{t("stability.f854de0340ea", { defaultValue: "Troubleshoot delivery" })}</summary>
              <div className="space-y-3 pt-3">
                <p className="text-xs text-muted-foreground">{t("stability.a4e5ad3df38a", { defaultValue: "Check that the webhook is enabled in your sending app and that its URL matches. Scripts must send POST with a JSON body." })}</p>
                <CopyField label={t("webhook_url")} value={webhookUrl} />
              </div>
            </details>
          </div>
        )}
        {!schedule && draft.step === 2 && (
          <p className="text-xs text-muted-foreground">
            {routineActive
              ? t("stability.391fff2bae3c", { defaultValue: "Finish setup to enable this webhook. Future events will start the routine; this test event won’t be replayed." })
              : t("stability.7580f0663983", { defaultValue: "Finish setup to save this webhook. The routine is paused; enable its automatic triggers when you’re ready. This test event won’t be replayed." })}
          </p>
        )}
        {schedule && draft.step === 2 && !routineActive && (
          <p className="text-sm text-muted-foreground">{t("stability.28f907214665", { defaultValue: "The routine is paused. Enable its automatic triggers when you’re ready to use this schedule." })}</p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        <SetupWizardFooter onSaveExit={saveAndExit}>
          {draft.step > 0 && goBack}
          {draft.step === 0 ? (
            <Button disabled={draft.kind === "choose"} onClick={advance}>{t("continue")}</Button>
          ) : schedule ? (
            draft.step === 1 ? (
              <Button disabled={!draft.time} onClick={advance}>{t("stability.98c00356c056", { defaultValue: "Review schedule" })}</Button>
            ) : (
              <Button onClick={() => void perform(() => onFinish(draft))}>{t("stability.79218735c296", { defaultValue: "Add schedule" })}</Button>
            )
          ) : draft.step === 1 ? (
            <Button onClick={advance}>{t("stability.be5dff52eeb0", { defaultValue: "Check connection" })}</Button>
          ) : (
            <Button onClick={() => void perform(() => onFinish(draft))}>
              {checkResult === "received"
                ? t("finish_setup")
                : t("stability.ccfc47b4b1a3", { defaultValue: "Finish without checking" })}
            </Button>
          )}
        </SetupWizardFooter>
      </fieldset>
    </div>
  );
}
