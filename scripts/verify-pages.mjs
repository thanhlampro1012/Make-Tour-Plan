import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Verifies emitted files as if they were served from the actual GitHub project path.
const defaultOutput = fileURLToPath(new URL("../docs/", import.meta.url));
const output = path.resolve(process.argv[2] || defaultOutput);
const base = "/Make-Tour-Plan/";
const origin = "https://pages-check.invalid";
const files = new Map();
const errors = [];
const checked = new Set();
const localAssetLiteral = /^(?:\.{0,2}\/)?[\w%+./@-]+\.(?:m?js|cjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm)(?:[?#][^\s]*)?$/i;
const external = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;

async function collect(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) { errors.push(`Symbolic link cannot be published by this branch build: ${name}`); continue; }
    if (entry.isDirectory()) await collect(absolute, name);
    else if (entry.isFile()) files.set(name, (await stat(absolute)).size);
  }
}

function checkReference(value, from, context = from) {
  const raw = value.trim().replace(/&amp;/g, "&");
  if (!raw || external.test(raw)) return;
  const key = `${from}\0${context}\0${raw}`;
  if (checked.has(key)) return;
  checked.add(key);
  let url;
  try { url = new URL(raw, `${origin}${base}${context}`); }
  catch { errors.push(`${from}: invalid asset URL ${raw}`); return; }
  if (url.origin !== origin) return;
  if (!url.pathname.startsWith(base)) {
    errors.push(`${from}: asset escapes project base ${base}: ${raw}`);
    return;
  }
  let name;
  try { name = decodeURIComponent(url.pathname.slice(base.length)); }
  catch { errors.push(`${from}: invalid percent encoding: ${raw}`); return; }
  if (!name || name.endsWith("/")) name += "index.html";
  if (!files.has(name)) errors.push(`${from}: missing asset ${raw} (resolved ${name})`);
}

function checkCss(text, from) {
  for (const match of text.matchAll(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)'";]+))\s*\)/gi)) checkReference(match[1] ?? match[2] ?? match[3], from);
  for (const match of text.matchAll(/@import\s+["']([^"']+)["']/gi)) checkReference(match[1], from);
}

function checkHtml(text, from) {
  for (const match of text.matchAll(/\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi)) checkReference(match[2], from);
  for (const match of text.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) {
    if (!match[2].startsWith("data:")) for (const item of match[2].split(",")) checkReference(item.trim().split(/\s+/)[0], from);
  }
  checkCss(text, from);
}

function checkJavaScript(text, from) {
  if (/__vite-browser-external|virtual:cloudflare|cloudflare:workers|__vite_ssr_import__|react-server-dom-webpack|vinext\/server|next\/(?:server|headers)/.test(text)) errors.push(`${from}: server runtime marker in client bundle`);
  const source = ts.createSourceFile(from, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = new Set();
  function inspect(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier);
      if (/^(?:node:|cloudflare:)/.test(node.moduleSpecifier.text)) errors.push(`${from}: server import ${node.moduleSpecifier.text}`);
      else checkReference(node.moduleSpecifier.text, from);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      imports.add(node.arguments[0]);
      checkReference(node.arguments[0].text, from);
    }
    // Vite adjusts imported assets; runtime JSX/style strings also need a valid base.
    if (ts.isStringLiteralLike(node) && !imports.has(node) && localAssetLiteral.test(node.text)) checkReference(node.text, from, "index.html");
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}

await collect(output);
assert.ok(files.has("index.html"), "docs/index.html is required at the publishing root");
assert.ok(files.has(".nojekyll"), "docs/.nojekyll is required for prebuilt static publication");
assert.ok(files.get("index.html") > 100, "The entry HTML is empty or incomplete");
assert.ok([...files.keys()].some(name => /\.js$/i.test(name)), "No emitted JavaScript bundle");
assert.ok([...files.keys()].some(name => /\.css$/i.test(name)), "No emitted stylesheet");

for (const name of files.keys()) {
  if (/(^|\/)(?:server|node_modules|\.git|\.wrangler)(\/|$)|(?:^|\/)(?:_worker\.js|wrangler\.jsonc?)$|\.(?:tsx?|map)$/i.test(name)) errors.push(`Unexpected server/source artifact: ${name}`);
  if (!/\.(?:html|css|m?js)$/i.test(name)) continue;
  const text = await readFile(path.join(output, name), "utf8");
  if (name.endsWith(".html")) checkHtml(text, name);
  else if (name.endsWith(".css")) checkCss(text, name);
  else checkJavaScript(text, name);
}

if (errors.length) {
  console.error(`Pages verification failed (${errors.length}):\n${[...new Set(errors)].map(error => `- ${error}`).join("\n")}`);
  process.exitCode = 1;
} else {
  const bytes = [...files.values()].reduce((sum, size) => sum + size, 0);
  const fonts = [...files.keys()].filter(name => /\.(?:woff2?|ttf|otf)$/i.test(name)).length;
  console.log(`Pages verified: ${files.size} files, ${checked.size} local asset references, ${fonts} font files, ${(bytes / 1024 / 1024).toFixed(2)} MiB (${bytes.toLocaleString("en-US")} bytes). Base: ${base}`);
}
