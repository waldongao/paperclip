#!/usr/bin/env node
// Verify catalog coverage and the user-facing JSX copy in the Chinese build.
// Reuse the parser already required by Vite's React plugin; no extra package.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiRequire = createRequire(join(root, 'ui/package.json'));
const reactRequire = createRequire(uiRequire.resolve('@vitejs/plugin-react'));
const babelRequire = createRequire(reactRequire.resolve('@babel/core'));
const { parse } = babelRequire('@babel/parser');
function flatten(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
}
const en = new Map(flatten(JSON.parse(readFileSync(join(root, 'ui/src/i18n/locales/en.json'), 'utf8'))));
const zh = new Map(flatten(JSON.parse(readFileSync(join(root, 'ui/src/i18n/locales/zh-CN.json'), 'utf8'))));
const errors = [];
const hasMessage = (catalog, key) => catalog.has(key)
  || (catalog.has(`${key}_one`) && catalog.has(`${key}_other`));
for (const key of en.keys()) if (!zh.has(key)) errors.push(`Missing Chinese key: ${key}`);
for (const key of zh.keys()) if (!en.has(key)) errors.push(`Unknown Chinese key: ${key}`);

// Names, protocols, programming languages, units, example URLs and source code
// intentionally retain their spelling. Code/pre and SVG text are also exempt.
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
  return /^(?:https?:\/\/|[/.~]|[A-Z_][A-Z_\d]*=)/.test(text)
    || /^[\w.-]+@(?:[\w.-]+|\{\{[^}]+\}\})$/.test(text)
    || /^(?:[⌘⇧⌥⌃]+[A-Z][:]?|[·→]\s*v)$/.test(text)
    || text === '{{issue.identifier}}-{{slug}}'
    || /^{{[\w.-]+}}$/.test(text)
    || /^[\w.-]+\.(?:md|tsx?|jsx?|json|ya?ml|sh|zip|csv|txt|png|jpg)$/.test(text);
}
let files = 0, calls = 0;
function walkFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['i18n', 'fixtures'].includes(entry.name)) walkFiles(path);
    } else if (/\.(tsx?|jsx?)$/.test(path) && !/\.(?:test|spec|d)\./.test(path)) scan(path);
  }
}
function scan(file) {
  files++;
  const name = relative(root, file);
  const source = readFileSync(file, 'utf8');
  let ast;
  try { ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }); }
  catch (error) { errors.push(`${name}: ${error.message}`); return; }
  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    const parent = ancestors.at(-1);
    if (node.type === 'CallExpression' && node.callee?.name === 'useTranslation') {
      const owners = ancestors.map((value, index) => ({ value, index }))
        .filter(({ value }) => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(value.type));
      const owner = owners.at(-1);
      const ownerName = owner?.value.id?.name ?? ancestors[(owner?.index ?? 0) - 1]?.id?.name;
      // Nested callbacks must use their component's t or the plain t helper.
      // A nested component is valid only when React renders its capitalized name.
      if (!owner || (owners.length > 1 && !/^[A-Z]/.test(ownerName ?? ''))
        || !/^(?:[A-Z]|use[A-Z])/.test(ownerName ?? '')) {
        errors.push(`${name}:${node.loc.start.line}: Translation hook outside a component or custom hook`);
      }
    }
    if (node.type === 'CallExpression' && (node.callee?.name === 't' || node.callee?.property?.name === 't') && node.arguments[0]?.type === 'StringLiteral') {
      calls++;
      const key = node.arguments[0].value;
      if (!hasMessage(en, key) || !hasMessage(zh, key)) errors.push(`${name}:${node.loc.start.line}: Missing translation key ${key}`);
    }
    const insideCode = ancestors.some((ancestor) => ancestor.type === 'JSXElement' && ['code', 'pre', 'svg'].includes(ancestor.openingElement.name.name));
    if (!insideCode && node.type === 'JSXText' && !isPreserved(node.value)) {
      errors.push(`${name}:${node.loc.start.line}: Untranslated JSX text ${JSON.stringify(node.value.trim())}`);
    }
    if (!insideCode && node.type === 'TemplateLiteral' && parent?.type === 'JSXExpressionContainer'
      && !ancestors.some((ancestor) => ancestor.type === 'JSXAttribute')) {
      const fixed = node.quasis.map((part) => part.value.cooked).join(' ').trim();
      if (!isPreserved(fixed)) errors.push(`${name}:${node.loc.start.line}: Untranslated JSX template ${JSON.stringify(fixed)}`);
    }
    if (!insideCode && node.type === 'StringLiteral'
      && (parent?.type === 'JSXExpressionContainer'
        || (parent?.type === 'ConditionalExpression' && [parent.consequent, parent.alternate].includes(node))
        || (parent?.type === 'LogicalExpression' && parent.right === node))) {
      const expressionIndex = ancestors.findLastIndex((ancestor) => ancestor.type === 'JSXExpressionContainer');
      const expressionPath = ancestors.slice(expressionIndex);
      const isCondition = expressionPath.some((ancestor, index) =>
        (ancestor.type === 'BinaryExpression' && ancestor.operator !== '+')
        || (ancestor.type === 'ConditionalExpression' && ancestor.test === expressionPath[index + 1])
        || (ancestor.type === 'LogicalExpression' && ancestor.operator === '&&' && ancestor.left === expressionPath[index + 1]));
      // This preview shows the same fallback slug used in the create payload.
      // Translating it would misrepresent the machine identifier being saved.
      const isSkillSlug = /^ui\/src\/pages\/CompanySkills(?:\.production)?\.tsx$/.test(name)
        && parent?.type === 'LogicalExpression' && parent.left?.name === 'effectiveSlug'
        && node.value === 'skill';
      const displayExpression = expressionIndex >= 0
        && !ancestors.some((ancestor) => ancestor.type === 'JSXAttribute')
        && !expressionPath.some((ancestor) => ancestor.type === 'CallExpression')
        && !isCondition && !isSkillSlug;
      if (displayExpression && !isPreserved(node.value)) {
        errors.push(`${name}:${node.loc.start.line}: Untranslated JSX expression ${JSON.stringify(node.value)}`);
      }
    }
    if (node.type === 'StringLiteral' && parent?.type === 'JSXAttribute'
      && ['title', 'aria-label', 'placeholder', 'alt', 'label', 'description', 'message', 'emptyMessage'].includes(parent.name.name)
      && !isPreserved(node.value)) {
      errors.push(`${name}:${node.loc.start.line}: Untranslated ${parent.name.name} ${JSON.stringify(node.value)}`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'comments', 'tokens', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
      if (Array.isArray(value)) for (const child of value) visit(child, [...ancestors, node]);
      else if (value && typeof value === 'object') visit(value, [...ancestors, node]);
    }
  }
  visit(ast);
}
walkFiles(join(root, 'ui/src'));
const cliMessages = JSON.parse(readFileSync(join(root, 'cli/src/locales/zh-CN.json'), 'utf8'));
const placeholders = (text) => [...text.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((match) => match[1]).sort().join('|');
for (const [english, chinese] of Object.entries(cliMessages)) {
  if (typeof chinese !== 'string' || placeholders(english) !== placeholders(chinese)) {
    errors.push(`CLI interpolation mismatch: ${english}`);
  }
}
let cliFiles = 0, cliCalls = 0;
function scanCli(file) {
  cliFiles++;
  const source = readFileSync(file, 'utf8');
  const name = relative(root, file);
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression') {
      const callee = node.callee?.name ?? node.callee?.property?.name;
      if (callee === 'tCli' && node.arguments[0]?.type === 'StringLiteral') {
        cliCalls++;
        if (!(node.arguments[0].value in cliMessages)) errors.push(`${name}:${node.loc.start.line}: Missing Chinese CLI message ${node.arguments[0].value}`);
      }
      const helpIndex = callee === 'description' ? 0 : ['option', 'argument', 'addHelpText'].includes(callee) ? 1 : -1;
      const raw = node.arguments[helpIndex];
      if (raw?.type === 'StringLiteral' && !isPreserved(raw.value)) {
        errors.push(`${name}:${node.loc.start.line}: Untranslated CLI help ${JSON.stringify(raw.value)}`);
      }
      if (node.callee?.object?.name === 'console' && ['log', 'warn', 'error', 'info'].includes(callee)) {
        for (const argument of node.arguments) {
          const text = argument.type === 'StringLiteral' ? argument.value
            : argument.type === 'TemplateLiteral' ? argument.quasis.map((part) => part.value.cooked).join(' ') : '';
          if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text) && !isPreserved(text)) {
            errors.push(`${name}:${node.loc.start.line}: Untranslated CLI output ${JSON.stringify(text)}`);
          }
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'comments', 'tokens', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
      if (Array.isArray(value)) for (const child of value) visit(child, [...ancestors, node]);
      else if (value && typeof value === 'object') visit(value, [...ancestors, node]);
    }
  }
  visit(ast);
}
function walkCli(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['locales', 'fixtures'].includes(entry.name)) walkCli(path);
    } else if (/\.ts$/.test(path) && !/\.(?:test|spec|d)\./.test(path)) scanCli(path);
  }
}
walkCli(join(root, 'cli/src'));
console.log(`Chinese localization: ${en.size} English keys, ${zh.size} Chinese keys, ${files} source files, ${calls} translation calls.`);
console.log(`CLI localization: ${Object.keys(cliMessages).length} messages, ${cliFiles} source files, ${cliCalls} translation calls.`);
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`${errors.length} coverage issues remain.`);
  process.exitCode = 1;
} else console.log('Catalog coverage, referenced keys, JSX text and accessible copy passed.');
