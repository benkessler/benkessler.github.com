import type { WebClient } from "@slack/web-api";

/**
 * Thin wrapper so tools can post whether we're running inside the Slack app or from the CLI.
 * From the CLI (no client set) messages print to stdout, which makes dry runs easy.
 */
let client: WebClient | undefined;
export function setSlackClient(c: WebClient) {
  client = c;
}
export function hasSlack() {
  return !!client;
}

export async function resolveChannel(channel: string): Promise<string> {
  if (!client || !channel.startsWith("#")) return channel;
  const name = channel.slice(1);
  let cursor: string | undefined;
  do {
    const res = await client.conversations.list({ limit: 1000, cursor, types: "public_channel,private_channel", exclude_archived: true });
    const hit = res.channels?.find((c) => c.name === name);
    if (hit?.id) return hit.id;
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return channel;
}

/** Owner DM channel id from their user id. */
export async function dmChannel(userId: string) {
  if (!client) return `@${userId}`;
  const res = await client.conversations.open({ users: userId });
  return res.channel?.id ?? userId;
}

export async function post(opts: { channel: string; text: string; thread_ts?: string; blocks?: unknown[] }) {
  if (!client) {
    console.log(`\n--- [slack ${opts.channel}${opts.thread_ts ? ` thread ${opts.thread_ts}` : ""}] ---\n${opts.text}\n`);
    return { channel: opts.channel, ts: String(Date.now() / 1000) };
  }
  const channel = await resolveChannel(opts.channel);
  const res = await client.chat.postMessage({
    channel,
    text: opts.text,
    thread_ts: opts.thread_ts,
    blocks: opts.blocks as never,
    unfurl_links: false,
    mrkdwn: true,
  });
  return { channel: res.channel ?? channel, ts: res.ts ?? "" };
}

export async function update(channel: string, ts: string, text: string, blocks?: unknown[]) {
  if (!client) return console.log(`\n--- [slack update ${channel} ${ts}] ---\n${text}\n`);
  await client.chat.update({ channel, ts, text, blocks: blocks as never });
}

export async function uploadFile(opts: { channel: string; thread_ts?: string; path: string; title?: string; comment?: string }) {
  if (!client) return console.log(`\n--- [slack file ${opts.path} -> ${opts.channel}] ---`);
  const channel = await resolveChannel(opts.channel);
  await client.files.uploadV2({
    channel_id: channel,
    thread_ts: opts.thread_ts,
    file: opts.path,
    filename: opts.path.split("/").pop(),
    title: opts.title,
    initial_comment: opts.comment,
  } as never);
}
