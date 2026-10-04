import { useState, useRef, useEffect, useCallback } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";

/* ---- Help text for (?) tooltips ---- */
export const help: Record<string, string> = {
  name: t("display_name_for_this_agent"),
  title: t("job_title_shown_in_the_org_chart"),
  role: t("organizational_role_determines_position_and_capa"),
  reportsTo: t("the_agent_this_one_reports_to_in_the_org_hierarc"),
  capabilities: t("describes_what_this_agent_can_do_shown_in_the_or"),
  adapterType: t("how_this_agent_runs_local_cli_claude_codex_openc"),
  cwd: t("deprecated_legacy_working_directory_fallback_for"),
  promptTemplate: t("zhComponents.promptTemplateHint", { interpolation: { prefix: "%{", suffix: "}%" } }),
  model: t("override_the_default_model_used_by_the_adapter"),
  thinkingEffort: t("control_model_reasoning_depth_supported_values_v"),
  chrome: t("enable_claudes_chrome_integration_by_passing_chr"),
  dangerouslySkipPermissions: t("run_unattended_by_auto_approving_adapter_permiss"),
  dangerouslyBypassSandbox: t("run_codex_without_sandbox_restrictions_required"),
  search: t("enable_codex_web_search_capability_during_runs"),
  fastMode: t("enable_codex_fast_mode_this_burns_credits_tokens"),
  workspaceStrategy: t("how_paperclip_should_realize_an_execution_worksp"),
  workspaceBaseRef: t("base_git_ref_used_when_creating_a_worktree_branc"),
  workspaceBranchTemplate: t("zhComponents.branchTemplateHint", { interpolation: { prefix: "%{", suffix: "}%" } }),
  worktreeParentDir: t("directory_where_derived_worktrees_should_be_crea"),
  runtimeServicesJson: t("optional_workspace_runtime_service_definitions_u"),
  maxTurnsPerRun: t("maximum_number_of_agentic_turns_tool_calls_per_h"),
  command: t("the_command_to_execute_e_g_node_python"),
  localCommand: t("override_the_path_to_the_cli_command_you_want_th"),
  args: t("command_line_arguments_comma_separated"),
  extraArgs: t("extra_cli_arguments_for_local_adapters_comma_sep"),
  envVars: t("environment_variables_injected_into_the_adapter"),
  secretAccess:
    t("secrets_this_agent_can_reach_env_var_bindings_ar"),
  bootstrapPrompt: t("only_sent_when_paperclip_starts_a_fresh_session"),
  payloadTemplateJson: t("optional_json_merged_into_remote_adapter_request"),
  webhookUrl: t("the_url_that_receives_post_requests_when_the_age"),
  heartbeatInterval: t("run_this_agent_automatically_on_a_timer_useful_f"),
  intervalSec: t("seconds_between_automatic_heartbeat_invocations"),
  timeoutSec: t("maximum_seconds_a_run_can_take_before_being_term"),
  graceSec: t("seconds_to_wait_after_sending_interrupt_before_f"),
  wakeOnDemand: t("allow_this_agent_to_be_woken_by_assignments_api"),
  cooldownSec: t("minimum_seconds_between_consecutive_heartbeat_ru"),
  maxConcurrentRuns: t("maximum_number_of_heartbeat_runs_that_can_execut"),
  maxTurnContinuationEnabled: t("automatically_queue_bounded_continuation_runs_wh"),
  maxTurnContinuationMaxAttempts: t("maximum_automatic_continuations_after_one_max_tu"),
  maxTurnContinuationDelaySec: t("seconds_to_wait_before_starting_each_max_turn_co"),
  budgetMonthlyCents: t("monthly_spending_limit_in_cents_0_means_no_limit"),
};

import { getAdapterLabels } from "../adapters/adapter-display-registry";
import { t, useTranslation } from "@/i18n";

export const adapterLabels = getAdapterLabels();

export const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

/* ---- Primitive components ---- */

export function HintIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      {children}
    </div>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  toggleTestId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  toggleTestId?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      {/* Gallery feedback r3: was a hand-rolled h-5 w-9 pill with a bg-green-600
          track — the app's second switch implementation. Converged on the one
          canonical ToggleSwitch (status-green on-state), DESIGN.md principle 1. */}
      <ToggleSwitch
        data-testid={toggleTestId}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function ToggleWithNumber({
  label,
  hint,
  checked,
  onCheckedChange,
  number,
  onNumberChange,
  numberLabel,
  numberHint,
  numberPrefix,
  showNumber,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  number: number;
  onNumberChange: (v: number) => void;
  numberLabel: string;
  numberHint?: string;
  numberPrefix?: string;
  showNumber: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          {hint && <HintIcon text={hint} />}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
      {showNumber && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {numberPrefix && <span>{numberPrefix}</span>}
          <input
            type="number"
            className="w-16 rounded-md border border-border px-2 py-0.5 bg-transparent outline-none text-xs font-mono text-center"
            value={number}
            onChange={(e) => onNumberChange(Number(e.target.value))}
          />
          <span>{numberLabel}</span>
          {numberHint && <HintIcon text={numberHint} />}
        </div>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  bordered,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(bordered && "border-t border-border")}>
      <button
        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function AutoExpandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      style={{ minHeight }}
    />
  );
}

/**
 * Text input that manages internal draft state.
 * Calls `onCommit` on blur (and optionally on every change if `immediate` is set).
 */
export function DraftInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      {...props}
    />
  );
}

/**
 * Auto-expanding textarea with draft state and blur-commit.
 */
export function DraftTextarea({
  value,
  onCommit,
  immediate,
  placeholder,
  minRows,
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  placeholder?: string;
  minRows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [draft, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{ minHeight }}
    />
  );
}

/**
 * Number input with draft state and blur-commit.
 */
export function DraftNumberInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: number;
  onCommit: (v: number) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type">) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(Number(e.target.value) || 0);
      }}
      onBlur={() => {
        const num = Number(draft) || 0;
        if (num !== value) onCommit(num);
      }}
      {...props}
    />
  );
}

/**
 * "Choose" button that opens a dialog explaining the user must manually
 * type the path due to browser security limitations.
 */
export function ChoosePathButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0"
        onClick={() => setOpen(true)}
      >
        {t("choose")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("specify_path_manually")}</DialogTitle>
            <DialogDescription>
              {t("browser_security_blocks_apps_from_reading_full_l")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <p className="font-medium">{t("macos_finder")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("find_the_folder_in_finder")}</li>
                <li>{t("hold")} <kbd>{t("option")}</kbd> {t("and_right_click_the_folder")}</li>
                <li>{t("click_copy_folder_name_as_pathname")}</li>
                <li>{t("paste_the_result_into_the_path_input")}</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                /Users/yourname/Documents/project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">{t("windows_file_explorer")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("find_the_folder_in_file_explorer")}</li>
                <li>{t("hold")} <kbd>{t("shift")}</kbd> {t("and_right_click_the_folder")}</li>
                <li>{t("click_copy_as_path")}</li>
                <li>{t("paste_the_result_into_the_path_input")}</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                {t("c_users_yourname_documents_project")}
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">{t("terminal_fallback_macos_linux")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("run")} <code>{t("cd_path_to_folder")}</code>.</li>
                <li>{t("run")} <code>pwd</code>.</li>
                <li>{t("copy_the_output_and_paste_it_into_the_path_input")}</li>
              </ol>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Label + input rendered on the same line (inline layout for compact fields).
 */
export function InlineField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      <div className="w-24 ml-auto">{children}</div>
    </div>
  );
}
