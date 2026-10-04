import { t } from "@/i18n";

/**
 * Delivery-policy enums arrive from the API as raw ids (`coalesce_if_active`).
 * Several surfaces used to print them with the underscores swapped for spaces,
 * which left English wording in every other language; these helpers translate
 * them instead and keep the humanized id as the fallback for a policy the UI
 * does not know yet.
 */
function humanizePolicy(value: string): string {
  return value.replaceAll("_", " ");
}

export function concurrencyPolicyLabel(value: string): string {
  switch (value) {
    case "coalesce_if_active": return t("coalesce_if_active");
    case "always_enqueue": return t("always_enqueue");
    case "skip_if_active": return t("skip_if_active");
    default: return humanizePolicy(value);
  }
}

export function catchUpPolicyLabel(value: string): string {
  switch (value) {
    case "skip_missed": return t("skip_missed");
    case "enqueue_missed_with_cap": return t("enqueue_missed_with_cap");
    default: return humanizePolicy(value);
  }
}
