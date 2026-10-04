
import { t } from "@/i18n";/**
 * Exhaustive product disposition for Paperclip Runner Protocol surfaces.
 *
 * This is intentionally separate from the renderer: adding a protocol event
 * must be a conscious product decision even when the decision is to fold it
 * into an existing turn or keep it in DevTools. The contract test compares
 * these keys with the canonical JSON schemas.
 */
export type TaskProtocolDisposition = "inline" | "folded" | "debug-only";

export interface TaskProtocolSurfaceRegistration {
  disposition: TaskProtocolDisposition;
  surface: string;
  story: string | null;
  rationale: string;
}

const inline = (surface: string, story: string, rationale: string): TaskProtocolSurfaceRegistration => ({
  disposition: "inline",
  surface,
  story,
  rationale,
});

const folded = (surface: string, rationale: string): TaskProtocolSurfaceRegistration => ({
  disposition: "folded",
  surface,
  story: null,
  rationale,
});

const debugOnly = (surface: string, rationale: string): TaskProtocolSurfaceRegistration => ({
  disposition: "debug-only",
  surface,
  story: null,
  rationale,
});

const providerEvents = [
  "plan.updated",
  "tool.execution.started", "tool.execution.progressed", "tool.execution.completed",
  "research.started", "research.progressed", "research.completed",
  "delegation.started", "delegation.updated", "delegation.completed",
  "model.route.changed", "model.verification.updated", "context.compacted",
  "artifact.viewed", "artifact.generated", "review.mode.changed",
  "hook.started", "hook.completed", "memory.citation.referenced",
  "safety.review.started", "safety.review.completed", "terminal.input.sent",
  "wait.started", "wait.completed", "provider.notice.recorded",
] as const;

const runnerLifecycleEvents = [
  "runner.connected", "runner.reconnected", "runner.reconciled", "runner.disconnected",
  "runner.draining", "runner.backpressure", "runner.suspending", "runner.suspended", "runner.stopped",
  "runtime.phase.changed", "workspace.ready",
  "harness.starting", "harness.ready", "harness.exited",
  "session.starting", "session.started", "session.resuming", "session.resumed",
  "session.reconciled", "session.updated", "session.closed",
  "turn.submitted", "turn.accepted", "turn.started", "turn.completed",
  "run.attached", "run.detached",
] as const;

const diagnosticEvents = [
  "runner.diagnostic", "harness.diagnostic", "session.failed", "turn.failed",
  "turn.interrupted", "turn.cancelled", "item.failed",
] as const;

const itemEvents = ["item.started", "item.delta", "item.completed", "usage.reported"] as const;

const mcpLifecycleEvents = [
  "mcp_app.discovered", "mcp_app.resource.resolved", "mcp_app.initializing", "mcp_app.ready",
  "mcp_app.host_context.changed", "mcp_app.failed", "mcp_app.teardown",
] as const;

const interactionLifecycleEvents = [
  "interaction.request.proposed", "interaction.request.materialized", "interaction.request.rejected",
  "interaction.response.progressed", "interaction.response.resolved", "interaction.response.delivered",
] as const;

const governanceEvents = [
  "attention.request.proposed", "attention.request.routed", "attention.request.resolved",
  "attention.request.expired", "attention.request.superseded", "work.assessment.recorded",
  "issue.status.decision.recorded", "issue.status.decision.applied", "issue.status.decision.rejected",
  "issue.status.decision.superseded",
] as const;

export const TASK_PROTOCOL_EVENT_SURFACE_REGISTRY: Readonly<Record<string, TaskProtocolSurfaceRegistration>> = Object.freeze({
  ...Object.fromEntries(providerEvents.map((eventType) => [eventType, inline("provider_activity", t("task_page_runner_protocol_provider_semantics"), t("provider_neutral_semantic_activity_is_readable_i"))])),
  "workspace.change.updated": inline("workspace_change", t("task_page_runner_protocol_workspace_changes"), t("in_progress_workspace_changes_update_one_diff_ca")),
  "workspace.diff.recorded": inline("workspace_change", t("task_page_runner_protocol_workspace_changes"), t("the_runner_verified_final_diff_replaces_the_in_p")),
  "workspace.file.referenced": inline("workspace_file", t("task_page_runner_protocol_file_references"), t("verified_references_open_a_bounded_preview_and_t")),
  "semantic_tool.input": folded("tool", t("semantic_operations_reuse_the_production_tool_ro")),
  "semantic_tool.result": folded("tool", t("semantic_operation_outcomes_update_the_matching")),
  "semantic_tool.reconciled": folded("tool", t("recovered_semantic_operation_outcomes_update_the")),
  "mcp_app.tool_input": folded("tool", t("mcp_inputs_reuse_the_production_tool_row")),
  "mcp_app.tool_result": folded("tool", t("mcp_outcomes_update_the_matching_tool_row")),
  "mcp_app.action.requested": folded("interaction", t("action_requests_materialize_as_authoritative_iss")),
  "mcp_app.action.resolved": folded("interaction", t("action_resolution_is_shown_on_the_authoritative")),
  "runtime_request.created": inline("runtime_request", t("task_page_runner_protocol_runtime_requests"), t("pending_provider_runtime_requests_remain_visible")),
  "runtime_request.resolved": folded("runtime_request", t("resolution_updates_the_existing_request_card")),
  "runtime_request.expired": folded("runtime_request", t("expiry_updates_the_existing_request_card")),
  "runtime_request.cancelled": folded("runtime_request", t("cancellation_updates_the_existing_request_card")),
  ...Object.fromEntries(interactionLifecycleEvents.map((eventType) => [eventType, folded("interaction", t("the_control_plane_interaction_record_is_canonica") )])),
  "run.result.proposed": inline("run_result", t("task_page_runner_protocol_results_and_terminal_s"), t("structured_completion_evidence_verification_bloc")),
  "run.result.accepted": folded("run_result", t("acceptance_updates_the_existing_result_without_d")),
  "run.result.rejected": folded("run_result", t("rejected_results_remain_part_of_run_governance_r")),
  "run.terminal": inline("run_terminal", t("task_page_runner_protocol_results_and_terminal_s"), t("terminal_outcome_and_stop_reason_remain_visible")),
  ...Object.fromEntries(runnerLifecycleEvents.map((eventType) => [eventType, folded("turn", t("routine_lifecycle_transitions_are_summarized_by"))])),
  ...Object.fromEntries(diagnosticEvents.map((eventType) => [eventType, folded("system_notice", t("actionable_failure_text_is_folded_into_the_run_o"))])),
  ...Object.fromEntries(itemEvents.map((eventType) => [eventType, folded("conversation_or_tool", t("item_payloads_normalize_into_messages_reasoning") )])),
  "sandbox.metric": debugOnly("run_debug", t("sandbox_telemetry_is_available_in_run_details_no")),
  ...Object.fromEntries(mcpLifecycleEvents.map((eventType) => [eventType, debugOnly("run_debug", t("mcp_application_transport_lifecycle_remains_in_r"))])),
  ...Object.fromEntries(governanceEvents.map((eventType) => [eventType, folded("governance", t("authoritative_task_status_attention_and_interact") )])),
});

export const TASK_PROTOCOL_REQUEST_SURFACE_REGISTRY = Object.freeze({
  "runtime.permission": inline("runtime_request", t("task_page_runner_protocol_runtime_requests"), t("permission_choices_render_on_the_runtime_request")),
  "runtime.input": inline("runtime_request", t("task_page_runner_protocol_runtime_requests"), t("structured_runtime_input_renders_on_the_runtime")),
  "issue_thread.request_confirmation": inline("interaction", t("task_page_runner_protocol_interactions"), t("uses_the_production_confirmation_card")),
  "issue_thread.request_checkbox_confirmation": inline("interaction", t("task_page_runner_protocol_interactions"), t("uses_the_production_bounded_checkbox_card")),
  "issue_thread.request_item_verdicts": inline("interaction", t("task_page_runner_protocol_interactions"), t("uses_the_production_per_item_verdict_card")),
  "issue_thread.ask_user_questions": inline("interaction", t("task_page_runner_protocol_interactions"), t("uses_the_production_typed_question_controls")),
  "issue_thread.suggest_tasks": inline("interaction", t("task_page_runner_protocol_interactions"), t("uses_the_production_task_suggestion_tree")),
});

export const TASK_PROTOCOL_RESULT_DISPOSITION_REGISTRY = Object.freeze({
  done: "run_result",
  blocked: "run_result",
  needs_review: "run_result",
  yielded: "run_result",
} as const);

export const TASK_PROTOCOL_TURN_TERMINAL_REGISTRY = Object.freeze({
  completed: "run_terminal",
  failed: "run_terminal",
  interrupted: "run_terminal",
  cancelled: "run_terminal",
} as const);

export const TASK_PROTOCOL_RUN_TERMINAL_REGISTRY = Object.freeze({
  succeeded: "run_terminal",
  failed: "run_terminal",
  cancelled: "run_terminal",
} as const);
