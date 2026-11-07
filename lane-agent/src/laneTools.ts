import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { isAbsolute, join, resolve } from "node:path";
import { proposeAction } from "./approvals.js";
import { loadConfig } from "./config.js";
import { post, uploadFile, dmChannel } from "./slack.js";
import { getState, setState, writeMemory, logChange, readChanges, workspaceDir, type MemoryScope } from "./store.js";

export type RunContext = {
  /** Where replies go by default (the thread you were asked in, or the job's channel). */
  channel?: string;
  thread_ts?: string;
  /** Client the run is about, when known. */
  client?: string;
};

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export function laneServer(ctx: RunContext) {
  const cfg = loadConfig();
  const scope = z
    .string()
    .describe('"org" for tools, naming, preferences and people; "client:<slug>" for one client')
    .refine((s) => s === "org" || cfg.clients.some((c) => `client:${c.slug}` === s), "unknown scope");

  return createSdkMcpServer({
    name: "lane",
    version: "0.1.0",
    tools: [
      tool(
        "update_memory",
        "Save something worth remembering next time: tool/account IDs, naming conventions, preferences, corrections the owner gave you, who's who. Keep entries short and factual. Use mode=replace to rewrite a whole section when it has gone stale.",
        { scope, section: z.string(), content: z.string(), mode: z.enum(["append", "replace"]).default("append") },
        async ({ scope, section, content, mode }) => {
          writeMemory(scope as MemoryScope, section, content, mode);
          return text(`Saved to ${scope} / ${section}.`);
        },
      ),
      tool(
        "get_state",
        "Read a job checkpoint, e.g. 'meeting-prep:prepped' or 'perf-sweep:last-findings:<client>'.",
        { key: z.string() },
        async ({ key }) => text(JSON.stringify(getState(key) ?? null)),
      ),
      tool(
        "set_state",
        "Write a job checkpoint so the next run doesn't redo work (threads already drafted, meetings already prepped, last findings).",
        { key: z.string(), value: z.any() },
        async ({ key, value }) => {
          setState(key, value);
          return text("ok");
        },
      ),
      tool(
        "propose_action",
        "File a change for the owner's approval instead of doing it: budget/bid/status changes, CRM writes, sending email, creating tasks, publishing, anything irreversible. Give the exact Composio tool slug and arguments that should run if approved. One call per change.",
        {
          title: z.string().describe("One line, e.g. 'Raise Brand Search budget $150 -> $200/day'"),
          why: z.string().describe("The numbers behind it and the expected impact"),
          tool_slug: z.string(),
          arguments: z.record(z.string(), z.any()),
          client: z.string().optional(),
          channel: z.string().optional().describe("Defaults to the current conversation / job channel"),
          thread_ts: z.string().optional(),
        },
        async (a) => {
          const id = await proposeAction({
            title: a.title,
            why: a.why,
            toolSlug: a.tool_slug,
            arguments: a.arguments,
            client: a.client ?? ctx.client,
            channel: a.channel ?? ctx.channel,
            thread_ts: a.thread_ts ?? ctx.thread_ts,
          });
          return text(`Approval ${id} posted. Don't wait for it; continue.`);
        },
      ),
      tool(
        "slack_post",
        "Post a message to Slack. Use for job deliverables: a short summary message, then details as replies in its thread (pass the returned ts as thread_ts). channel may be an ID, '#name', or 'owner' for the owner's DM. Use Slack mrkdwn (*bold*, bullets, no markdown tables).",
        {
          channel: z.string().optional(),
          text: z.string(),
          thread_ts: z.string().optional(),
          mention_owner: z.boolean().default(false).describe("Only for urgent items or when the owner must act"),
        },
        async ({ channel, text: body, thread_ts, mention_owner }) => {
          const target = channel === "owner" ? await dmChannel(cfg.owner.slackUserId) : (channel ?? ctx.channel);
          if (!target) return text("No channel in context; pass channel.");
          const msg = await post({
            channel: target,
            thread_ts: thread_ts ?? (channel ? undefined : ctx.thread_ts),
            text: mention_owner ? `<@${cfg.owner.slackUserId}> ${body}` : body,
          });
          return text(JSON.stringify(msg));
        },
      ),
      tool(
        "slack_upload",
        "Upload a file you wrote in the workspace (report PDF/HTML/CSV/markdown) to Slack.",
        { path: z.string(), channel: z.string().optional(), thread_ts: z.string().optional(), title: z.string().optional(), comment: z.string().optional() },
        async ({ path, channel, thread_ts, title, comment }) => {
          const ws = workspaceDir();
          const full = resolve(isAbsolute(path) ? path : join(ws, path));
          if (!full.startsWith(ws)) return text("Files must be inside the workspace.");
          const target = channel === "owner" ? await dmChannel(cfg.owner.slackUserId) : channel ?? ctx.channel;
          if (!target) return text("No channel in context; pass channel.");
          await uploadFile({ channel: target, thread_ts: thread_ts ?? ctx.thread_ts, path: full, title, comment });
          return text("uploaded");
        },
      ),
      tool(
        "log_change",
        "Record a change you observed the owner make in an account (e.g. they applied a recommendation). Weekly reports only cite logged changes.",
        { what: z.string(), client: z.string().optional() },
        async ({ what, client }) => {
          logChange({ what, client: client ?? ctx.client, source: "observed" });
          return text("logged");
        },
      ),
      tool(
        "read_changes",
        "List logged changes (approved actions + observed changes) since a date, optionally for one client.",
        { since: z.string().describe("ISO date"), client: z.string().optional() },
        async ({ since, client }) => text(JSON.stringify(readChanges(since, client))),
      ),
    ],
  });
}
