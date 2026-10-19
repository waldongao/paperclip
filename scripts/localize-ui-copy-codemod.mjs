#!/usr/bin/env node
/** Mechanically wrap user-facing JSX copy, keeping protocol and user values raw. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = process.argv[2];
const outputName = process.argv[3] ?? "new-ui-english.json";
if (!reportDirectory) throw new Error("Expected report directory for new English catalog entries");
const uiRequire = createRequire(join(process.env.PAPERCLIP_I18N_TOOLCHAIN_ROOT ?? root, "ui/package.json"));
const pluginRequire = createRequire(uiRequire.resolve("@vitejs/plugin-react"));
const babelRequire = createRequire(pluginRequire.resolve("@babel/core"));
const { parse } = babelRequire("@babel/parser");
const parseSource = source => parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
function flatten(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
}
const english = flatten(JSON.parse(readFileSync(join(root, "ui/src/i18n/locales/en.json"), "utf8")));
const byText = new Map();
for (const [key, value] of english) if (!byText.has(value)) byText.set(value, key);
if (process.argv[4]) for (const [key, value] of flatten(JSON.parse(readFileSync(process.argv[4], "utf8")))) if (!byText.has(value)) byText.set(value, key);
const newEnglish = {};
const keyFor = text => {
  if (byText.has(text)) return byText.get(text);
  const key = createHash("sha256").update(text).digest("hex").slice(0, 12);
  newEnglish[key] = text; byText.set(text, `stability.${key}`); return `stability.${key}`;
};
const translation = (text, values = []) => {
  const key = keyFor(text);
  const options = values.map(([name, value]) => `${name}: ${value}`);
  if (key.startsWith("stability.")) options.push(`defaultValue: ${JSON.stringify(text)}`);
  if (!values.length && text.includes("{{")) options.push('interpolation: { prefix: "%{", suffix: "}%" }');
  return `t(${JSON.stringify(key)}${options.length ? `, { ${options.join(", ")} }` : ""})`;
};
const preservedNames = new Set([
  'Paperclip', 'Paperclip Runner', 'Paperclip Cloud', 'Paperclip Computer',
  'OpenAI', 'Anthropic', 'Claude', 'Claude Code', 'Codex', 'Gemini', 'Cursor', 'OpenCode', 'Pi', 'Hermes', 'Grok', 'Kimi',
  'GitHub', 'Google', 'Google Sheets', 'PostHog', 'Vercel', 'Zapier', 'Slack', 'Notion', 'Jira', 'Linear', 'Asana', 'Gmail', 'HubSpot',
  'AI', 'API', 'CLI', 'MCP', 'ACP', 'ACPX', 'PRP', 'HTTP', 'HTTPS', 'POST', 'OAuth', 'SSH', 'JSON', 'YAML', 'HTML', 'CSS', 'SQL',
  'USD', 'UTC', 'ID', 'URL', 'JWT', 'UTF-8', 'KB', 'MB', 'GB', 'ms', 'px', 'rem', 'vh', 'vw', 'v',
  'Bash', 'Shell', 'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Linux', 'Windows', 'macOS',
  'Ctrl', 'Alt', 'Shift', 'Meta', 'Esc', 'Enter', 'Tab', 'Space',
  // Audited examples, identifiers and developer samples, never prose labels.
  'claude-agent-acp', 'managed-primary', 'agentcore-primary', 'codex-acp', 'agent-123',
  'paperclip', 'operator', 'operator.admin', 'ALIAS', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
  'PERSONAL_GH_TOKEN', 'MY_SECRET', 'null', 'stderr', 'stdout', 'tok',
  'CURSOR_API_KEY', 'GEMINI_API_KEY',
  'secret_provider_config.discovery.preview', 'secret.create', 'aws_secrets_manager',
  'my-paperclip-adapter', 'skill-shortname', 'piece', 'frontend', 'codespaces', 'workspace-123',
  'a1b2c3d4', 'clientsecret', 'client-secret', 'us-east-1', 'production', 'platform', 'prod',
  'paperclip-prod', 'global', 'admin', 'secret', 'code-review',
  'slot', 'sm', 'md', 'lg', 'A', 'A1', 'A2', 'A3', 'C', 'g f', 'j', 'k', 'a', 'p',
  'claude-sonnet-4-20250514', 'claude-haiku-4-20250506', '1.2M', '500k', '1.7M',
  'react-resizable-panels', 'needs_setup', 'pending_approval',
]);
function isPreserved(value) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]/.test(text)) return true;
  if (preservedNames.has(text)) return true;
  if (["claude", "codex", "gemini", "kimi", "pi", "opencode", "Arcade-User-ID"].includes(text)) return true;
  if (/^[{[]/.test(text)) { try { JSON.parse(text); return true; } catch { /* Prose can start with a bracket. */ } }
  return /^(?:https?:\/\/|[/.~]|[A-Z_][A-Z_\d]*=)/.test(text)
    || /^[\w.-]+@(?:[\w.-]+|\{\{[^}]+\}\})$/.test(text)
    || /^(?:[⌘⇧⌥⌃]+[A-Z][:]?|[·→]\s*v)$/.test(text)
    || text === '{{issue.identifier}}-{{slug}}'
    || /^{{[\w.-]+}}$/.test(text)
    || /^[\w.-]+\.(?:md|tsx?|jsx?|json|ya?ml|sh|zip|csv|txt|png|jpg)$/.test(text);
}

const report = [];
function jsxText(text) {
  const lines = text.split(/\r\n|\n|\r/);
  let last = 0;
  for (let i = 0; i < lines.length; i++) if (/\S/.test(lines[i])) last = i;
  return lines.map((line, i) => {
    let value = line.replace(/\t/g, " ");
    if (i > 0) value = value.replace(/^ +/, "");
    if (i < lines.length - 1) value = value.replace(/ +$/, "");
    return value ? value + (i < last ? " " : "") : "";
  }).join("");
}
function scan(file) {
  const source = readFileSync(file, "utf8"), name = relative(root, file);
  const ast = parseSource(source), patches = [];
  const patch = (node, value) => patches.push({ start: node.start, end: node.end, text: value });
  function visit(node, ancestors = []) {
    if (!node || typeof node !== "object") return;
    const parent = ancestors.at(-1);
    const insideCode = ancestors.some(a => a.type === "JSXElement" && ["code", "pre", "svg"].includes(a.openingElement.name.name));
    if (!insideCode && node.type === "JSXText" && !isPreserved(node.value)) {
      const value = jsxText(node.value);
      const trimmed = value.trim();
      const expression = translation(trimmed);
      patch(node, (value.startsWith(" ") ? '{" "}' : "") + `{${expression}}` + (value.endsWith(" ") ? '{" "}' : ""));
    }
    if (!insideCode && node.type === "TemplateLiteral" && parent?.type === "JSXExpressionContainer"
      && !ancestors.some(a => a.type === "JSXAttribute")) {
      const fixed = node.quasis.map(part => part.value.cooked).join(" ").trim();
      if (!isPreserved(fixed)) {
        const values = node.expressions.map((expr, i) => [`value${i + 1}`, source.slice(expr.start, expr.end)]);
        const text = node.quasis.map((part, i) => part.value.cooked + (i < values.length ? `{{value${i + 1}}}` : "")).join("");
        patch(node, translation(text, values));
      }
    }
    if (!insideCode && node.type === "StringLiteral"
      && (parent?.type === "JSXExpressionContainer"
        || (parent?.type === "ConditionalExpression" && [parent.consequent, parent.alternate].includes(node))
        || (parent?.type === "LogicalExpression" && parent.right === node))) {
      const expressionIndex = ancestors.findLastIndex(a => a.type === "JSXExpressionContainer");
      const expressionPath = ancestors.slice(expressionIndex);
      const isCondition = expressionPath.some((a, index) =>
        (a.type === "BinaryExpression" && a.operator !== "+")
        || (a.type === "ConditionalExpression" && a.test === expressionPath[index + 1])
        || (a.type === "LogicalExpression" && a.operator === "&&" && a.left === expressionPath[index + 1]));
      const isSkillSlug = /^ui\/src\/pages\/CompanySkills(?:\.production)?\.tsx$/.test(name)
        && parent?.type === "LogicalExpression" && parent.left?.name === "effectiveSlug" && node.value === "skill";
      if (expressionIndex >= 0 && !ancestors.some(a => a.type === "JSXAttribute")
        && !expressionPath.some(a => a.type === "CallExpression") && !isCondition && !isSkillSlug && !isPreserved(node.value)) patch(node, translation(node.value));
    }
    if (!insideCode && node.type === "StringLiteral" && parent?.type === "JSXAttribute"
      && ["title", "aria-label", "placeholder", "alt", "label", "description", "message", "emptyMessage"].includes(parent.name.name)
      && !isPreserved(node.value)) patch(node, `{${translation(node.value)}}`);
    const displayAttribute = [...ancestors].reverse().find(a => a.type === "JSXAttribute");
    const inDisplayAttribute = displayAttribute && ["title", "aria-label", "placeholder", "alt", "label", "description", "message", "emptyMessage"].includes(displayAttribute.name.name);
    const conditionPath = ancestors.slice(ancestors.indexOf(displayAttribute) + 1);
    const inCondition = conditionPath.some((a, index) =>
      (a.type === "BinaryExpression" && a.operator !== "+")
      || (a.type === "ConditionalExpression" && a.test === conditionPath[index + 1])
      || (a.type === "LogicalExpression" && a.operator === "&&" && a.left === conditionPath[index + 1]));
    const inCall = conditionPath.some(a => a.type === "CallExpression");
    if (inDisplayAttribute && !inCondition && !inCall && parent?.type !== "JSXAttribute"
      && node.type === "StringLiteral" && !isPreserved(node.value)) patch(node, translation(node.value));
    const displayProperty = !name.endsWith("/task-chat/transcript-adapter.ts") && parent?.type === "ObjectProperty" && parent.value === node
      && ["label", "description", "helpText", "tooltip", "emptyMessage", "buttonLabel"].includes(parent.key.name ?? parent.key.value);
    if (node.type === "TemplateLiteral" && !inCondition && !inCall && (inDisplayAttribute || displayProperty)) {
      const fixed = node.quasis.map(part => part.value.cooked).join(" ").trim();
      if (!isPreserved(fixed)) {
        const values = node.expressions.map((expr, i) => [`value${i + 1}`, source.slice(expr.start, expr.end)]);
        const text = node.quasis.map((part, i) => part.value.cooked + (i < values.length ? `{{value${i + 1}}}` : "")).join("");
        patch(node, translation(text, values));
      }
    }
    // Fixed property labels are UI copy; keys and protocol discriminators stay raw.
    if (!name.endsWith("/task-chat/transcript-adapter.ts") && node.type === "StringLiteral" && parent?.type === "ObjectProperty" && parent.value === node
      && ["label", "description", "helpText", "tooltip", "emptyMessage", "buttonLabel"].includes(parent.key.name ?? parent.key.value)
      && !isPreserved(node.value)) patch(node, translation(node.value));
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "comments", "tokens", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
      if (Array.isArray(value)) for (const child of value) visit(child, [...ancestors, node]);
      else if (value && typeof value === "object") visit(value, [...ancestors, node]);
    }
  }
  visit(ast);
  if (!patches.length) return;
  patches.sort((a, b) => a.start - b.start || b.end - a.end);
  const final = [];
  for (const item of patches) if (!final.some(p => p.start <= item.start && p.end >= item.end)) final.push(item);
  let result = source;
  for (const item of final.sort((a, b) => b.start - a.start)) result = result.slice(0, item.start) + item.text + result.slice(item.end);
  const hasTImport = ast.program.body.some(n => n.type === "ImportDeclaration" && n.specifiers.some(s => s.local.name === "t"));
  if (!hasTImport) result = 'import { t } from "@/i18n";\n' + result;
  parseSource(result);
  writeFileSync(file, result); report.push({ file: name, patches: final.length });
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory() && !["i18n", "fixtures"].includes(entry.name)) walk(file);
    else if (/\.[jt]sx?$/.test(file) && !/\.(test|spec|d)\./.test(file)) scan(file);
  }
}
walk(join(root, "ui/src"));
mkdirSync(reportDirectory, { recursive: true });
writeFileSync(join(reportDirectory, outputName), JSON.stringify({ stability: newEnglish }, null, 2) + "\n");
writeFileSync(join(reportDirectory, "ui-copy-codemod.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ files: report.length, patches: report.reduce((n, r) => n + r.patches, 0), newKeys: Object.keys(newEnglish).length }));
