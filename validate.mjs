#!/usr/bin/env node
// Validates the TuboApp plugin package. Node only, no dependencies.
// Usage: node plugin/validate.mjs            (from the repo root)
//        TUBO_CONTRACT=<path to CONTRACT.md> node plugin/validate.mjs   (also cross-checks the tool list)
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, relative, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// The `user` rows of the shared contract's tool permission table (v1, 2026-11-20).
const USER_TOOLS = new Set([
  "whoami", "get_stats", "search_videos", "get_video", "list_channels", "get_channel",
  "list_channel_videos", "list_channel_groups", "get_sync_status", "get_sync_job",
  "list_sync_history", "get_quota_status", "list_ab_tests", "get_ab_test_insights",
  "list_title_changes", "list_thumbnail_changes", "list_folders", "get_folder_items",
  "list_bookmarks", "create_folder", "update_folder", "add_bookmark", "move_bookmark",
  "add_tracked_channel", "queue_channel_sync", "set_channel_group", "toggle_channel_favorite",
  "set_primary_channel",
]);
// Admin-only tools a plugin user never gets. Any mention of these in a skill is an error.
const ADMIN_TOOLS = [
  "delete_tracked_channel", "remove_bookmark", "delete_folder", "delete_ab_test",
  "update_ab_test_variants", "retry_failed_channel", "get_engagement_coverage",
  "generate_title_ideas", "analyze_content_gaps", "set_channel_niche", "canonical_channel_action",
  "read_canonical_channel", "check_channel_identities", "get_scheduler_status",
  "list_competitors", "search_articles", "get_article", "trigger_scrape",
];
// Backticked snake_case words that are tool arguments or values, not tool names.
const NON_TOOL_IDENTIFIERS = new Set([]);
const CLAUDE_AI_FRONTMATTER = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
const MCP_URL = "https://tuboapp-mcp-production.up.railway.app/mcp";

const errors = [];
const warnings = [];
const ok = [];
const rel = (p) => relative(join(root, ".."), p).split("\\").join("/");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!kv) return { error: `unparseable frontmatter line: ${line}` };
    let value = kv[2].trim();
    const key = kv[1];
    if (Object.hasOwn(fields, key)) return { error: `duplicate frontmatter key: ${key}` };
    const quoted = value.startsWith('"') || value.startsWith("'");
    if (value.startsWith('"')) {
      // JSON strings are a strict subset of YAML double-quoted scalars.
      try { value = JSON.parse(value); }
      catch { return { error: `invalid double-quoted frontmatter value for ${key}` }; }
    } else if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(value)) return { error: `invalid single-quoted frontmatter value for ${key}` };
      value = value.slice(1, -1).replace(/''/g, "'");
    } else if (/:(?:\s|$)|(?:^|[ \t])#/.test(value)) {
      return { error: `unquoted frontmatter value for ${key} contains ': ' or ' #'` };
    } else if (/^[\[\]{}&*!|>@`%]/.test(value)) {
      return { error: `unsupported frontmatter scalar for ${key}; quote the value` };
    }
    if (key === "description" && !quoted) return { error: "description must be quoted" };
    fields[kv[1]] = value;
  }
  return { fields, body: text.slice(match[0].length) };
}

// 0. Optional cross-check of the embedded user list against the contract file.
if (process.env.TUBO_CONTRACT) {
  const contract = readFileSync(process.env.TUBO_CONTRACT, "utf8");
  const fromContract = new Set([...contract.matchAll(/^\|\s*([a-z_]+)\s*\|\s*user\s*\|/gm)].map((m) => m[1]));
  const missing = [...fromContract].filter((t) => !USER_TOOLS.has(t));
  const extra = [...USER_TOOLS].filter((t) => !fromContract.has(t));
  if (missing.length || extra.length) errors.push(`contract user tools differ: missing ${missing.join(",") || "none"}, extra ${extra.join(",") || "none"}`);
  else ok.push(`embedded user tool list matches contract (${fromContract.size} tools)`);
}

// 1. Skills.
const skillsDir = join(root, "skills");
const skillDirs = existsSync(skillsDir) ? readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()) : [];
if (!skillDirs.length) errors.push("no skills found under plugin/skills");
for (const dir of skillDirs) {
  const file = join(skillsDir, dir, "SKILL.md");
  if (!existsSync(file)) { errors.push(`${rel(join(skillsDir, dir))}: missing SKILL.md`); continue; }
  const text = readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) { errors.push(`${rel(file)}: no YAML frontmatter`); continue; }
  if (fm.error) { errors.push(`${rel(file)}: ${fm.error}`); continue; }
  const { name, description } = fm.fields;
  if (name !== dir) errors.push(`${rel(file)}: name "${name}" does not match folder "${dir}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? "") || (name ?? "").length > 64) errors.push(`${rel(file)}: name must be lowercase kebab-case, 64 chars or fewer`);
  if (!description) errors.push(`${rel(file)}: missing description`);
  else if (description.length > 1024) errors.push(`${rel(file)}: description is ${description.length} chars (max 1024)`);
  for (const key of Object.keys(fm.fields)) {
    if (!CLAUDE_AI_FRONTMATTER.has(key)) errors.push(`${rel(file)}: frontmatter key "${key}" would be rejected by claude.ai skill upload`);
  }
  const lines = text.split(/\r?\n/).length;
  if (lines > 130) warnings.push(`${rel(file)}: ${lines} lines (target is about 120)`);

  // Tool references: every backticked snake_case identifier must be a user tool.
  const referenced = new Set();
  for (const m of text.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)) {
    const id = m[1];
    if (NON_TOOL_IDENTIFIERS.has(id)) continue;
    if (USER_TOOLS.has(id)) referenced.add(id);
    else errors.push(`${rel(file)}: references \`${id}\`, which is not a user tool in the contract`);
  }
  for (const admin of ADMIN_TOOLS) {
    if (new RegExp(`\\b${admin}\\b`).test(text)) errors.push(`${rel(file)}: mentions admin-only tool ${admin}`);
  }
  if (/`whoami`/.test(text)) referenced.add("whoami");
  else errors.push(`${rel(file)}: does not tell the model to call whoami`);
  ok.push(`${rel(file)}: name ok, description ${description?.length ?? 0} chars, ${lines} lines, tools: ${[...referenced].sort().join(", ")}`);
}

// 2. Whole-package text checks: no em dash, no secrets.
const textExt = new Set([".md", ".json", ".mjs", ".js", ".txt", ""]);
const errorsBeforeText = errors.length;
for (const file of walk(root)) {
  if (!textExt.has(extname(file))) continue;
  const text = readFileSync(file, "utf8");
  if (file !== fileURLToPath(import.meta.url)) {
    const lineNo = text.split(/\r?\n/).findIndex((l) => l.includes("\u2014"));
    if (lineNo >= 0) errors.push(`${rel(file)}:${lineNo + 1}: contains an em dash (U+2014)`);
  }
  if (/tubo_mcp_[A-Za-z0-9_-]{20,}/.test(text)) errors.push(`${rel(file)}: contains something shaped like a personal key`);
  if (/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/.test(text)) errors.push(`${rel(file)}: contains something shaped like a JWT`);
  if (/Bearer\s+[A-Za-z0-9._-]{20,}/.test(text)) errors.push(`${rel(file)}: contains what looks like a bearer token`);
}
if (errors.length === errorsBeforeText) ok.push("package text: no em dash, no key, JWT or bearer token shapes");

// 3. plugin.json
const manifestPath = join(root, ".claude-plugin", "plugin.json");
let claudeManifest;
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  claudeManifest = manifest;
  if (manifest.name !== "tuboapp") errors.push(`plugin.json: name is "${manifest.name}", expected "tuboapp"`);
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  if (typeof manifest.version !== "string" || !semver.test(manifest.version)) errors.push("plugin.json: version must be a valid semantic version");
  if (!manifest.description) errors.push("plugin.json: missing description");
  if (typeof manifest.author !== "object" || !manifest.author?.name) errors.push("plugin.json: author must be an object with name");
  try { new URL(manifest.homepage); } catch { errors.push("plugin.json: homepage must parse as a URL"); }
  ok.push(`plugin.json parses: ${manifest.name} ${manifest.version}`);
} catch (error) {
  errors.push(`plugin.json: ${error.message}`);
}

// 4. .mcp.json
try {
  const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
  const server = mcp?.mcpServers?.tuboapp;
  if (!server) errors.push(".mcp.json: missing mcpServers.tuboapp");
  else {
    if (server.type !== "http") errors.push(`.mcp.json: tuboapp type is "${server.type}", expected "http"`);
    if (server.url !== MCP_URL) errors.push(`.mcp.json: tuboapp url is "${server.url}", expected ${MCP_URL}`);
    if ("headers" in server || "headersHelper" in server) errors.push(".mcp.json: tuboapp must not set headers (OAuth sign-in handles auth)");
  }
  ok.push(".mcp.json parses: tuboapp http server, no headers");
} catch (error) {
  errors.push(`.mcp.json: ${error.message}`);
}

// 5. Portable Agent Plugins manifest and MCP configuration.
let portableManifest;
try {
  portableManifest = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
  if (portableManifest.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") errors.push("root plugin.json: wrong Agent Plugins schema");
  for (const key of ["name", "version", "description", "author", "homepage", "keywords"]) {
    if (!Object.hasOwn(portableManifest, key) || JSON.stringify(portableManifest[key]) !== JSON.stringify(claudeManifest?.[key])) errors.push(`root plugin.json: ${key} must match .claude-plugin/plugin.json`);
  }
  ok.push(`root plugin.json parses: ${portableManifest.name} ${portableManifest.version}, metadata matches Claude`);
} catch (error) { errors.push(`root plugin.json: ${error.message}`); }

try {
  const mcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
  if (mcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") errors.push("mcp.json: wrong Agent Plugins schema");
  const server = mcp?.mcpServers?.tuboapp;
  if (!server) errors.push("mcp.json: missing mcpServers.tuboapp");
  else {
    if (server.type !== "streamable-http") errors.push('mcp.json: tuboapp type must be "streamable-http"');
    if (server.url !== MCP_URL) errors.push(`mcp.json: tuboapp url must be ${MCP_URL}`);
    if ("headers" in server || "headersHelper" in server) errors.push("mcp.json: tuboapp must not set headers (OAuth sign-in handles auth)");
  }
  ok.push("mcp.json parses: tuboapp streamable-http server, no headers");
} catch (error) { errors.push(`mcp.json: ${error.message}`); }

// 6. Both catalogs are rooted at this package, including after mirroring it.
for (const [file, codex] of [[".claude-plugin/marketplace.json", false], [".agents/plugins/marketplace.json", true]]) {
  try {
    const catalog = JSON.parse(readFileSync(join(root, file), "utf8"));
    if (catalog.name !== "tuboapp-marketplace") errors.push(`${file}: name must be tuboapp-marketplace`);
    if (!codex && catalog.owner?.name !== "TuboApp") errors.push(`${file}: owner.name must be TuboApp`);
    if (!Array.isArray(catalog.plugins) || catalog.plugins.length !== 1) throw new Error("expected exactly one plugin entry");
    const entry = catalog.plugins[0];
    if (entry.name !== claudeManifest?.name || entry.name !== portableManifest?.name) errors.push(`${file}: plugin name must match both manifests`);
    if (Object.hasOwn(entry, "version")) errors.push(`${file}: version belongs in plugin.json, not the marketplace entry`);
    if (!codex && entry.description !== claudeManifest?.description) errors.push(`${file}: description must match plugin.json`);
    if (codex) {
      if (entry.source?.source !== "local") errors.push(`${file}: source.source must be local`);
      if (entry.policy?.installation !== "AVAILABLE" || entry.policy?.authentication !== "ON_INSTALL") errors.push(`${file}: policy must be AVAILABLE and ON_INSTALL`);
      if (entry.category !== "Productivity") errors.push(`${file}: category must be Productivity`);
    }
    const source = codex ? entry.source?.path : entry.source;
    if (typeof source !== "string" || !source.startsWith("./")) throw new Error("source must be a ./-prefixed local path");
    const target = realpathSync(resolve(root, source));
    if (target !== realpathSync(root)) throw new Error("source must resolve to the plugin package root");
    if (!existsSync(join(target, codex ? "plugin.json" : ".claude-plugin/plugin.json"))) throw new Error("source has no plugin manifest");
    ok.push(`${file} parses: tuboapp-marketplace, tuboapp source resolves to package root`);
  } catch (error) { errors.push(`${file}: ${error.message}`); }
}

for (const line of ok) console.log(`ok    ${line}`);
for (const line of warnings) console.log(`warn  ${line}`);
for (const line of errors) console.log(`FAIL  ${line}`);
console.log(errors.length ? `\n${errors.length} error(s), ${warnings.length} warning(s)` : `\nAll checks passed (${warnings.length} warning(s)).`);
process.exit(errors.length ? 1 : 0);
