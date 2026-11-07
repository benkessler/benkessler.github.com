import { Composio } from "@composio/core";
import { env } from "./config.js";

let client: Composio | undefined;
export function composio() {
  if (!client) {
    if (!env.composioApiKey) throw new Error("COMPOSIO_API_KEY is not set");
    client = new Composio({ apiKey: env.composioApiKey });
  }
  return client;
}

/**
 * A Composio Tool Router session exposed over MCP. The agent gets a handful of meta-tools
 * (search tools, get schemas, execute, manage connections) that reach every app the
 * user has connected, instead of thousands of tool definitions in the prompt.
 */
export async function composioMcp(userId: string) {
  const session = await composio().sessions.create(userId, { mcp: true });
  return { type: "http" as const, url: session.mcp.url, headers: session.mcp.headers };
}

/** Run one approved tool call directly (no model involved). */
export async function executeTool(userId: string, slug: string, args: Record<string, unknown>) {
  const res = await composio().tools.execute(slug, {
    userId,
    arguments: args,
    dangerouslySkipVersionCheck: true,
  } as Parameters<Composio["tools"]["execute"]>[1]);
  return res;
}

/** Start an OAuth link for a toolkit (e.g. "googleads", "hubspot") under a user id. */
export async function connectLink(userId: string, toolkit: string) {
  const session = await composio().sessions.create(userId);
  const req = await session.authorize(toolkit);
  return req.redirectUrl;
}
