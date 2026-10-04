import type {
  ConnectionGrantKind,
  ConnectionAudienceMember,
  ConnectionGrant,
  ConnectionGrantStatus,
  ToolConnectionCredentialPolicy,
} from "@paperclipai/shared";
import { t } from "@/i18n";

/**
 * Canonical user-facing vocabulary for connection identity (PAP-17835).
 *
 * The domain words — `grant`, `subjectUserId`, `credentialPolicy`, "empty
 * audience" — never reach product copy. Everything the identity surfaces render
 * resolves through this module so create, Setup, Permissions and the interaction
 * card cannot drift into three different names for the same thing.
 */

// Display copy — translated, so not a literal union. Callers that need the
// underlying distinction branch on `credentialPolicy`, never on this text.
export type ConnectionTypeLabel = string;

/** The two connection types shown throughout the product. */
export function connectionTypeLabel(
  credentialPolicy: ToolConnectionCredentialPolicy,
): ConnectionTypeLabel {
  return credentialPolicy === "per_user" ? t("personal") : t("company");
}

const COMPANY_NAME_SUFFIX = t("for_the_company");

/** Keep company-owned connections unmistakable anywhere their name appears. */
export function connectionNameForGrantKind(name: string, grantKind: ConnectionGrantKind): string {
  const trimmed = name.trim();
  if (grantKind !== "organization" || trimmed.toLocaleLowerCase().endsWith(COMPANY_NAME_SUFFIX)) {
    return trimmed;
  }
  return `${trimmed}${COMPANY_NAME_SUFFIX}`;
}

export function connectionNameForCredentialPolicy(
  name: string,
  credentialPolicy: ToolConnectionCredentialPolicy,
): string {
  return connectionNameForGrantKind(
    name,
    credentialPolicy === "per_user" ? "user" : "organization",
  );
}

/**
 * Status copy is label text, never colour alone, so it survives a monochrome or
 * high-contrast rendering. "Not connected" is the explicit missing state — a
 * `per_user` connection with no personal grant must never read as connected.
 */
export function grantStatusLabel(status: ConnectionGrantStatus | null): string {
  switch (status) {
    case "active":
      return t("connected");
    case "needs_reauthorization":
      return t("needs_attention");
    case "expired":
      return t("expired");
    case "revoked":
      return t("revoked");
    default:
      return t("not_connected");
  }
}

export type GrantStatusTone = "connected" | "attention" | "inactive" | "missing";

export function grantStatusTone(status: ConnectionGrantStatus | null): GrantStatusTone {
  switch (status) {
    case "active":
      return "connected";
    case "needs_reauthorization":
    case "expired":
      return "attention";
    case "revoked":
      return "inactive";
    default:
      return "missing";
  }
}

/**
 * The provider's own label for the account behind a grant. Providers do not
 * always return safe tenant metadata, so this falls back to a neutral phrase
 * rather than exposing a secret name or ref.
 */
export function grantAccountLabel(
  grant: Pick<ConnectionGrant, "kind" | "providerTenant"> | null,
  options: { subjectLabel?: string | null } = {},
): string {
  const tenantName = grant?.providerTenant?.name?.trim();
  if (tenantName) return tenantName;
  if (grant?.kind === "user") return options.subjectLabel?.trim() || t("connected_account");
  return t("shared_credential");
}

/**
 * Audience summary for an organization grant. Zero members is "all organization
 * members" — the product never says "empty list", because that is a storage
 * detail and not how anyone thinks about who may use an identity.
 */
export function audienceSummary(grant: Pick<ConnectionGrant, "members"> | null): string {
  const count = grant?.members?.length ?? 0;
  if (count === 0) return t("all_organization_members");
  return t("zhPages.dd8f7d4ac093", { count: count });
}

export function audienceUserIds(grant: Pick<ConnectionGrant, "members"> | null): Set<string> {
  return new Set((grant?.members ?? [])
    .filter((member) => member.subjectType === "user")
    .map((member) => member.subjectId));
}

export function organizationGrant(grants: ConnectionGrant[]): ConnectionGrant | null {
  // The default organization grant is the one the resolver reaches for, so it is
  // the one the Organization identity row describes.
  return grants.find((grant) => grant.kind === "organization" && grant.isDefault)
    ?? grants.find((grant) => grant.kind === "organization")
    ?? null;
}

export function personalGrantFor(grants: ConnectionGrant[], userId: string | null): ConnectionGrant | null {
  if (!userId) return null;
  return grants.find((grant) => grant.kind === "user" && grant.subjectUserId === userId) ?? null;
}

export function otherPersonalGrants(grants: ConnectionGrant[], userId: string | null): ConnectionGrant[] {
  return grants.filter((grant) => grant.kind === "user" && grant.subjectUserId !== userId);
}

export function memberLabel(
  members: ConnectionAudienceMember[],
  userId: string | null,
): string | null {
  if (!userId) return null;
  const match = members.find((member) => member.userId === userId);
  if (!match) return null;
  return match.name?.trim() || match.email?.trim() || null;
}
