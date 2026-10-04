import { checkMcpRemoteHeaderName, checkMcpRemoteHeaderValue, mcpRemoteHeaderRejectionMessage } from "@paperclipai/shared";
import type { GenericMcpAuthMode } from "@paperclipai/shared";
import { t } from "@/i18n";

/**
 * Logic behind the guided "Connect your own MCP server" flow (PAP-17087).
 *
 * Kept out of the component so the branch an operator lands on — and the
 * corrective advice they get — is directly testable, and so the wizard never has
 * to reason about protocol error codes inline.
 */

export type { GenericMcpAuthMode };

export interface CustomHeaderRow {
  /** Stable key so React can track rows across add/remove without reordering values. */
  id: string;
  name: string;
  value: string;
}

let customHeaderRowSeq = 0;

/** A blank custom-header row. The id is local only — it never reaches the API. */
export function newCustomHeaderRow(): CustomHeaderRow {
  customHeaderRowSeq += 1;
  return { id: `header-${customHeaderRowSeq}`, name: "", value: "" };
}

/** The endpoint host, shown prominently so the operator always sees who they are trusting. */
export function endpointHost(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

/**
 * The callback URI shown to operators must exactly match the URI the API sends.
 *
 * Xero and a few other OAuth providers reject numeric loopback hosts even though
 * they point at the same machine. The API therefore uses `localhost` for local
 * HTTP OAuth, so the setup form must advertise that same canonical spelling.
 */
export function oauthCallbackUrlForBrowser(origin: string = window.location.origin): string {
  const callbackUrl = new URL("/api/tools/oauth/callback", origin);
  const hostname = callbackUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    callbackUrl.protocol === "http:"
    && (hostname === "127.0.0.1" || hostname === "::1")
  ) {
    callbackUrl.hostname = "localhost";
  }
  return callbackUrl.toString();
}

/**
 * A useful, non-secret default label for an arbitrary endpoint.
 *
 * Keep the port and path: one host commonly serves several MCP endpoints, and
 * collapsing all of them to the hostname makes the second connection fail the
 * company-wide application-name constraint. Query strings are deliberately
 * excluded because remote MCP URLs can carry credentials there.
 */
export function defaultGenericMcpName(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.host.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${host}${path}`.slice(0, 160) || null;
  } catch {
    return null;
  }
}

/**
 * Where the operator has to look to fix a failed connect attempt. The wizard uses
 * this to decide whether to reopen the URL field or the credential section, rather
 * than leaving them to guess which of the two was wrong.
 */
export type GenericConnectFocus = "url" | "credentials" | "deployment" | "none";

export interface GenericConnectGuidance {
  title: string;
  body: string;
  focus: GenericConnectFocus;
}

/**
 * Turn an API failure into the specific corrective action the plan asks for:
 * invalid, unsafe, unreachable, or "needs a credential we could not discover".
 *
 * Anything unrecognised falls through to the server's own message, which is
 * already UI-safe (upstream bodies and secrets are stripped server-side).
 */
export function genericConnectGuidance(
  code: string | null | undefined,
  message: string | null | undefined,
): GenericConnectGuidance {
  const fallback = message?.trim() || t("paperclip_couldnt_connect_to_that_address_check");
  switch (code) {
    case "mcp_remote_url_missing":
    case "mcp_remote_url_invalid":
      return {
        title: t("that_doesnt_look_like_a_server_address"),
        body: t("paste_the_full_address_starting_with_https_for_e"),
        focus: "url",
      };
    case "remote_http_private_endpoint":
      return {
        title: t("that_address_is_inside_a_private_network"),
        body: t("this_paperclip_is_reachable_from_the_internet_so"),
        focus: "url",
      };
    case "remote_http_dns_failed":
      return {
        title: t("we_couldnt_find_that_host"),
        body: t("the_address_didnt_resolve_check_the_spelling_or"),
        focus: "url",
      };
    case "mcp_header_rejected":
      return {
        title: t("paperclip_cant_send_that_header"),
        body: fallback,
        focus: "credentials",
      };
    case "tool_access_name_conflict":
      return {
        title: t("paperclip_couldn_t_name_this_connection"),
        body: t("try_connecting_again"),
        focus: "none",
      };
    case "oauth_challenge":
      return {
        title: t("this_server_wants_a_credential"),
        body: t("it_asked_us_to_authenticate_but_didnt_offer_a_si"),
        focus: "credentials",
      };
    case "oauth_manual_client_required":
    case "oauth_manual_client_rebinding_required":
      return {
        title: t("this_server_needs_sign_in_details_you_create_you"),
        body: t("register_paperclip_in_the_providers_settings_the"),
        focus: "credentials",
      };
    case "oauth_redirect_origin_unsupported":
    case "oauth_redirect_uri_invalid":
      return {
        title: t("this_paperclip_needs_a_public_https_address_firs"),
        body: t("sign_in_sends_the_operator_back_to_paperclip_so"),
        focus: "deployment",
      };
    case "runtime_error":
      return {
        title: t("we_couldnt_reach_that_server"),
        body: t("nothing_answered_at_that_address_confirm_the_ser"),
        focus: "url",
      };
    default:
      return {
        title: t("paperclip_couldnt_connect"),
        body: fallback,
        focus: "none",
      };
  }
}

/**
 * First client-side complaint about the custom headers, or null when they're fine.
 * The API validates these too; checking here means the operator finds out before a
 * round trip rather than after one.
 */
export function customHeaderError(rows: CustomHeaderRow[]): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name && !row.value.trim()) continue;
    const nameCheck = checkMcpRemoteHeaderName(name);
    if (!nameCheck.ok) return mcpRemoteHeaderRejectionMessage(name, nameCheck.reason!);
    const valueCheck = checkMcpRemoteHeaderValue(row.value);
    if (!valueCheck.ok) return mcpRemoteHeaderRejectionMessage(name, valueCheck.reason!);
    if (!row.value.trim()) return t("zhPages.ed9467148caf", { name: name });
    const lower = name.toLowerCase();
    if (seen.has(lower)) return t("zhPages.68deba124948", { name: name });
    seen.add(lower);
  }
  return null;
}

export interface GenericConnectDraft {
  link: string;
  name: string;
  authMode: GenericMcpAuthMode;
  /** Simple path: the operator answered "Yes" to "does it need a key?". */
  needsKey: boolean;
  keyValue: string;
  headers: CustomHeaderRow[];
  oauthClientId: string;
  oauthClientSecret: string;
}

export interface GenericConnectPayload {
  link: string;
  name?: string;
  authMode?: GenericMcpAuthMode;
  credentialValues?: Record<string, string>;
  oauthClient?: { clientId: string; clientSecret?: string };
}

/**
 * Build the connect request from wizard state.
 *
 * `authMode` is only sent when the operator made an explicit choice under Advanced
 * authentication; the simple path leaves it off so the server probes and decides.
 * Header values become `headers.<Name>` credential paths, which the server turns
 * into Paperclip secrets — nothing here ever puts a value in the config.
 */
export function genericConnectPayload(draft: GenericConnectDraft): GenericConnectPayload {
  const credentialValues: Record<string, string> = {};
  const bearerKey = draft.keyValue.trim();
  const useBearer = draft.authMode === "bearer" || (draft.authMode === "auto" && draft.needsKey);
  if (useBearer && bearerKey) credentialValues["credentials.authorization"] = bearerKey;
  if (draft.authMode === "custom_headers") {
    for (const row of draft.headers) {
      const name = row.name.trim();
      if (!name || !row.value.trim()) continue;
      credentialValues[`headers.${name}`] = row.value;
    }
  }
  const trimmedName = draft.name.trim();
  const clientId = draft.oauthClientId.trim();
  const clientSecret = draft.oauthClientSecret.trim();
  return {
    link: draft.link,
    ...(trimmedName ? { name: trimmedName } : {}),
    ...(draft.authMode === "auto" ? {} : { authMode: draft.authMode }),
    ...(Object.keys(credentialValues).length > 0 ? { credentialValues } : {}),
    ...(draft.authMode === "oauth" && clientId
      ? { oauthClient: { clientId, ...(clientSecret ? { clientSecret } : {}) } }
      : {}),
  };
}

/** Can "Check link" be pressed? */
export function canSubmitGenericConnect(draft: GenericConnectDraft): boolean {
  if (!draft.link.trim()) return false;
  if (draft.authMode === "auto") return !draft.needsKey || draft.keyValue.trim().length > 0;
  if (draft.authMode === "bearer") return draft.keyValue.trim().length > 0;
  if (draft.authMode === "custom_headers") {
    const filled = draft.headers.filter((row) => row.name.trim() && row.value.trim());
    return filled.length > 0 && customHeaderError(draft.headers) === null;
  }
  // "oauth" here means the operator is supplying a preregistered client, and
  // "none" means they are asserting the server is public — neither needs a value.
  return true;
}
