import { i18n, t } from "@/i18n";

/** Grammar belongs to display text, never to persisted IDs. */
export function getCountNoun(count: number, noun: string): string {
  return t(`zhComponents.nouns.${noun}`, { count });
}

export function getPluralSuffix(count: number): string {
  return (i18n.resolvedLanguage ?? i18n.language).startsWith("zh") || count === 1 ? "" : "s";
}
