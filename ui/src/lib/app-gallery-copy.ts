
import { t } from "@/i18n";
import { translateDisplayMessage } from "@/i18n/display-message";

/**
 * Prosumer copy for the Apps surface (PAP-10856).
 *
 * The P1a gallery manifest carries developer-flavoured taglines and credential
 * labels (e.g. "Connect Zapier-hosted MCP actions", "Zapier MCP token"). Those
 * strings would fail the vocabulary gate from PAP-10827 — no "MCP", "server",
 * "profile", "policy", "gateway", or "transport" anywhere on this surface. So
 * the UI never renders the raw manifest copy directly: it looks up plain copy
 * here, and `sanitizeProsumerCopy` is a final backstop for any free-text we do
 * surface (app names, fallback taglines).
 */

/** Words that must never appear in prosumer-facing copy on the Apps surface. */
const BANNED_WORDS = [
  "mcp",
  "server",
  "profile",
  "policy",
  "gateway",
  "transport",
  "stdio",
  "endpoint",
];

const BANNED_RE = new RegExp(`\\b(${BANNED_WORDS.join("|")})s?\\b`, "gi");

/**
 * Strip banned vocabulary from a free-text string as a last-resort backstop.
 * Prefer curated copy below; this only protects against manifest text we can't
 * fully control (e.g. a newly added gallery app with no curated entry yet).
 */
export function sanitizeProsumerCopy(text: string): string {
  return text
    .replace(BANNED_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

export interface AppCopy {
  /** Two short lines for the gallery card (M2). */
  tagline: string;
  /** Single line for the connect step header (M3b). */
  short: string;
}

/**
 * Curated prosumer copy keyed by gallery key. Taken from the M-series wires
 * (https://happy-grove-jzyc.here.now/). Apps without an entry fall back to a
 * generic, gate-safe line.
 */
const APP_COPY: Record<string, AppCopy> = {
  zapier: {
    tagline: t("reach_9_000_apps_your_team_already_uses"),
    short: t("reach_9_000_apps_from_your_agents"),
  },
  github: {
    tagline: t("read_code_and_pull_requests_comment_on_issues"),
    short: t("read_code_and_pull_requests_comment_on_issues"),
  },
  slack: {
    tagline: t("send_and_read_messages_in_your_teams_channels"),
    short: t("send_and_read_messages_in_your_channels"),
  },
  notion: {
    tagline: t("read_and_update_pages_in_your_workspace"),
    short: t("read_and_update_pages_in_your_workspace"),
  },
  posthog: {
    tagline: t("explore_product_usage_errors_flags_and_experimen"),
    short: t("sign_in_with_posthog_project_pinning_and_access"),
  },
  linear: {
    tagline: t("create_update_and_read_tickets"),
    short: t("create_update_and_read_tickets"),
  },
  "google-sheets": {
    tagline: t("read_and_update_selected_spreadsheets"),
    short: t("read_spreadsheets_or_update_the_files_you_choose"),
  },
  gmail: {
    tagline: t("read_mail_and_create_drafts_for_your_review"),
    short: t("read_mail_and_create_drafts_for_your_review"),
  },
  "google-drive": {
    tagline: t("find_read_and_create_files_in_drive"),
    short: t("find_read_and_create_files_in_drive"),
  },
  "google-docs": {
    tagline: t("read_and_update_documents"),
    short: t("read_and_update_documents"),
  },
  "google-slides": {
    tagline: t("read_and_update_presentations"),
    short: t("read_and_update_presentations"),
  },
  "google-calendar": {
    tagline: t("review_calendars_and_manage_events"),
    short: t("review_calendars_and_manage_events"),
  },
  "google-chat": {
    tagline: t("read_conversations_and_send_messages"),
    short: t("read_conversations_and_send_messages"),
  },
  "google-people": {
    tagline: t("look_up_contacts_and_people_in_your_directory"),
    short: t("look_up_contacts_and_people_in_your_directory"),
  },
  "google-workspace-search": {
    tagline: t("search_across_your_google_workspace"),
    short: t("search_across_your_google_workspace"),
  },
  hubspot: {
    tagline: t("look_up_contacts_and_update_deal_stages"),
    short: t("look_up_contacts_and_update_deal_stages"),
  },
  intercom: {
    tagline: t("read_and_reply_to_customer_conversations"),
    short: t("read_and_reply_to_customer_conversations"),
  },
  figma: {
    tagline: t("read_files_and_post_comments_on_frames"),
    short: t("read_files_and_post_comments_on_frames"),
  },
  stripe: {
    tagline: t("read_customers_invoices_and_payouts"),
    short: t("read_customers_invoices_and_payouts"),
  },
  context7: {
    tagline: t("look_up_up_to_date_docs_for_your_libraries"),
    short: t("look_up_up_to_date_docs_for_your_libraries"),
  },
};

const GENERIC: AppCopy = {
  tagline: t("give_your_agents_access_to_this_app"),
  short: t("give_your_agents_access_to_this_app"),
};

/** Curated, gate-safe copy for a gallery app. */
export function appCopyFor(key: string, fallbackTagline?: string | null): AppCopy {
  const curated = APP_COPY[key];
  if (curated) return curated;
  if (fallbackTagline) {
    const cleaned = sanitizeProsumerCopy(translateDisplayMessage(fallbackTagline));
    if (cleaned) return { tagline: cleaned, short: cleaned };
  }
  return GENERIC;
}

/**
 * Label for a single credential field on the key-paste step (M3b). The raw
 * manifest label can contain banned vocab ("Zapier MCP token"), so for the
 * common single-field case we present "Your {App} key" per the wires; multi-
 * field apps fall back to a sanitized version of the manifest label.
 */
export function credentialFieldLabel(
  appName: string,
  rawLabel: string,
  fieldCount: number,
): string {
  if (fieldCount <= 1) return t("zhSupport.yourAppKey", { app: appName });
  const cleaned = sanitizeProsumerCopy(translateDisplayMessage(rawLabel));
  return cleaned || t("zhSupport.yourAppKey", { app: appName });
}
