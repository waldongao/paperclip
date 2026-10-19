/**
 * Single source of truth for adapter display metadata.
 *
 * Built-in adapters have entries in `adapterDisplayMap`. External (plugin)
 * adapters get sensible defaults derived from their type string via
 * `getAdapterDisplay()`.
 */
import type { ComponentType } from "react";
import {
  Bot,
  Code,
  Gem,
  Moon,
  MousePointer2,
  Sparkles,
  Terminal,
  Cpu,
} from "lucide-react";
import { OpenCodeLogoIcon } from "@/components/OpenCodeLogoIcon";
import { t } from "@/i18n";

// ---------------------------------------------------------------------------
// Type suffix parsing
// ---------------------------------------------------------------------------

// Suffixes stripped from type ids when deriving a human-readable label for
// unknown (plugin) adapter types. "_local" is a legacy qualifier from before
// first-class Environments and is never displayed; "_gateway" is re-appended
// as " (gateway)" to disambiguate gateway variants. Known adapters in
// `adapterDisplayMap` have final labels and never get a derived suffix.
const STRIPPED_TYPE_SUFFIXES = ["_local", "_gateway"] as const;

const DISPLAY_SUFFIXES: Record<string, string> = {
  _gateway: "gateway",
};

function getTypeSuffix(type: string): string | null {
  for (const [suffix, mode] of Object.entries(DISPLAY_SUFFIXES)) {
    if (type.endsWith(suffix)) return mode;
  }
  return null;
}

function withSuffix(label: string, suffix: string | null): string {
  return suffix ? `${label} (${suffix})` : label;
}

// ---------------------------------------------------------------------------
// Display metadata per adapter type
// ---------------------------------------------------------------------------

export interface AdapterDisplayInfo {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  recommended?: boolean;
  comingSoon?: boolean;
  disabledLabel?: string;
  experimental?: boolean;
  hideFromVisualSelection?: boolean;
}

const adapterDisplayMap: Record<string, AdapterDisplayInfo> = {
  acpx_local: {
    label: t("acpx_retired"),
    description: t("retired_standalone_acpx_adapter"),
    icon: Bot,
    comingSoon: true,
    disabledLabel: t("use_claude_code_or_codex_with_the_acp_engine"),
    hideFromVisualSelection: true,
  },
  claude_local: {
    label: t("claude_code"),
    description: t("claude_code_cli_harness"),
    icon: Sparkles,
    recommended: true,
  },
  codex_local: {
    label: t("codex"),
    description: t("codex_cli_harness"),
    icon: Code,
    recommended: true,
  },
  paperclip_runner: {
    label: t("paperclip_runner"),
    description: t("experimental_rust_runner_with_a_codex_provider"),
    icon: Cpu,
    experimental: true,
  },
  gemini_local: {
    label: t("gemini_cli"),
    description: t("gemini_cli_harness"),
    icon: Gem,
  },
  grok_local: {
    label: t("grok_build"),
    description: t("grok_build_harness"),
    icon: Bot,
  },
  kimi_local: {
    label: t("kimi_code"),
    description: t("kimi_code_cli_harness"),
    icon: Moon,
  },
  hermes_gateway: {
    label: t("hermes_gateway"),
    description: t("remote_hermes_api_server"),
    icon: Bot,
    hideFromVisualSelection: true,
  },
  hermes_local: {
    label: t("hermes"),
    description: t("hermes_harness"),
    icon: Bot,
  },
  opencode_local: {
    label: t("opencode"),
    description: t("opencode_multi_provider_harness"),
    icon: OpenCodeLogoIcon,
  },
  pi_local: {
    label: t("pi"),
    description: t("pi_harness"),
    icon: Terminal,
  },
  cursor: {
    label: t("cursor"),
    description: t("cursor_cli_harness"),
    icon: MousePointer2,
  },
  cursor_cloud: {
    label: t("cursor_cloud"),
    description: t("managed_remote_cursor_agent"),
    icon: MousePointer2,
  },
  openclaw_gateway: {
    label: t("openclaw_gateway"),
    description: t("external_gateway_adapter"),
    icon: Bot,
    comingSoon: true,
    disabledLabel: t("invite_external_agents_from_the_add_agent_modal"),
    hideFromVisualSelection: true,
  },
  process: {
    label: t("process"),
    description: t("internal_process_adapter"),
    icon: Cpu,
    comingSoon: true,
  },
  http: {
    label: "HTTP",
    description: t("internal_http_adapter"),
    icon: Cpu,
    comingSoon: true,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function humanizeType(type: string): string {
  // Strip known type suffixes so "droid_local" → "Droid", not "Droid Local"
  let base = type;
  for (const suffix of STRIPPED_TYPE_SUFFIXES) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAdapterLabel(type: string): string {
  // Known labels are final — only unknown (plugin) types get a derived
  // suffix, so labels like "OpenClaw Gateway" don't become
  // "OpenClaw Gateway (gateway)".
  const known = adapterDisplayMap[type];
  if (known) return known.label;
  return withSuffix(humanizeType(type), getTypeSuffix(type));
}

export function getAdapterLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [type, info] of Object.entries(adapterDisplayMap)) {
    labels[type] = info.label;
  }
  return labels;
}

export function getAdapterDisplay(type: string): AdapterDisplayInfo {
  const known = adapterDisplayMap[type];
  if (known) return known;

  const suffix = getTypeSuffix(type);
  const label = withSuffix(humanizeType(type), suffix);
  return {
    label,
    description: suffix ? t("zhSupport.externalAdapter", { suffix }) : t("external_adapter"),
    icon: Cpu,
  };
}

export function isKnownAdapterType(type: string): boolean {
  return type in adapterDisplayMap;
}
