/**
 * @fileoverview Classifies a failed skill mutation into the four visual states
 * from the Phase 3 UX spec (PAP-13865 / §9.10 Company Skill Policy Contract).
 *
 * The contract inverts the old model: **skill permissions are opt-in
 * restrictions, not opt-in capabilities.** Under the open default there is no
 * permission chrome at all — install / edit / update / test / reset / remove
 * are just live buttons. A denial notice only appears when an explicit company
 * policy (State B) or a non-configurable platform invariant (State C) actually
 * denied the action. Everything else (network, 409 conflict, 5xx) is a
 * transient error (State D) that keeps the existing toast path.
 *
 * This classifier is deliberately pure and framework-free so it can be unit
 * tested exhaustively without a DOM. `classifySkillDenial()` returns `null` for
 * State A (allowed / nothing to show) and State D (transient — let the caller
 * toast it); the UI renders a persistent banner only for B and C.
 */

import { ApiError } from "../api/client";
import { t } from "@/i18n";
import { translateDisplayMessage } from "@/i18n/display-message";

/** Machine-readable error codes the server attaches to skill mutation failures. */
export const SKILL_POLICY_DENIAL_CODE = "skill_policy_denied";

/**
 * Non-configurable platform-invariant failure codes (§9.10). Policy can never
 * loosen these — the remediation is always to fix the artifact/source/input,
 * never to change a permission.
 */
export const SKILL_PLATFORM_INVARIANT_CODES = [
  "skill_authentication_required",
  "skill_company_boundary_denied",
  "skill_workspace_boundary_denied",
  "skill_source_validation_failed",
  "skill_unsafe_content_blocked",
  "skill_secret_handling_blocked",
  "skill_actor_restricted",
] as const;

/**
 * Requires board-administration authority (`users:manage_permissions`). This is
 * a platform boundary — not something the current agent can self-serve — so we
 * treat it as State C but with admin-oriented remediation.
 */
export const SKILL_POLICY_ADMIN_CODE = "skill_policy_admin_required";

export type SkillDenialState = "policy" | "platform" | "platform_admin";

export interface SkillDenial {
  /** Which visual treatment applies. `policy` = State B, `platform*` = State C. */
  state: SkillDenialState;
  /** Machine-readable error code from the server, when present. */
  code: string | null;
  /** §9.10 decision `reason`, when the server surfaced the decision shape. */
  reason: string | null;
  /** Plain-language title for the banner. */
  title: string;
  /** Human remediation — never a curl/API-key snippet. */
  remediation: string;
}

const DEFAULT_POLICY_REMEDIATION =
  t("an_organization_administrator_can_change_the_ski");
const DEFAULT_ADMIN_REMEDIATION =
  t("this_requires_organization_administration_access");

/** Human-readable titles for the platform-invariant codes (State C). */
const PLATFORM_TITLES: Record<string, string> = {
  skill_authentication_required: t("sign_in_to_manage_skills"),
  skill_company_boundary_denied: t("this_skill_belongs_to_another_organization"),
  skill_workspace_boundary_denied: t("this_skill_source_is_outside_an_allowed_workspac"),
  skill_source_validation_failed: t("this_skill_source_failed_validation"),
  skill_unsafe_content_blocked: t("this_skill_contains_unsafe_content"),
  skill_secret_handling_blocked: t("this_skill_exposes_a_secret_value"),
  skill_actor_restricted: t("this_action_isnt_available_for_the_current_actor"),
};

/** Default remediation copy per platform-invariant code — framed as a fix, never a grant. */
const PLATFORM_REMEDIATIONS: Record<string, string> = {
  skill_authentication_required: t("sign_in_and_try_again"),
  skill_company_boundary_denied: t("open_the_skill_from_the_organization_that_owns_i"),
  skill_workspace_boundary_denied:
    t("import_from_a_configured_paperclip_workspace_or"),
  skill_source_validation_failed: t("fix_the_flagged_source_and_retry"),
  skill_unsafe_content_blocked:
    t("remove_the_fetch_and_execute_or_unsafe_pattern_b"),
  skill_secret_handling_blocked: t("remove_the_secret_value_before_saving"),
  skill_actor_restricted: t("retry_from_an_account_with_access_to_this_action"),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Turn a caller-supplied error into a denial descriptor, or `null` when there
 * is nothing to render as a persistent notice (State A allowed / State D
 * transient). The `actionLabel` (e.g. "Installing external skills") lets the
 * caller phrase State B's title around the specific action.
 */
export function classifySkillDenial(
  error: unknown,
  actionLabel?: string,
): SkillDenial | null {
  if (!(error instanceof ApiError)) return null;

  const body = asRecord(error.body);
  const code = asString(body?.code);
  const reason = asString(body?.reason);
  const remediation = asString(body?.remediation);
  const displayRemediation = remediation ? translateDisplayMessage(remediation) : null;

  // State B — explicit company-policy denial. Resolvable by an administrator.
  const isPolicyDenial =
    code === SKILL_POLICY_DENIAL_CODE
    || reason === "explicit_rule"
    || reason === "policy_default";
  if (isPolicyDenial) {
    const title = actionLabel
      ? t("zhSupport.policyRestricted", { action: actionLabel })
      : t("this_action_is_restricted_by_your_organization_p");
    return {
      state: "policy",
      code,
      reason,
      title,
      remediation: displayRemediation ?? DEFAULT_POLICY_REMEDIATION,
    };
  }

  // State C — policy administration boundary (needs users:manage_permissions).
  if (code === SKILL_POLICY_ADMIN_CODE) {
    return {
      state: "platform_admin",
      code,
      reason,
      title: t("this_change_needs_administration_access"),
      remediation: displayRemediation ?? DEFAULT_ADMIN_REMEDIATION,
    };
  }

  // State C — non-configurable platform-safety invariant. Never waivable.
  const isPlatformInvariant =
    (code !== null && (SKILL_PLATFORM_INVARIANT_CODES as readonly string[]).includes(code))
    || reason === "platform_invariant";
  if (isPlatformInvariant) {
    return {
      state: "platform",
      code,
      reason,
      title: (code && PLATFORM_TITLES[code]) ?? t("this_action_is_blocked_by_a_platform_safety_rule"),
      remediation:
        displayRemediation
        ?? (code && PLATFORM_REMEDIATIONS[code])
        ?? t("fix_the_flagged_issue_and_try_again"),
    };
  }

  // State D — transient (network / 409 conflict / 5xx / uncoded 4xx). Let the
  // caller keep the existing retry toast; do not render a policy banner.
  return null;
}
