import { loadConfig } from "./config.js";
import { executeTool } from "./composio.js";
import { createApproval, getApproval, updateApproval, logChange, type Approval } from "./store.js";
import { post, update, dmChannel } from "./slack.js";

/**
 * Approve / Reject cards. The agent never holds a pending write open; it files the exact
 * tool call here and moves on. A click runs that stored call verbatim through Composio,
 * so what you approved is exactly what happens.
 */

const preview = (args: Record<string, unknown>) => {
  const json = JSON.stringify(args, null, 2);
  return json.length > 2500 ? json.slice(0, 2500) + "\n…" : json;
};

function blocks(a: Approval, footer?: string) {
  const b: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*${a.title}*${a.client ? `  ·  _${a.client}_` : ""}\n${a.why}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: `\`${a.toolSlug}\`  ·  approval ${a.id}` }] },
    { type: "section", text: { type: "mrkdwn", text: "```" + preview(a.arguments) + "```" } },
  ];
  if (a.status === "pending") {
    b.push({
      type: "actions",
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "Approve" }, action_id: "approval_approve", value: a.id },
        { type: "button", style: "danger", text: { type: "plain_text", text: "Reject" }, action_id: "approval_reject", value: a.id },
      ],
    });
  }
  if (footer) b.push({ type: "context", elements: [{ type: "mrkdwn", text: footer }] });
  return b;
}

export async function proposeAction(input: {
  title: string;
  why: string;
  toolSlug: string;
  arguments: Record<string, unknown>;
  client?: string;
  channel?: string;
  thread_ts?: string;
}) {
  const cfg = loadConfig();
  const approval = createApproval({ title: input.title, why: input.why, toolSlug: input.toolSlug, arguments: input.arguments, client: input.client });
  const channel = input.channel || (await dmChannel(cfg.owner.slackUserId));
  const msg = await post({
    channel,
    thread_ts: input.thread_ts,
    text: `<@${cfg.owner.slackUserId}> approval needed: ${input.title}`,
    blocks: blocks(approval),
  });
  updateApproval(approval.id, { slack: { channel: msg.channel, ts: msg.ts } });
  return approval.id;
}

export async function decide(id: string, decision: "approve" | "reject", userId: string) {
  const cfg = loadConfig();
  const a = getApproval(id);
  if (!a) return "Approval not found.";
  if (a.status !== "pending") return `Already ${a.status}.`;
  if (userId !== cfg.owner.slackUserId) return "Only the owner can approve actions.";

  if (decision === "reject") {
    const done = updateApproval(id, { status: "rejected", decidedBy: userId })!;
    if (a.slack) await update(a.slack.channel, a.slack.ts, `Rejected: ${a.title}`, blocks(done, `:x: Rejected by <@${userId}>`));
    return "Rejected.";
  }

  updateApproval(id, { status: "approved", decidedBy: userId });
  try {
    const res = await executeTool(cfg.org.composioUserId, a.toolSlug, a.arguments);
    const ok = (res as { successful?: boolean }).successful !== false;
    const summary = JSON.stringify((res as { data?: unknown }).data ?? res).slice(0, 400);
    const done = updateApproval(id, { status: ok ? "done" : "failed", result: summary })!;
    if (ok) logChange({ client: a.client, what: a.title, tool: a.toolSlug, approvalId: id, source: "agent" });
    if (a.slack) {
      await update(
        a.slack.channel,
        a.slack.ts,
        `${ok ? "Done" : "Failed"}: ${a.title}`,
        blocks(done, ok ? `:white_check_mark: Approved by <@${userId}> and done.` : `:warning: Approved, but the tool failed: ${summary}`),
      );
    }
    return ok ? "Done." : `Failed: ${summary}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const done = updateApproval(id, { status: "failed", result: msg })!;
    if (a.slack) await update(a.slack.channel, a.slack.ts, `Failed: ${a.title}`, blocks(done, `:warning: ${msg}`));
    return `Failed: ${msg}`;
  }
}
