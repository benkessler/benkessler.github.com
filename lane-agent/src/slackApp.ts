import { App, LogLevel } from "@slack/bolt";
import { runAgent } from "./agent.js";
import { decide } from "./approvals.js";
import { clientForChannel, env, loadConfig } from "./config.js";
import { runJob } from "./jobs.js";
import { post, setSlackClient } from "./slack.js";
import { listApprovals, setThreadSession, threadSession } from "./store.js";

/**
 * Slack front door.
 *  - @mention the bot in any channel, or DM it: it works the request and replies in the thread.
 *  - Reply in a thread it's part of (no @ needed): the conversation continues with full context.
 *  - Approve / Reject buttons on proposed actions.
 *  - Slash-style commands in DM: "run <job-id>", "pending".
 */

const channelNames = new Map<string, string>();

export async function startSlack() {
  const cfg = loadConfig();
  const app = new App({
    token: env.slackBotToken,
    appToken: env.slackAppToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });
  setSlackClient(app.client);
  const auth = await app.client.auth.test();
  const botUserId = auth.user_id!;

  async function channelName(id: string) {
    if (!channelNames.has(id)) {
      try {
        const info = await app.client.conversations.info({ channel: id });
        channelNames.set(id, info.channel?.name ?? "");
      } catch {
        channelNames.set(id, "");
      }
    }
    return channelNames.get(id)!;
  }

  async function handle(e: { channel: string; user?: string; text?: string; ts: string; thread_ts?: string; channel_type?: string }) {
    const text = (e.text ?? "").replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
    if (!text) return;
    const threadTs = e.thread_ts ?? e.ts;
    const threadKey = `${e.channel}:${threadTs}`;
    const isDm = e.channel_type === "im";

    // Owner shortcuts in DM.
    if (isDm && e.user === cfg.owner.slackUserId) {
      const run = text.match(/^run\s+([\w-]+)$/i);
      if (run) {
        const job = cfg.jobs.find((j) => j.id === run[1]);
        await post({ channel: e.channel, thread_ts: e.ts, text: job ? `Running *${job.id}* now.` : `No job called ${run[1]}.` });
        if (job) void runJob(job, { force: true });
        return;
      }
      if (/^pending$/i.test(text)) {
        const pending = listApprovals("pending");
        await post({
          channel: e.channel,
          thread_ts: e.ts,
          text: pending.length ? pending.map((a) => `• ${a.title} (${a.id})`).join("\n") : "Nothing waiting on you.",
        });
        return;
      }
    }

    const client = isDm ? undefined : clientForChannel(cfg, e.channel, await channelName(e.channel));
    await app.client.reactions.add({ channel: e.channel, timestamp: e.ts, name: "eyes" }).catch(() => {});

    const res = await runAgent({
      prompt:
        `Slack message from <@${e.user}>${client ? ` in ${client.name}'s channel` : isDm ? " (DM)" : ""}:\n\n${text}\n\n` +
        `Do the work, then reply with the finished result. Your final message is posted in this thread automatically.`,
      ctx: { channel: e.channel, thread_ts: threadTs, client: client?.slug },
      resume: threadSession(threadKey),
      clientSlugs: client ? [client.slug] : undefined,
    });
    if (res.sessionId) setThreadSession(threadKey, res.sessionId);
    if (res.text.trim()) await post({ channel: e.channel, thread_ts: threadTs, text: res.text });
    await app.client.reactions.remove({ channel: e.channel, timestamp: e.ts, name: "eyes" }).catch(() => {});
  }

  app.event("app_mention", async ({ event }) => {
    void handle({ ...event, channel_type: "channel", user: event.user ?? undefined }).catch((err) => console.error("[slack]", err));
  });

  app.message(async ({ message }) => {
    const m = message as { subtype?: string; bot_id?: string; channel: string; channel_type?: string; user?: string; text?: string; ts: string; thread_ts?: string };
    if (m.subtype || m.bot_id || m.user === botUserId) return;
    const mentioned = m.text?.includes(`<@${botUserId}>`);
    if (mentioned) return; // app_mention handles it
    // DMs always; channel thread replies only in threads we're already part of.
    const inKnownThread = m.thread_ts && threadSession(`${m.channel}:${m.thread_ts}`);
    if (m.channel_type === "im" || inKnownThread) void handle(m).catch((err) => console.error("[slack]", err));
  });

  for (const decision of ["approve", "reject"] as const) {
    app.action(`approval_${decision}`, async ({ ack, body, action }) => {
      await ack();
      const id = (action as { value?: string }).value!;
      const msg = await decide(id, decision, body.user.id);
      if (msg !== "Done." && msg !== "Rejected.") {
        const channel = (body as { channel?: { id: string } }).channel?.id;
        if (channel) await app.client.chat.postEphemeral({ channel, user: body.user.id, text: msg });
      }
    });
  }

  await app.start();
  console.log(`[slack] connected as @${auth.user} in ${auth.team}`);
}
