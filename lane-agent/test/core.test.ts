import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cron from "node-cron";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "lane-test-"));
process.env.ORG_CONFIG = "config/org.example.yaml";

const { loadConfig } = await import("../src/config.ts");
const { makeGuard, isReadSlug } = await import("../src/guard.ts");
const { loadSkill, systemPrompt } = await import("../src/prompts.ts");
const { writeMemory, readMemory } = await import("../src/store.ts");
const cfg = loadConfig();
const opts = { signal: new AbortController().signal } as never;

test("example config parses, crons are valid, every skill exists", () => {
  for (const j of cfg.jobs) {
    assert.ok(cron.validate(j.cron), j.id);
    loadSkill(j.skill);
    if (j.precheck) loadSkill(j.precheck);
  }
});

test("read/write classification", () => {
  for (const s of ["GMAIL_FETCH_EMAILS", "HUBSPOT_LIST_CONTACTS", "GOOGLEADS_RUN_GAQL_QUERY", "METAADS_GET_INSIGHTS"]) assert.ok(isReadSlug(s, cfg), s);
  for (const s of ["GOOGLEADS_UPDATE_CAMPAIGN_BUDGET", "GMAIL_SEND_EMAIL", "TODOIST_CREATE_TASK", "HUBSPOT_DELETE_CONTACT"]) assert.ok(!isReadSlug(s, cfg), s);
});

test("guard blocks writes, allows reads and drafts, blocks workbench", async () => {
  const g = makeGuard(cfg);
  const exec = "mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL";
  const mixed = await g(exec, { tools: [{ tool_slug: "GMAIL_FETCH_EMAILS" }, { tool_slug: "GOOGLEADS_UPDATE_CAMPAIGN_BUDGET" }] }, opts);
  assert.equal(mixed.behavior, "deny");
  assert.match(mixed.behavior === "deny" ? mixed.message : "", /propose_action/);
  assert.equal((await g(exec, { tools: [{ tool_slug: "GMAIL_FETCH_EMAILS" }] }, opts)).behavior, "allow");
  assert.equal((await g(exec, { tools: [{ tool_slug: "GMAIL_CREATE_EMAIL_DRAFT" }] }, opts)).behavior, "allow");
  assert.equal((await g("mcp__composio__COMPOSIO_REMOTE_WORKBENCH", {}, opts)).behavior, "deny");
  assert.equal((await g("mcp__composio__COMPOSIO_PROXY_EXECUTE", { method: "POST" }, opts)).behavior, "deny");
  assert.equal((await g("mcp__composio__COMPOSIO_SEARCH_TOOLS", {}, opts)).behavior, "allow");
});

test("memory sections append and replace", () => {
  writeMemory("org", "Naming", "- Campaigns: <Client>_<Channel>_<Goal>", "append");
  writeMemory("org", "Naming", "- Ad groups split by match type", "append");
  writeMemory("org", "Tools", "- HubSpot is the CRM", "append");
  let mem = readMemory("org");
  assert.match(mem, /## Naming\n- Campaigns.*\n- Ad groups/);
  writeMemory("org", "Naming", "- Replaced", "replace");
  mem = readMemory("org");
  assert.ok(!mem.includes("Ad groups"));
  assert.match(mem, /## Naming\n- Replaced/);
  assert.match(mem, /## Tools\n- HubSpot/);
  assert.match(systemPrompt(cfg), /HubSpot is the CRM/);
});
