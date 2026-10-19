
import { t } from "@/i18n";/**
 * Canonical state inventory for the chat-style task thread (the default task
 * view; the classic legacy view sits behind enableClassicTaskInterface).
 *
 * This list is the single source of truth for:
 *   - the dev harness state switcher (/dev/task-chat-lab), and
 *   - the finish-line test that asserts every state renders without error.
 *
 * Each id traces to a real agent-protocol state (plan Deliverable 1). `tier`
 * marks whether the state already streams live ("live") or is emitted upstream
 * but dropped by acpx today ("tier-b", driven by synthetic events in the
 * harness, live wiring flagged). `surface` says where the state renders.
 */

export const TASK_CHAT_STATES = [
  "session-start",
  "human-message",
  "agent-message",
  "thinking",
  "responding",
  "responding-burst",
  "tool-call",
  "diff",
  "working",
  "running",
  "completed",
  "activity-phases",
  "awaiting-approval",
  "plan-todo",
  "interrupted",
  "refused",
  "truncated",
  "live-token-cost",
] as const;

export type TaskChatStateId = (typeof TASK_CHAT_STATES)[number];

export type TaskChatStateTier = "live" | "tier-b";
export type TaskChatStateSurface = "thread" | "plan";

export interface TaskChatStateMeta {
  id: TaskChatStateId;
  label: string;
  tier: TaskChatStateTier;
  surface: TaskChatStateSurface;
  /** Real protocol source, quoted for the harness inspector. */
  protocol: string;
}

export const TASK_CHAT_STATE_META: Record<TaskChatStateId, TaskChatStateMeta> = {
  "session-start": {
    id: "session-start",
    label: t("session_start"),
    tier: "live",
    surface: "thread",
    protocol: t("acpx_session_transcriptentry_kind_init"),
  },
  "human-message": {
    id: "human-message",
    label: t("human_message"),
    tier: "live",
    surface: "thread",
    protocol: t("issuecomment_authortype_user"),
  },
  "agent-message": {
    id: "agent-message",
    label: t("final_response"),
    tier: "live",
    surface: "thread",
    protocol: t("prp_item_delta_kind_agentmessage_channel_final"),
  },
  thinking: {
    id: "thinking",
    label: t("thinking_d08d8d"),
    tier: "live",
    surface: "thread",
    protocol: t("text_delta_stream_thought_acp_agent_thought_chun"),
  },
  responding: {
    id: "responding",
    label: t("progress_update_streaming"),
    tier: "live",
    surface: "thread",
    protocol: t("prp_item_delta_kind_agentmessage_channel_progres"),
  },
  "responding-burst": {
    id: "responding-burst",
    label: t("progress_update_burst"),
    tier: "live",
    surface: "thread",
    protocol: t("text_delta_stream_output_n_tool_calls_between_pa"),
  },
  "tool-call": {
    id: "tool-call",
    label: t("tool_call_e31318"),
    tier: "live",
    surface: "thread",
    protocol: t("acpx_tool_call_acp_tool_call_tool_call_update"),
  },
  diff: {
    id: "diff",
    label: t("diff_d23a1c"),
    tier: "live",
    surface: "thread",
    protocol: t("toolcallcontent_type_diff_transcriptentry_kind_d"),
  },
  working: {
    id: "working",
    label: t("working_3b4dfc"),
    tier: "live",
    surface: "thread",
    protocol: t("heartbeat_run_progress_acpx_status"),
  },
  running: {
    id: "running",
    label: t("running"),
    tier: "live",
    surface: "thread",
    protocol: t("message_status_type_running"),
  },
  completed: {
    id: "completed",
    label: t("completed_collapsed"),
    tier: "live",
    surface: "thread",
    protocol: t("acpx_result_stopreason_in_subtype"),
  },
  "activity-phases": {
    id: "activity-phases",
    label: t("long_run_activity_phases"),
    tier: "live",
    surface: "thread",
    protocol: t("assistant_boundaries_chronological_tool_calls"),
  },
  "awaiting-approval": {
    id: "awaiting-approval",
    label: t("awaiting_approval"),
    tier: "tier-b",
    surface: "thread",
    protocol: t("acp_requestpermissionrequest_permissionoptionkin"),
  },
  "plan-todo": {
    id: "plan-todo",
    label: t("plan_todo"),
    tier: "tier-b",
    surface: "plan",
    protocol: t("acp_plan_entries_planentry_planentrystatus"),
  },
  interrupted: {
    id: "interrupted",
    label: t("interrupted"),
    tier: "tier-b",
    surface: "thread",
    protocol: t("acpruntimeturnresult_status_cancelled_stopreason"),
  },
  refused: {
    id: "refused",
    label: t("refused"),
    tier: "tier-b",
    surface: "thread",
    protocol: t("stopreason_refusal"),
  },
  truncated: {
    id: "truncated",
    label: t("truncated"),
    tier: "tier-b",
    surface: "thread",
    protocol: t("stopreason_max_tokens_max_turn_requests"),
  },
  "live-token-cost": {
    id: "live-token-cost",
    label: t("live_token_cost"),
    tier: "tier-b",
    surface: "thread",
    protocol: t("acp_usageupdate_used_size_cost"),
  },
};

export const TASK_CHAT_STATE_LIST: TaskChatStateMeta[] = TASK_CHAT_STATES.map(
  (id) => TASK_CHAT_STATE_META[id],
);
