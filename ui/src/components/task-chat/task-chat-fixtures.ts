/**
 * Synthetic fixtures for the Task Chat Redesign dev harness. No live agent is
 * required: every state in the inventory maps to a deterministic scenario the
 * harness renders and the finish-line test iterates. Tier-B states are driven
 * entirely from here (live protocol wiring is a flagged dependency).
 */
import type { TaskChatItem, TaskChatPlan } from "./task-chat-model";
import type { TaskChatStateId } from "./task-chat-states";
import { t } from "@/i18n";

export interface TaskChatScenario {
  surface: "thread" | "plan";
  items: TaskChatItem[];
  plan?: TaskChatPlan;
}

const AGENT = t("atlas");

/** A short human→agent exchange used as context in several scenarios. */
function exchangePrefix(): TaskChatItem[] {
  return [
    { id: "m-user-1", kind: "message", author: "human", text: t("add_a_rate_limiter_to_the_login_route"), timestamp: t("2_31_pm") },
  ];
}

const SAMPLE_PLAN: TaskChatPlan = {
  revision: 2,
  updatedAt: t("2_33_pm"),
  entries: [
    { id: "p1", content: t("read_the_login_route_and_existing_middleware"), status: "completed", priority: "medium" },
    { id: "p2", content: t("add_a_token_bucket_rate_limiter_util"), status: "in_progress", priority: "high" },
    { id: "p3", content: t("wire_the_limiter_into_post_login"), status: "pending", priority: "high" },
    { id: "p4", content: t("add_tests_for_the_limit_reset_window"), status: "pending", priority: "low" },
  ],
};

export function buildScenario(id: TaskChatStateId): TaskChatScenario {
  switch (id) {
    case "session-start":
      return {
        surface: "thread",
        items: [
          { id: "mk-start", kind: "marker", variant: "session_start", label: t("session_started"), detail: t("claude_auto_mode") },
          ...exchangePrefix(),
        ],
      };
    case "human-message":
      return { surface: "thread", items: exchangePrefix() };
    case "agent-message":
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          { id: "m-agent-1", kind: "message", author: "agent", authorName: AGENT, agentIcon: "bot", text: t("on_it_ill_add_a_token_bucket_limiter_and_wire_it"), timestamp: t("2_31_pm") },
        ],
      };
    case "thinking":
      // The surviving thinking signal (PAP-361): the live line's "Thinking…"
      // state — Brain icon + shimmer on the pill. Thinking rows no longer
      // render in the thread or nest under turns.
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          {
            id: "turn-thinking",
            kind: "turn",
            settled: false,
            summary: { toolCount: 1, added: 0, removed: 0 },
            liveStatus: { id: "st-thinking", kind: "status", status: "running", label: t("thinking_d08d8d"), startedAtMs: Date.now() - 6100, tokens: { used: 18240, size: 200000 } },
            items: [
              { id: "th-grep", kind: "tool", name: t("grep"), target: "rateLimit", toolKind: "search", status: "completed" },
            ],
          },
        ],
      };
    case "responding":
      // A streaming interstitial update gets its own row directly above the
      // status line (PAP-361, amended): it wraps into the 1lh viewport
      // line-scroll while the gerund rotation below runs uninterrupted.
      // Ephemeral — when it finishes, the row slides out and the text renders
      // nowhere.
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          {
            id: "turn-responding",
            kind: "turn",
            settled: false,
            summary: { toolCount: 1, added: 0, removed: 0 },
            liveStatus: {
              id: "st-responding", kind: "status", status: "running", label: t("responding"), startedAtMs: Date.now() - 9300, tokens: { used: 18240, size: 200000 },
              selfTalk:
                t("i_found_an_existing_ipratelimit_helper_so_ill_ex"),
            },
            items: [
              { id: "resp-read", kind: "tool", name: t("read"), target: "server/src/routes/auth.ts", toolKind: "read", status: "completed" },
            ],
          },
        ],
      };
    case "responding-burst":
      // A run emitting several interstitial updates in quick succession
      // (PAP-368): the lab replay streams each blank-line-separated segment as
      // its own update with a short gap between. The pill HOLDS each finished
      // update until the next swaps in, paced by --motion-interstitial-dwell
      // (latest-wins when updates outpace the dwell).
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          {
            id: "turn-responding-burst",
            kind: "turn",
            settled: false,
            summary: { toolCount: 2, added: 0, removed: 0 },
            liveStatus: {
              id: "st-responding-burst", kind: "status", status: "running", label: t("responding"), startedAtMs: Date.now() - 21400, tokens: { used: 18240, size: 200000 },
              selfTalk:
                t("found_the_existing_ipratelimit_helper_extending") +
                t("wiring_a_per_account_token_bucket_keyed_on_the_e") +
                t("failed_attempts_drain_the_bucket_twice_as_fast_s") +
                t("now_updating_the_login_route_to_consume_from_the"),
            },
            items: [
              { id: "burst-read", kind: "tool", name: t("read"), target: "server/src/routes/auth.ts", toolKind: "read", status: "completed" },
              { id: "burst-grep", kind: "tool", name: t("grep"), target: "ipRateLimit", toolKind: "search", status: "completed" },
            ],
          },
        ],
      };
    case "tool-call":
      return {
        surface: "thread",
        items: [
          { id: "tool-1", kind: "tool", name: t("read"), target: "server/src/routes/auth.ts", toolKind: "read", status: "in_progress" },
        ],
      };
    case "diff":
      return {
        surface: "thread",
        items: [
          {
            id: "tool-diff", kind: "tool", name: t("edit"), target: "server/src/routes/auth.ts", toolKind: "edit", status: "completed", decision: "allowed",
            diff: {
              path: "server/src/routes/auth.ts", added: 3, removed: 1,
              lines: [
                { kind: "context", text: t("router_post_login_async_req_res") },
                { kind: "remove", text: t("const_ok_await_checkpassword_req_body") },
                { kind: "add", text: t("await_ratelimiter_consume_req_body_email") },
                { kind: "add", text: t("const_ok_await_checkpassword_req_body") },
                { kind: "add", text: t("if_ok_return_res_status_401_end") },
              ],
            },
          },
        ],
      };
    case "working":
      // Parent-row live turn (PAP-354): the tool-state line owns the activity;
      // expanding nests the chronological history underneath.
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          {
            id: "turn-working",
            kind: "turn",
            settled: false,
            summary: { toolCount: 2, added: 0, removed: 0 },
            liveStatus: { id: "st-working", kind: "status", status: "working", label: t("editing_files"), detail: t("edit_server_src_routes_auth_ts"), toolName: t("edit"), startedAtMs: Date.now() - 4200 },
            items: [
              { id: "w-read", kind: "tool", name: t("read"), target: "server/src/routes/auth.ts", toolKind: "read", status: "completed" },
              { id: "w-edit", kind: "tool", name: t("edit"), target: "server/src/routes/auth.ts", toolKind: "edit", status: "in_progress" },
            ],
          },
        ],
      };
    case "running":
      // Generic label → the parent row header rotates whimsical gerunds.
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          {
            id: "turn-running",
            kind: "turn",
            settled: false,
            summary: { toolCount: 1, added: 0, removed: 0 },
            liveStatus: { id: "st-running", kind: "status", status: "running", label: t("running"), detail: t("no_output_for_3s_still_running"), startedAtMs: Date.now() - 12000, tokens: { used: 18240, size: 200000 } },
            items: [
              { id: "r-grep", kind: "tool", name: t("grep"), target: "rateLimit", toolKind: "search", status: "completed" },
            ],
          },
        ],
      };
    case "completed":
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          // Round 9: the settled turn attaches to the final reply bubble — the
          // "✓ Worked · …" summary renders on the bubble's always-visible
          // timestamp line ("2:34 PM · ✓ Worked · 38s · 2 tools").
          {
            id: "m-done",
            kind: "message",
            author: "agent",
            authorName: AGENT,
            agentIcon: "bot",
            text: t("done_added_a_per_account_token_bucket_limiter_an"),
            timestamp: t("2_34_pm"),
            attachedTurn: {
              id: "turn-done",
              kind: "turn",
              settled: true,
              // "Worked · N tools" expands to exactly the tool rows (PAP-361):
              // toolCount matches the nested rows, no thinking row.
              summary: { durationLabel: "38s", toolCount: 2, added: 34, removed: 3, tokensLabel: t("12_3k_tokens") },
              items: [
                { id: "tool-done-1", kind: "tool", name: t("read"), target: "server/src/routes/auth.ts", toolKind: "read", status: "completed" },
                { id: "tool-done-2", kind: "tool", name: t("edit"), target: "server/src/routes/auth.ts", toolKind: "edit", status: "completed", diff: { path: "server/src/routes/auth.ts", added: 34, removed: 3 } },
              ],
            },
          },
        ],
      };
    case "awaiting-approval":
      return {
        surface: "thread",
        items: [
          {
            id: "st-approval", kind: "status", status: "awaiting_approval", label: t("approve_running_a_command"),
            detail: t("npm_run_migrate_modifies_the_database"),
            approval: {
              toolName: "execute",
              options: [
                { id: "reject", label: t("deny"), kind: "reject_once" },
                { id: "allow-always", label: t("always_allow"), kind: "allow_always" },
                { id: "allow", label: t("allow_once"), kind: "allow_once" },
              ],
            },
          },
        ],
      };
    case "activity-phases": {
      const phase = (id: string, text: string | undefined, active: boolean, tools: TaskChatItem[]) => ({
        id,
        kind: "activity_phase" as const,
        active,
        interstitial: text ? { id: `${id}:message`, kind: "message" as const, author: "agent" as const, authorName: AGENT, text, interstitial: true } : undefined,
        items: tools.filter((item): item is Extract<TaskChatItem, { kind: "tool" | "usage" }> => item.kind === "tool" || item.kind === "usage"),
        summary: active ? t("ran_1_command_called_1_tool") : id.endsWith("opening") ? t("called_2_tools") : t("read_3_files_edited_1_file"),
      });
      return {
        surface: "thread",
        items: [
          ...exchangePrefix(),
          {
            id: "turn-long-run", kind: "turn", settled: false,
            summary: { toolCount: 8, added: 4, removed: 1 },
            liveStatus: { id: "long-status", kind: "status", status: "working", label: t("running_tests"), detail: t("bash_vitest"), toolName: t("bash"), startedAtMs: Date.now() - 48_000 },
            items: [
              phase("phase-opening", undefined, false, [
                { id: "generic-1", kind: "tool", name: t("tool"), rawName: t("tool_call"), status: "completed" },
                { id: "generic-2", kind: "tool", name: t("tool"), rawName: "acp_tool", status: "failed", detail: t("adapter_interrupted") },
              ]),
              phase("phase-read", t("i_found_the_relevant_adapter_and_am_tracing_its"), false, [
                { id: "read-1", kind: "tool", name: t("read"), status: "completed", target: "ui/src/components/task-chat/transcript-adapter.ts" },
                { id: "read-2", kind: "tool", name: t("read"), status: "completed", target: "ui/src/components/task-chat/TaskChatTurn.tsx" },
                { id: "read-3", kind: "tool", name: t("read"), status: "completed", target: "ui/src/components/task-chat/TaskChatThreadView.tsx" },
                { id: "edit-1", kind: "tool", name: t("edit"), status: "completed", target: "ui/src/components/task-chat/task-chat-model.ts" },
              ]),
              phase("phase-active", t("the_grouping_is_wired_i_m_running_focused_checks"), true, [
                { id: "bash-1", kind: "tool", name: t("bash"), status: "in_progress", target: "vitest task-chat" },
                { id: "mcp-1", kind: "tool", name: t("search"), rawName: "mcp__docs__search", status: "completed" },
              ]),
            ],
          },
        ],
      };
    }
    case "plan-todo":
      return { surface: "plan", items: [], plan: SAMPLE_PLAN };
    case "interrupted":
      return {
        surface: "thread",
        items: [
          { id: "m-int", kind: "message", author: "agent", authorName: AGENT, text: t("starting_the_migration_now") },
          { id: "mk-int", kind: "marker", variant: "interrupted", label: t("interrupted"), detail: t("stopped_by_you_at_2_35_pm") },
        ],
      };
    case "refused":
      return {
        surface: "thread",
        items: [
          { id: "st-refused", kind: "status", status: "refused", label: t("turn_ended_refusal"), detail: t("the_agent_declined_to_complete_this_request") },
        ],
      };
    case "truncated":
      return {
        surface: "thread",
        items: [
          { id: "st-trunc", kind: "status", status: "truncated", label: t("turn_ended_max_tokens"), detail: t("output_was_cut_off_continue_to_resume"), tokens: { used: 199120, size: 200000 } },
        ],
      };
    case "live-token-cost":
      return {
        surface: "thread",
        items: [
          { id: "usage-1", kind: "usage", usage: { used: 42800, size: 200000, inputTokens: 38200, outputTokens: 4600, costUsd: 0.1284 } },
        ],
      };
    default: {
      const _never: never = id;
      return _never;
    }
  }
}
