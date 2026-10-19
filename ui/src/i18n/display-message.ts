import en from "./locales/en.json";
import displayParameters from "./display-parameters.json";
import { i18n, t } from ".";

type MessageEntry = { key: string; english: string };
type TemplateEntry = MessageEntry & { pattern: RegExp; names: string[]; specificity: number };
const parameterOverrides: Record<string, Record<string, Record<string, string>>> = displayParameters;
const shortSystemTemplates = new Set([
  "{{value1}} is required", "{{value1}} not found", "{{value1}} run {{value2}}",
  "{{value1}} summary", "Discuss: {{value1}}", "{{value1}} budget {{value2}}",
  "Connect {{value1}}", "Skill test: {{value1}}", "{{value1}} title", "Run status: {{value1}}",
]);

function entries(value: unknown, path = ""): MessageEntry[] {
  if (typeof value === "string") return [{ key: path, english: value }];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => entries(child, path ? `${path}.${key}` : key));
}

const messages = entries(en);
const exactMessages = new Map(messages.map((entry) => [entry.english, entry.key]));
let templates: TemplateEntry[] | undefined;

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageTemplates(): TemplateEntry[] {
  if (templates) return templates;
  templates = messages.flatMap((entry): TemplateEntry[] => {
    const placeholders = [...entry.english.matchAll(/{{\s*([\w.-]+)\s*}}/g)];
    if (!placeholders.length) return [];
    const literalText = entry.english.replace(/{{\s*[\w.-]+\s*}}/g, "");
    // Generic templates such as "{{name}}: {{value}}" must never interpret
    // arbitrary user-authored text as a system message.
    if ((literalText.trim().length < 12 && !shortSystemTemplates.has(entry.english))
      || !/[A-Za-z]{3}/.test(literalText)) return [];
    const pieces: string[] = [];
    let offset = 0;
    for (const placeholder of placeholders) {
      pieces.push(escapePattern(entry.english.slice(offset, placeholder.index)), "([\\s\\S]*?)");
      offset = (placeholder.index ?? 0) + placeholder[0].length;
    }
    pieces.push(escapePattern(entry.english.slice(offset)));
    return [{ ...entry, names: placeholders.map((match) => match[1]!), pattern: new RegExp(`^${pieces.join("")}$`), specificity: literalText.length }];
  }).sort((a, b) => b.specificity - a.specificity);
  return templates;
}

/**
 * Translate known product messages arriving from APIs or adapter schemas at
 * display time. Keep response bodies, error codes, credentials, and unknown
 * user-authored content unchanged. The original English catalog remains the
 * contract for exact text and named interpolation.
 */
export function translateDisplayMessage(message: string): string {
  if (!message || i18n.language.split("-")[0] === "en") return message;
  const key = exactMessages.get(message);
  if (key) return t(key, { defaultValue: message });
  for (const entry of messageTemplates()) {
    const match = entry.pattern.exec(message);
    if (!match) continue;
    const values: Record<string, string> = {};
    let consistent = true;
    entry.names.forEach((name, index) => {
      const value = match[index + 1] ?? "";
      if (name in values && values[name] !== value) consistent = false;
      values[name] = value;
    });
    if (consistent) {
      if (i18n.language.split("-")[0] === "zh") {
        for (const [name, alternatives] of Object.entries(parameterOverrides[entry.english] ?? {})) {
          if (values[name] in alternatives) values[name] = alternatives[values[name]]!;
        }
      }
      return t(entry.key, { ...values, defaultValue: message });
    }
  }
  return message;
}
