import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * One deployment = one org = one Slack workspace.
 *
 * - Your own install: org is Lane Growth, `clients` lists every client you run.
 * - A client install: org is the client, `clients` is usually just their own brand(s).
 *
 * Same code, different YAML. That is how one product serves a freelancer and a CMO.
 */

const Goals = z.record(z.string(), z.union([z.number(), z.string()])).default({});

const Client = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  slackChannel: z.string().optional(), // channel ID (C0123...) or name (#client)
  domains: z.array(z.string()).default([]), // email domains that identify this client
  accounts: z.record(z.string(), z.string()).default({}), // e.g. googleAds: "123-456-7890", hubspotPortal: "...", todoistProject: "..."
  goals: Goals, // e.g. leadsPerMonth: 150, callsPerMonth: 120, monthlyBudget: 30000
  paused: z.array(z.string()).default([]), // channels to skip, e.g. ["meta"]
  notes: z.string().optional(),
});

const Job = z.object({
  id: z.string(),
  skill: z.string(), // file in skills/ (without .md)
  cron: z.string(), // node-cron expression, evaluated in org timezone
  enabled: z.boolean().default(true),
  model: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  clients: z.array(z.string()).optional(), // limit to these client slugs; default all
  /** Cheap gate: run this skill first on a small model; it must answer RUN or SKIP. */
  precheck: z.string().optional(),
  extra: z.string().optional(), // extra instructions appended to the skill
});

const OrgConfig = z.object({
  org: z.object({
    name: z.string(),
    timezone: z.string().default("America/Los_Angeles"),
    composioUserId: z.string(), // whose connected accounts the agent uses
    voice: z.string().default(""), // how to write "in my voice"
  }),
  owner: z.object({
    name: z.string(),
    slackUserId: z.string(), // U0123... gets approvals + DMs
    email: z.string().optional(),
  }),
  agent: z
    .object({
      name: z.string().default("Lane"),
      /** Composio tool slugs that may run without approval even though they write (e.g. drafts). */
      autoApprove: z.array(z.string()).default(["GMAIL_CREATE_EMAIL_DRAFT"]),
      /** Slugs that look like writes but are actually reads (e.g. report-query endpoints). */
      treatAsRead: z.array(z.string()).default([]),
      /** Composio's remote workbench can call any tool from code, bypassing the approval gate. Off by default. */
      allowWorkbench: z.boolean().default(false),
      /** Email senders allowed to give the agent work over email. Everyone else is ignored. */
      emailAllowlist: z.array(z.string()).default([]),
      /** Composio user id whose Gmail sends the agent's own email replies. */
      mailboxComposioUserId: z.string().optional(),
    })
    .default({ name: "Lane", autoApprove: ["GMAIL_CREATE_EMAIL_DRAFT"], treatAsRead: [], allowWorkbench: false, emailAllowlist: [] }),
  clients: z.array(Client).default([]),
  jobs: z.array(Job).default([]),
});

export type OrgConfig = z.infer<typeof OrgConfig>;
export type Client = z.infer<typeof Client>;
export type Job = z.infer<typeof Job>;

export const env = {
  model: process.env.AGENT_MODEL || "claude-opus-5-5",
  effort: (process.env.AGENT_EFFORT || "medium") as Job["effort"],
  composioApiKey: process.env.COMPOSIO_API_KEY || "",
  slackBotToken: process.env.SLACK_BOT_TOKEN || "",
  slackAppToken: process.env.SLACK_APP_TOKEN || "",
  emailPort: Number(process.env.EMAIL_WEBHOOK_PORT || 0),
  emailToken: process.env.EMAIL_WEBHOOK_TOKEN || "",
  dataDir: resolve(process.env.DATA_DIR || "data"),
  skillsDir: resolve(process.env.SKILLS_DIR || "skills"),
  orgConfigPath: resolve(process.env.ORG_CONFIG || "config/org.yaml"),
};

let cached: OrgConfig | undefined;
export function loadConfig(path = env.orgConfigPath): OrgConfig {
  if (!cached) cached = OrgConfig.parse(parse(readFileSync(path, "utf8")));
  return cached;
}

export function clientBySlug(cfg: OrgConfig, slug: string) {
  return cfg.clients.find((c) => c.slug === slug);
}

/** Map a Slack channel (ID or name) to a client, so "@Lane how's pacing?" in #acme means Acme. */
export function clientForChannel(cfg: OrgConfig, channelId: string, channelName?: string) {
  return cfg.clients.find(
    (c) =>
      c.slackChannel &&
      (c.slackChannel === channelId || c.slackChannel.replace(/^#/, "") === channelName?.replace(/^#/, "")),
  );
}
