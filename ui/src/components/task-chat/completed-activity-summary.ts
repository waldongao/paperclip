import { t } from "@/i18n";
import { Brain, CirclePause, Gauge, Layers3 } from "lucide-react";
import type { TaskChatActivityPhaseItem } from "./task-chat-model";
import {
  toolActivityPresentation,
  type ToolFamily,
  type ToolIcon,
} from "./tool-taxonomy";
import { protocolActivityPresentation } from "./task-chat-activity-presentation";

type Activity = TaskChatActivityPhaseItem["items"][number];
const labels: Record<ToolFamily, string> = {
  terminal: t("stability.80905baf3aae"),
  grep: t("searched_files"),
  search: t("searched_files"),
  read: t("stability.4e792beef219"),
  edit: t("edited_files"),
  web: t("searched_the_web"),
  plan: t("stability.cc9edfa1e141"),
  question: t("requested_input"),
  agent: t("stability.8e1471062f03"),
  safety: t("reviewed_safety"),
  image: t("stability.d8966505b596"),
  wait: t("waited"),
  mcp: t("stability.084d97476500"),
  other: t("stability.836c94ab8f0d"),
};

/** Describe observed activities, never infer success from a finished group. */
export function completedActivitySummary(items: Activity[]) {
  const categories = new Map<
    string,
    { label: string; icon: ToolIcon; order: number }
  >();
  const add = (label: string, icon: ToolIcon, order = 0) => {
    const existing = categories.get(label);
    if (!existing || order < existing.order)
      categories.set(label, { label, icon, order });
  };
  const tools: Array<{
    family: ToolFamily;
    icon: ToolIcon;
    completed: boolean;
    order: number;
  }> = [];
  for (const [order, item] of items.entries()) {
    if (item.kind === "tool") {
      const p = toolActivityPresentation({
        name: item.rawName ?? item.name,
        target: item.target,
      });
      tools.push({ ...p, order, completed: item.status === "completed" });
    } else if (item.kind === "protocol") {
      if (
        item.surface === "provider_activity" &&
        item.family === "tool_execution"
      ) {
        const value = (label: string) =>
          item.details.find((d) => d.label === label)?.value;
        const p = toolActivityPresentation({
          name: value("Name"),
          operation: value("Operation"),
          transport: value("Transport"),
          namespace: value("Namespace"),
          target: value("Target"),
        });
        tools.push({ ...p, order, completed: item.status === "completed" });
      } else {
        const p = protocolActivityPresentation(item);
        if (!p) continue;
        const family =
          item.surface === "provider_activity" ? item.family : item.surface;
        const label =
          (
            {
              research: t("searched_the_web"),
              plan: t("stability.cc9edfa1e141"),
              delegation: t("stability.8e1471062f03"),
              artifact: t("stability.0b98b99f2fc7"),
              context: t("stability.fa532ff325ae"),
              memory: t("stability.a022dec00248"),
              model_identity: "Checked model settings",
              review: "Worked in review mode",
              hook: "Ran hooks",
              safety: t("reviewed_safety"),
              terminal: t("stability.80905baf3aae"),
              wait: t("waited"),
              provider_notice: "Received a provider update",
              workspace_change: "Worked on files",
              workspace_file: "Referenced files",
              resource: "Added resources",
            } as Record<string, string>
          )[family] ?? t("stability.836c94ab8f0d");
        add(label, p.icon, order);
      }
    }
  }
  const completedFamilies = new Set(
    tools.filter((tool) => tool.completed).map((tool) => tool.family),
  );
  // Merge repeated families and retries. Terminal is an action, not an exit-status claim.
  for (const tool of tools) {
    const succeeded = completedFamilies.has(tool.family);
    const label =
      tool.family === "read" && !succeeded
        ? "Checked files"
        : tool.family === "edit" && !succeeded
          ? "Worked on files"
          : labels[tool.family];
    add(label, tool.icon, tool.order);
  }
  if (!categories.size) {
    if (items.some((item) => item.kind === "thinking"))
      add(t("stability.9257b9ec74c2"), Brain);
    else if (items.some((item) => item.kind === "marker"))
      add(t("stability.98e2e327b5c9"), CirclePause);
    else add(t("stability.fce3c2264f76"), Gauge);
  }
  const values = [...categories.values()].sort((a, b) => a.order - b.order);
  const join = (parts: string[]) =>
    parts
      .map((p, i) => (i ? p.charAt(0).toLowerCase() + p.slice(1) : p))
      .join(t("activityLog.listSeparator"));
  const fullLabel = join(values.map((v) => v.label));
  return {
    label:
      values.length > 3
        ? t("stability.47b46b187a70", { activities: join(values.slice(0, 2).map((v) => v.label)) })
        : fullLabel,
    fullLabel,
    icon: values.length === 1 ? values[0].icon : Layers3,
  };
}
