import type { PipelineCompanyCaseEvent } from "../api/pipelines";
import { formatShortDate } from "./utils";
import { t } from "@/i18n";

export type LearningEventPresentation = {
  sentence: string;
  kind: "review" | "forced_move" | "unknown";
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function eventItemTitle(event: PipelineCompanyCaseEvent): string {
  const payload = asRecord(event.payload);
  return (
    asString(event.case?.title) ??
    asString(payload.itemTitle) ??
    asString(payload.caseTitle) ??
    asString(payload.title) ??
    t("untitled_item")
  );
}

function eventActorName(event: PipelineCompanyCaseEvent): string {
  const payload = asRecord(event.payload);
  return (
    asString(event.actorAgent?.name) ??
    asString(payload.actorName) ??
    asString(payload.reviewerName) ??
    asString(payload.decidedByName) ??
    t("someone")
  );
}

function payloadText(event: PipelineCompanyCaseEvent, ...keys: string[]): string | null {
  const payload = asRecord(event.payload);
  for (const key of keys) {
    const value = asString(payload[key]);
    if (value) return value;
  }
  return null;
}

function reviewVerb(decision: string | null): string {
  if (decision === "request_changes") return t("sent_back");
  if (decision === "reject" || decision === "drop") return t("declined");
  return t("approved");
}

export function formatLearningEvent(event: PipelineCompanyCaseEvent): LearningEventPresentation {
  const payload = asRecord(event.payload);
  const title = eventItemTitle(event);

  if (event.type === "review_decided") {
    const actor = eventActorName(event);
    const decision = asString(payload.decision);
    const toStageName =
      asString(event.toStage?.name) ?? payloadText(event, "toStageName", "stageName", "targetStageName");
    const stageCopy = toStageName ? t("zhSupport.learning.movingTo", { stage: toStageName }) : "";
    const note = payloadText(event, "reason", "note");
    const noteCopy = note ? t("zhSupport.learning.note", { note }) : "";
    return {
      kind: "review",
      sentence: t("zhSupport.learning.review", { actor, verb: reviewVerb(decision), title, stage: stageCopy, note: noteCopy }),
    };
  }

  if (event.type === "transition_forced") {
    const fromStageName = asString(event.fromStage?.name) ?? payloadText(event, "fromStageName");
    const toStageName =
      asString(event.toStage?.name) ?? payloadText(event, "toStageName", "stageName", "targetStageName");
    const fromCopy = fromStageName ? t("zhSupport.learning.from", { stage: fromStageName }) : "";
    const toCopy = toStageName ? t("zhSupport.learning.to", { stage: toStageName }) : "";
    const reason = payloadText(event, "reason", "note");
    const reasonCopy = reason ? t("zhSupport.learning.reason", { reason }) : "";
    return {
      kind: "forced_move",
      sentence: t("zhSupport.learning.moved", { title, from: fromCopy, to: toCopy, reason: reasonCopy }),
    };
  }

  return {
    kind: "unknown",
    sentence: t("zhSupport.learning.changed", { title }),
  };
}

export function learningDayKey(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 10);
}

export function learningDayLabel(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("unknown");
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDay) / 86_400_000);
  if (diffDays === 0) return t("today_24345a");
  if (diffDays === 1) return t("yesterday");
  return formatShortDate(date);
}

export function groupLearningEventsByDay<T extends { createdAt: string | Date }>(events: T[]) {
  const groups: Array<{ key: string; label: string; events: T[] }> = [];
  for (const event of events) {
    const key = learningDayKey(event.createdAt);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.events.push(event);
      continue;
    }
    groups.push({ key, label: learningDayLabel(event.createdAt), events: [event] });
  }
  return groups;
}
