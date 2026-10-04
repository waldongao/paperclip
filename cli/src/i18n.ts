import chineseMessages from "./locales/zh-CN.json" with { type: "json" };
import displayParameters from "./locales/display-parameters.json" with { type: "json" };

type Values = Record<string, string | number | boolean | null | undefined>;
const messages: Readonly<Record<string, string>> = chineseMessages;
const parameterOverrides: Record<string, Record<string, Record<string, string>>> = displayParameters;
const shortSystemTemplates = new Set([
  "{{value1}} is required", "{{value1}} not found", "{{value1}} run {{value2}}",
  "{{value1}} summary", "Discuss: {{value1}}", "{{value1}} budget {{value2}}",
  "Connect {{value1}}", "Skill test: {{value1}}", "{{value1}} title", "Run status: {{value1}}",
]);

/** CLI locale is independent of the browser preference and machine output. */
export function cliLocale(environment: NodeJS.ProcessEnv = process.env): "en" | "zh-CN" {
  const requested = environment.PAPERCLIP_LOCALE
    ?? environment.LC_ALL
    ?? environment.LC_MESSAGES
    ?? environment.LANG
    ?? "en";
  return /^zh(?:[-_.]|$)/i.test(requested) ? "zh-CN" : "en";
}

/** Translate human copy only. Never pass commands, identifiers or JSON here. */
export function tCli(english: string, values: Values = {}): string {
  const chinese = cliLocale() === "zh-CN";
  const template = chinese ? messages[english] ?? english : english;
  return template.replace(/{{\s*([\w.-]+)\s*}}/g, (token, name: string) =>
    name in values ? (chinese ? parameterOverrides[english]?.[name]?.[String(values[name] ?? "")] : undefined)
      ?? String(values[name] ?? "") : token);
}

let displayTemplates: Array<{ english: string; pattern: RegExp; names: string[] }> | undefined;

/** Localize a known server/diagnostic sentence at a human display boundary. */
export function translateCliDisplayMessage(message: string): string {
  if (cliLocale() !== "zh-CN" || !message) return message;
  if (message in messages) return tCli(message);
  displayTemplates ??= Object.keys(messages).flatMap((english) => {
    const placeholders = [...english.matchAll(/{{\s*([\w.-]+)\s*}}/g)];
    const fixed = english.replace(/{{\s*[\w.-]+\s*}}/g, "");
    if (!placeholders.length || (fixed.trim().length < 12 && !shortSystemTemplates.has(english))
      || !/[A-Za-z]{3}/.test(fixed)) return [];
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let offset = 0;
    let pattern = "^";
    for (const placeholder of placeholders) {
      pattern += escape(english.slice(offset, placeholder.index)) + "([\\s\\S]*?)";
      offset = (placeholder.index ?? 0) + placeholder[0].length;
    }
    pattern += escape(english.slice(offset)) + "$";
    return [{ english, pattern: new RegExp(pattern), names: placeholders.map((p) => p[1]!) }];
  }).sort((a, b) => b.english.replace(/{{[^}]+}}/g, "").length - a.english.replace(/{{[^}]+}}/g, "").length);
  for (const template of displayTemplates) {
    const match = template.pattern.exec(message);
    if (!match) continue;
    const values: Values = {};
    let consistent = true;
    template.names.forEach((name, index) => {
      const value = match[index + 1] ?? "";
      if (name in values && values[name] !== value) consistent = false;
      values[name] = value;
    });
    if (consistent) return tCli(template.english, values);
  }
  return message;
}
