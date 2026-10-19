#!/usr/bin/env node
/** Keep browser protocols, selectors and operator setting keys independent of locale. */
import { createRequire } from "node:module";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uiRequire = createRequire(join(root, "ui/package.json"));
const reactRequire = createRequire(uiRequire.resolve("@vitejs/plugin-react"));
const babelRequire = createRequire(reactRequire.resolve("@babel/core"));
const { parse } = babelRequire("@babel/parser");
const en = JSON.parse(readFileSync(join(root, "ui/src/i18n/locales/en.json"), "utf8"));
const protocolMethods = new Set(["closest", "matches", "querySelector", "querySelectorAll", "getData", "setData", "addEventListener", "removeEventListener", "createElement"]);
let restored = 0;
function scan(file) {
  const source = readFileSync(file, "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const patches = [];
  function visit(node, parent) {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression" && node.callee?.name === "t" && node.arguments[0]?.type === "StringLiteral"
      && parent?.type === "CallExpression" && parent.arguments.includes(node)) {
      const method = parent.callee?.property?.name;
      const object = parent.callee?.object?.name;
      const argumentIndex = parent.arguments.indexOf(node);
      const protocol = (parent.callee?.name === "providerItemDetail" && argumentIndex === 1) || (protocolMethods.has(method) && argumentIndex === 0)
        || (method === "has" && ["types", "hiddenSettings"].includes(object))
        || (method === "open" && object === "window");
      const english = node.arguments[0].value.split(".").reduce((value, part) => value?.[part], en);
      if (protocol && typeof english === "string" && !english.includes("{{")) patches.push({ start: node.start, end: node.end, value: JSON.stringify(english) });
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "comments", "tokens", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, node));
      else if (value && typeof value === "object") visit(value, node);
    }
  }
  visit(ast);
  if (!patches.length) return;
  let result = source;
  for (const patch of patches.sort((a, b) => b.start - a.start)) result = result.slice(0, patch.start) + patch.value + result.slice(patch.end);
  writeFileSync(file, result);
  restored += patches.length;
  console.log(`${relative(root, file)}: restored ${patches.length} protocol literals`);
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory() && !["i18n", "fixtures"].includes(entry.name)) walk(file);
    else if (/\.[jt]sx?$/.test(file) && !/\.(test|spec|d)\./.test(file)) scan(file);
  }
}
walk(join(root, "ui/src"));
console.log(`Restored ${restored} browser and setting protocol literals.`);
