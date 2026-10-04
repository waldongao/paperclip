import type { Agent } from "@paperclipai/shared";
import type { CompanyUserProfile } from "./company-members";
import { formatReviewPolicyValue } from "./review-policy";
import { t } from "@/i18n";

type ActivityDetails = Record<string, unknown> | null | undefined;

type ActivityParticipant = {
  type: "agent" | "user";
  agentId?: string | null;
  userId?: string | null;
};

type ActivityIssueReference = {
  id?: string | null;
  identifier?: string | null;
  title?: string | null;
};

interface ActivityFormatOptions {
  agentMap?: Map<string, Agent>;
  userProfileMap?: Map<string, CompanyUserProfile>;
  currentUserId?: string | null;
}

/**
 * Backend ids reach the feed raw: an action like `environment.lease_released`, a
 * status like `in_progress`. They used to be printed as humanized English
 * ("environment lease released"), so the feed stayed English in every language
 * except for the slice of actions that had a hand-written entry in this file.
 * Every id now resolves through the `activityLog.*` namespace — keyed by the id
 * with its dots flattened — and keeps the humanized English as the per-key
 * default, so an action no locale covers yet still reads the way it always did.
 */
function humanizeId(id: string): string {
  return id.replace(/[._]/g, " ");
}

function translateId(group: "verb" | "label" | "status" | "priority", id: string): string {
  return t(`activityLog.${group}.${id.replace(/\./g, "_")}`, { defaultValue: humanizeId(id) });
}

/**
 * A feed row reads `<actor> <verb> <entity>`, so a verb built out of an outcome
 * label has to carry the relationship to the entity that follows it. English
 * appends "on"; other languages place the entity elsewhere in the clause.
 */
function verbOnEntity(label: string): string {
  return t("activityLog.verbOnEntity", { label });
}

/**
 * `issue.stalled_review_decided` carries the verb the actor chose, so the line
 * names the verdict ("approved the review") rather than the generic action.
 * Mirrors `StalledReviewDecisionAction` in shared.
 */
const STALLED_REVIEW_DECISION_LABELS: Record<string, string> = {
  approve: t("approved_the_review"),
  request_changes: t("requested_changes_on_the_review"),
  send_back: t("sent_the_review_back_to_work"),
};

/**
 * `issue.thread_interaction_accepted` / `_rejected` fire for *every* interaction
 * kind, not only for a review. A task suggestion or a question is accepted, not
 * approved, so the kind on the event picks the verb. Kinds absent from a map
 * keep the neutral "accepted the request" wording from `activityLog.label.*`, which
 * is also the fallback for an event that carries no kind.
 */
const INTERACTION_ACCEPTED_LABELS: Record<string, string> = {
  request_confirmation: t("approved_the_request"),
  request_checkbox_confirmation: t("approved_the_request"),
  suggest_tasks: t("accepted_the_task_suggestions"),
  ask_user_questions: t("accepted_the_answers"),
};

const INTERACTION_REJECTED_LABELS: Record<string, string> = {
  request_confirmation: t("rejected_the_request"),
  request_checkbox_confirmation: t("rejected_the_request"),
  suggest_tasks: t("declined_the_task_suggestions"),
  ask_user_questions: t("declined_the_questions"),
};

/**
 * Kind-aware wording for an interaction outcome, or `null` when the tables
 * above already say it well enough.
 */
function formatInteractionOutcomeLabel(action: string, details: ActivityDetails): string | null {
  const table = action === "issue.thread_interaction_accepted"
    ? INTERACTION_ACCEPTED_LABELS
    : action === "issue.thread_interaction_rejected"
      ? INTERACTION_REJECTED_LABELS
      : null;
  if (!table) return null;
  const kind = typeof details?.interactionKind === "string" ? details.interactionKind : null;
  return kind ? table[kind] ?? null : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatEnumValue(group: "status" | "priority", value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return translateId(group, value);
}

function isActivityParticipant(value: unknown): value is ActivityParticipant {
  const record = asRecord(value);
  if (!record) return false;
  return record.type === "agent" || record.type === "user";
}

function isActivityIssueReference(value: unknown): value is ActivityIssueReference {
  return asRecord(value) !== null;
}

function readParticipants(details: ActivityDetails, key: string): ActivityParticipant[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityParticipant);
}

function readIssueReferences(details: ActivityDetails, key: string): ActivityIssueReference[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityIssueReference);
}

function formatUserLabel(userId: string | null | undefined, options: ActivityFormatOptions = {}): string {
  if (!userId || userId === "local-board") return t("board");
  if (options.currentUserId && userId === options.currentUserId) return t("you");
  const profile = options.userProfileMap?.get(userId);
  if (profile) return profile.label;
  return t("activityLog.unnamedUser", { id: userId.slice(0, 5) });
}

function formatParticipantLabel(participant: ActivityParticipant, options: ActivityFormatOptions): string {
  if (participant.type === "agent") {
    const agentId = participant.agentId ?? "";
    return options.agentMap?.get(agentId)?.name ?? t("activityLog.unnamedAgent");
  }
  return formatUserLabel(participant.userId, options);
}

function formatIssueReferenceLabel(reference: ActivityIssueReference): string {
  if (reference.identifier) return reference.identifier;
  if (reference.title) return reference.title;
  if (reference.id) return reference.id.slice(0, 8);
  return t("activityLog.unnamedTask");
}

type ChangedEntityKind = "blocker" | "reviewer" | "approver";

function formatChangedEntityLabel(kind: ChangedEntityKind, labels: string[]): string {
  if (labels.length <= 0) return t(`activityLog.entity.${kind}.plural`);
  if (labels.length === 1) return t(`activityLog.entity.${kind}.one`, { label: labels[0] });
  return t(`activityLog.entity.${kind}.many`, { n: labels.length });
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readStringArrayLength(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => typeof entry === "string" && entry.length > 0).length;
}

function joinActivityParts(parts: string[]): string {
  return parts.join(t("activityLog.listSeparator"));
}

function formatAcceptedPlanDecompositionDetail(details: ActivityDetails): string | null {
  if (!details) return null;
  const status = typeof details.status === "string" ? details.status : null;
  const requested = readNumber(details.requestedChildCount);
  const totalChildren = readStringArrayLength(details.childIssueIds);
  const newlyCreated = readStringArrayLength(details.newlyCreatedChildIssueIds);
  const reused = Math.max(0, totalChildren - newlyCreated);
  const parts: string[] = [];
  if (newlyCreated > 0) parts.push(t("activityLog.decomposition.createdNew", { n: newlyCreated }));
  if (reused > 0) parts.push(t("activityLog.decomposition.reusedExisting", { n: reused }));
  if (parts.length === 0 && requested !== null) parts.push(t("activityLog.decomposition.requested", { n: requested }));
  const summary = parts.length > 0 ? joinActivityParts(parts) : null;
  if (status === "completed" && summary) return t("activityLog.decomposition.completedWithSummary", { summary });
  if (status === "completed") return t("activityLog.decomposition.completed");
  if (status === "in_flight" && summary) return t("activityLog.decomposition.inFlightWithSummary", { summary });
  return summary;
}

function formatIssueUpdatedVerb(details: ActivityDetails): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  if (details.status !== undefined) {
    const from = previous.status;
    const to = formatEnumValue("status", details.status);
    return from
      ? t("activityLog.issueUpdated.statusFromToOn", { from: formatEnumValue("status", from), to })
      : t("activityLog.issueUpdated.statusToOn", { to });
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    const to = formatEnumValue("priority", details.priority);
    return from
      ? t("activityLog.issueUpdated.priorityFromToOn", { from: formatEnumValue("priority", from), to })
      : t("activityLog.issueUpdated.priorityToOn", { to });
  }
  return null;
}

function formatAssigneeName(details: ActivityDetails, options: ActivityFormatOptions): string | null {
  if (!details) return null;
  const agentId = details.assigneeAgentId;
  const userId = details.assigneeUserId;
  if (typeof agentId === "string" && agentId) {
    return options.agentMap?.get(agentId)?.name ?? t("activityLog.unnamedAgent");
  }
  if (typeof userId === "string" && userId) {
    return formatUserLabel(userId, options);
  }
  return null;
}

function formatIssueUpdatedAction(details: ActivityDetails, options: ActivityFormatOptions = {}): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  const parts: string[] = [];

  if (details.status !== undefined) {
    const from = previous.status;
    const to = formatEnumValue("status", details.status);
    parts.push(
      from
        ? t("activityLog.issueUpdated.statusFromTo", { from: formatEnumValue("status", from), to })
        : t("activityLog.issueUpdated.statusTo", { to }),
    );
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    const to = formatEnumValue("priority", details.priority);
    parts.push(
      from
        ? t("activityLog.issueUpdated.priorityFromTo", { from: formatEnumValue("priority", from), to })
        : t("activityLog.issueUpdated.priorityTo", { to }),
    );
  }
  if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
    const assigneeName = formatAssigneeName(details, options);
    parts.push(assigneeName ? t("activityLog.issueUpdated.responsible", { name: assigneeName }) : t("cleared_the_responsible"));
  }
  if (details.reviewPolicy !== undefined) {
    // `null` is the default ("anyone can approve"), so it must not read as
    // "changed the review policy to none" (PAP-16506).
    parts.push(t("activityLog.issueUpdated.reviewPolicy", { policy: formatReviewPolicyValue(details.reviewPolicy) }));
  }
  if (details.title !== undefined) parts.push(t("updated_the_title"));
  if (details.description !== undefined) parts.push(t("updated_the_description"));

  return parts.length > 0 ? joinActivityParts(parts) : null;
}

function formatStructuredIssueChange(input: {
  action: string;
  details: ActivityDetails;
  options: ActivityFormatOptions;
  forIssueDetail: boolean;
}): string | null {
  const details = input.details;
  if (!details) return null;

  const kind: ChangedEntityKind | null =
    input.action === "issue.blockers_updated" ? "blocker"
      : input.action === "issue.reviewers_updated" ? "reviewer"
        : input.action === "issue.approvers_updated" ? "approver"
          : null;
  if (!kind) return null;

  const [added, removed] = kind === "blocker"
    ? [
        readIssueReferences(details, "addedBlockedByIssues").map(formatIssueReferenceLabel),
        readIssueReferences(details, "removedBlockedByIssues").map(formatIssueReferenceLabel),
      ]
    : [
        readParticipants(details, "addedParticipants").map((participant) => formatParticipantLabel(participant, input.options)),
        readParticipants(details, "removedParticipants").map((participant) => formatParticipantLabel(participant, input.options)),
      ];

  if (added.length > 0 && removed.length === 0) {
    const items = formatChangedEntityLabel(kind, added);
    return t(input.forIssueDetail ? "activityLog.change.added" : "activityLog.change.addedTo", { items });
  }
  if (removed.length > 0 && added.length === 0) {
    const items = formatChangedEntityLabel(kind, removed);
    return t(input.forIssueDetail ? "activityLog.change.removed" : "activityLog.change.removedFrom", { items });
  }
  const items = formatChangedEntityLabel(kind, []);
  return t(input.forIssueDetail ? "activityLog.change.updated" : "activityLog.change.updatedOn", { items });
}

/**
 * The feed verb for a bare action id, with no event details to sharpen it —
 * the shared fallback for any surface that renders `<actor> <verb> <entity>`.
 */
export function activityActionVerb(action: string): string {
  return translateId("verb", action);
}

export function formatActivityVerb(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action === "issue.updated") {
    const issueUpdatedVerb = formatIssueUpdatedVerb(details);
    if (issueUpdatedVerb) return issueUpdatedVerb;
  }

  if (action === "issue.stalled_review_decided") {
    const decision = typeof details?.action === "string" ? details.action : null;
    const label = decision ? STALLED_REVIEW_DECISION_LABELS[decision] : null;
    if (label) return verbOnEntity(label);
  }

  const outcomeLabel = formatInteractionOutcomeLabel(action, details);
  if (outcomeLabel) return verbOnEntity(outcomeLabel);

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: false,
  });
  if (structuredChange) return structuredChange;

  return translateId("verb", action);
}

export function formatIssueActivityAction(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action === "issue.updated") {
    const issueUpdatedAction = formatIssueUpdatedAction(details, options);
    if (issueUpdatedAction) return issueUpdatedAction;
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: true,
  });
  if (structuredChange) return structuredChange;

  if (action === "issue.accepted_plan_decomposition_updated") {
    const detail = formatAcceptedPlanDecompositionDetail(details);
    if (detail) return detail;
  }

  if (action === "issue.stalled_review_decided") {
    const decision = typeof details?.action === "string" ? details.action : null;
    const label = decision ? STALLED_REVIEW_DECISION_LABELS[decision] : null;
    if (label) return label;
  }

  const outcomeLabel = formatInteractionOutcomeLabel(action, details);
  if (outcomeLabel) return outcomeLabel;

  if (action.startsWith("issue.monitor_") && details) {
    const serviceName = typeof details.serviceName === "string" && details.serviceName.trim()
      ? details.serviceName.trim()
      : null;
    const base = translateId("label", action);
    return serviceName ? t("activityLog.monitorForService", { action: base, service: serviceName }) : base;
  }

  if (
    (
      action === "issue.document_created" ||
      action === "issue.document_updated" ||
      action === "issue.document_locked" ||
      action === "issue.document_unlocked" ||
      action === "issue.document_deleted"
    ) &&
    details
  ) {
    const key = typeof details.key === "string" ? details.key : "document";
    const title = typeof details.title === "string" && details.title ? ` (${details.title})` : "";
    return t("activityLog.documentTarget", { action: translateId("label", action), document: `${key}${title}` });
  }

  return translateId("label", action);
}
