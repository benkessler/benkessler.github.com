import { createServer } from "node:http";
import { runAgent } from "./agent.js";
import { env, loadConfig } from "./config.js";
import { executeTool } from "./composio.js";

/**
 * Email front door. Point any inbound-email provider (Postmark, Mailgun, SendGrid Inbound
 * Parse, Cloudflare Email Workers) at POST /email/inbound?token=EMAIL_WEBHOOK_TOKEN.
 * Accepts JSON with from / subject / text (Postmark's From / Subject / TextBody also work).
 *
 * Only senders on `agent.emailAllowlist` can assign work. The reply goes back to the sender
 * from the agent's own mailbox (a Gmail account connected in Composio under
 * `agent.mailboxComposioUserId`).
 */

type Inbound = Record<string, unknown>;
const pick = (b: Inbound, ...keys: string[]) => keys.map((k) => b[k]).find((v) => typeof v === "string") as string | undefined;
const address = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

export function startEmail() {
  if (!env.emailPort) return;
  const cfg = loadConfig();
  const allow = new Set(cfg.agent.emailAllowlist.map((a) => a.toLowerCase()));

  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method !== "POST" || url.pathname !== "/email/inbound") {
      res.writeHead(url.pathname === "/health" ? 200 : 404).end();
      return;
    }
    const token = url.searchParams.get("token") ?? req.headers["x-webhook-token"];
    if (!env.emailToken || token !== env.emailToken) {
      res.writeHead(401).end();
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    res.writeHead(202).end("accepted");

    try {
      const body = JSON.parse(raw) as Inbound;
      const from = address(pick(body, "from", "From", "sender") ?? "");
      const subject = pick(body, "subject", "Subject") ?? "(no subject)";
      const text = pick(body, "text", "TextBody", "body-plain", "plain") ?? "";
      if (!allow.has(from)) return console.log(`[email] ignored sender ${from}`);

      const result = await runAgent({
        prompt:
          `Email from ${from}\nSubject: ${subject}\n\n${text.slice(0, 20000)}\n\n` +
          `Do the work. Your final message is emailed back to ${from} as the reply, so write it as an email body (plain text, no Slack formatting).`,
      });
      if (cfg.agent.mailboxComposioUserId) {
        await executeTool(cfg.agent.mailboxComposioUserId, "GMAIL_SEND_EMAIL", {
          recipient_email: from,
          subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
          body: result.text,
        });
      } else {
        console.log(`[email] reply (no mailbox configured):\n${result.text}`);
      }
    } catch (err) {
      console.error("[email]", err);
    }
  }).listen(env.emailPort, () => console.log(`[email] listening on :${env.emailPort}/email/inbound`));
}
