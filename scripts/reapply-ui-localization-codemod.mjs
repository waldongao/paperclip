#!/usr/bin/env node
/**
 * Reapply a UI-only localization overlay to a newer product version.
 * Match syntax trees from the original, localized and target versions. A node
 * is transplanted only when the target still contains the original node's exact
 * source, so a translation cannot replace changed upstream business logic.
 * Run from the repository with BASE LOCALIZED [REPORT_DIRECTORY].
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [baseRef, localizedRef, reportDirectory] = process.argv.slice(2);
if (!baseRef || !localizedRef) throw new Error("Expected BASE LOCALIZED [REPORT_DIRECTORY]");
const uiRequire = createRequire(join(process.env.PAPERCLIP_I18N_TOOLCHAIN_ROOT ?? root, "ui/package.json"));
const pluginRequire = createRequire(uiRequire.resolve("@vitejs/plugin-react"));
const babelRequire = createRequire(pluginRequire.resolve("@babel/core"));
const { parse } = babelRequire("@babel/parser");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const at = (ref, file) => git("show", `${ref}:${file}`);
const parseSource = source => parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
const en = JSON.parse(at(localizedRef, "ui/src/i18n/locales/en.json"));
const valueAt = key => key.split(".").reduce((value, name) => value?.[name], en);
const textOf = (source, node) => source.slice(node.start, node.end);
const skipKeys = new Set(["loc", "start", "end", "extra", "comments", "tokens", "leadingComments", "trailingComments", "innerComments"]);
function displayText(node) {
  if (node?.type === "JSXText" || node?.type === "StringLiteral") return node.value.replace(/\s+/g, " ").trim();
  if (node?.type === "JSXExpressionContainer") return displayText(node.expression);
  if (node?.type === "CallExpression" && node.callee.name === "t" && node.arguments[0]?.type === "StringLiteral") {
    const value = valueAt(node.arguments[0].value);
    if (typeof value === "string" && !value.includes("{{")) return value.replace(/\s+/g, " ").trim();
  }
  return undefined;
}
function key(node) {
  if (!node?.type) return "unknown";
  const display = displayText(node);
  if (display !== undefined) return `display:${display}`;
  if (node.type === "ImportDeclaration") return `import:${node.source.value}`;
  if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") return `${node.type}:${key(node.declaration)}`;
  if (node.type === "VariableDeclaration") return `variables:${node.declarations.map(n => key(n.id)).join(",")}`;
  if (node.type === "VariableDeclarator") return `variable:${key(node.id)}`;
  if (node.type === "Identifier") return `identifier:${node.name}`;
  if (node.type === "ObjectPattern") return `pattern:${node.properties.map(n => key(n)).join(",")}`;
  if (["ObjectProperty", "ObjectMethod", "ClassMethod", "ClassProperty", "JSXAttribute"].includes(node.type)) return `${node.type}:${node.key?.name ?? node.key?.value ?? node.name?.name}`;
  if (node.type === "JSXElement" || node.type === "JSXOpeningElement" || node.type === "JSXClosingElement") {
    const element = node.openingElement ?? node;
    return `${node.type}:${element.name?.name ?? element.name?.property?.name}`;
  }
  if (node.id?.name) return `${node.type}:${node.id.name}`;
  return node.type;
}
function alignArrays(a, b, visit) {
  const left = a.filter(n => n?.type), right = b.filter(n => n?.type);
  const rows = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--)
    rows[i][j] = key(left[i]) === key(right[j]) ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  let i = 0, j = 0, pendingA = [], pendingB = [];
  const flush = () => {
    if (pendingA.length === pendingB.length) for (let n = 0; n < pendingA.length; n++) visit(pendingA[n], pendingB[n]);
    pendingA = []; pendingB = [];
  };
  while (i < left.length && j < right.length) {
    if (key(left[i]) === key(right[j])) { flush(); visit(left[i++], right[j++]); }
    else if (rows[i + 1][j] >= rows[i][j + 1]) pendingA.push(left[i++]);
    else pendingB.push(right[j++]);
  }
  pendingA.push(...left.slice(i)); pendingB.push(...right.slice(j)); flush();
}
function pairTrees(a, b, callback) {
  if (!a?.type || !b?.type) return;
  callback(a, b);
  if (a.type !== b.type) return;
  for (const name of Object.keys(a)) {
    if (skipKeys.has(name)) continue;
    const x = a[name], y = b[name];
    if (Array.isArray(x) && Array.isArray(y)) alignArrays(x, y, (oldNode, newNode) => pairTrees(oldNode, newNode, callback));
    else if (x?.type && y?.type) pairTrees(x, y, callback);
  }
}
function nodes(ast) {
  const all = [];
  function walk(node) {
    if (!node?.type) return;
    all.push(node);
    for (const [name, child] of Object.entries(node)) {
      if (skipKeys.has(name)) continue;
      if (Array.isArray(child)) child.forEach(walk);
      else if (child?.type) walk(child);
    }
  }
  walk(ast); return all;
}
const changed = git("diff", "--name-only", baseRef, localizedRef, "--", "ui/src").trim().split("\n")
  .filter(file => /\.[jt]sx?$/.test(file) && !file.includes("/i18n/") && !/\.(test|spec)\./.test(file));
const renames = new Map(git("diff", "--name-status", baseRef, "HEAD", "--", "ui").trim().split("\n").filter(line => line.startsWith("R")).map(line => { const [, oldPath, newPath] = line.split("\t"); return [oldPath, newPath]; }));
const conflicted = new Set(git("diff", "--name-only", "--diff-filter=U", "--", "ui").trim().split("\n"));
const report = [];
for (const file of changed) {
  let base, localized;
  try { base = at(baseRef, file); localized = at(localizedRef, file); }
  catch { continue; }
  const targetFile = renames.get(file) ?? file;
  const path = join(root, targetFile);
  if (!existsSync(path)) continue;
  // Only conflict resolutions start from the new release. Non-conflicted files
  // retain Git's successful three-way merge, including its newer product logic.
  let target;
  try { target = conflicted.has(targetFile) ? at("HEAD", targetFile) : readFileSync(path, "utf8"); }
  catch { unlinkSync(path); report.push({ file, deletedByRelease: true }); continue; }
  let oldAst, localAst, targetAst;
  try { oldAst = parseSource(base); localAst = parseSource(localized); targetAst = parseSource(target); }
  catch (error) { report.push({ file, error: error.message }); continue; }
  const localization = new Map(), targets = new Map();
  pairTrees(oldAst, localAst, (a, b) => {
    if (textOf(base, a) !== textOf(localized, b)) localization.set(a.start + ":" + a.end, b);
  });
  pairTrees(oldAst, targetAst, (a, b) => targets.set(a.start + ":" + a.end, b));
  const candidates = [];
  for (const node of nodes(oldAst)) {
    const id = node.start + ":" + node.end;
    const localNode = localization.get(id), targetNode = targets.get(id);
    if (!localNode || !targetNode || node.type === "File" || node.type === "Program" || node.type.startsWith("Import")) continue;
    const oldText = textOf(base, node), newText = textOf(localized, localNode), targetText = textOf(target, targetNode);
    if (oldText !== targetText || newText === targetText || oldText.length === 0) continue;
    // Ignore hook-only insertions; the plain global helper covers call sites.
    if (!/\b(?:t|i18n|useTranslation|translateDisplayMessage|getDisplayLabel|getPluralSuffix|countLabel|routine\w*Label|localize\w*|LanguageSwitcher)\b/.test(newText)) continue;
    candidates.push({ start: targetNode.start, end: targetNode.end, text: newText, old: oldText, type: node.type });
  }
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const patches = [];
  for (const candidate of candidates) {
    if (!patches.some(patch => patch.start <= candidate.start && patch.end >= candidate.end)) patches.push(candidate);
  }
  let result = target;
  for (const patch of patches.sort((a, b) => b.start - a.start)) result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
  // Import only localization-specific symbols; retain release imports verbatim.
  const targetImports = new Map();
  let resultAst = parseSource(result);
  for (const node of resultAst.program.body.filter(n => n.type === "ImportDeclaration")) {
    for (const specifier of node.specifiers) targetImports.set(specifier.local.name, true);
  }
  const availableImports = [];
  for (const node of localAst.program.body.filter(n => n.type === "ImportDeclaration")) {
    const source = node.source.value;
    if (!/i18n|display-labels|localized-|routine-policy-labels|LanguageSwitcher/.test(source)) continue;
    const specifiers = node.specifiers.filter(n => !targetImports.has(n.local.name) && new RegExp(`\\b${n.local.name}\\b`).test(result));
    if (specifiers.length) {
      availableImports.push(`import { ${specifiers.map(n => n.imported?.name === n.local.name ? n.local.name : `${n.imported?.name} as ${n.local.name}`).join(", ")} } from ${JSON.stringify(source)};`);
      specifiers.forEach(n => targetImports.set(n.local.name, true));
    }
  }
  if (/\bt\(/.test(result) && !targetImports.has("t")) availableImports.push('import { t } from "@/i18n";');
  result = availableImports.join("\n") + (availableImports.length ? "\n" : "") + result;
  parseSource(result);
  writeFileSync(path, result);
  report.push({ file, conflict: conflicted.has(targetFile), patches: patches.length, imports: availableImports });
}
if (reportDirectory) {
  mkdirSync(reportDirectory, { recursive: true });
  writeFileSync(join(reportDirectory, "ui-localization-overlay.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ files: report.length, conflicts: report.filter(r => r.conflict).length, patches: report.reduce((n, r) => n + (r.patches ?? 0), 0), errors: report.filter(r => r.error) }, null, 2));
