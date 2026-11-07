import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { env, loadConfig, type Job } from "./config.js";
import { composioMcp } from "./composio.js";
import { makeGuard } from "./guard.js";
import { laneServer, type RunContext } from "./laneTools.js";
import { systemPrompt } from "./prompts.js";
import { workspaceDir } from "./store.js";

export type RunResult = { text: string; sessionId?: string; costUsd?: number; isError: boolean };

/**
 * One agent run: a Slack message, an email, or a scheduled job.
 * Built-in tools are limited to files in the workspace and the web. No shell: the box holds
 * API keys, and a prompt-injected email shouldn't be able to reach them.
 */
export async function runAgent(opts: {
  prompt: string;
  ctx?: RunContext;
  model?: string;
  effort?: Job["effort"];
  resume?: string;
  clientSlugs?: string[];
  maxTurns?: number;
}): Promise<RunResult> {
  const cfg = loadConfig();
  const ctx = opts.ctx ?? {};

  const mcpServers: NonNullable<Options["mcpServers"]> = { lane: laneServer(ctx) };
  try {
    mcpServers.composio = await composioMcp(cfg.org.composioUserId);
  } catch (err) {
    console.error("[agent] Composio unavailable:", err instanceof Error ? err.message : err);
  }

  const options: Options = {
    model: opts.model || env.model,
    effort: opts.effort || env.effort,
    systemPrompt: systemPrompt(cfg, { clientSlugs: opts.clientSlugs }),
    cwd: workspaceDir(),
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "TodoWrite"],
    mcpServers,
    canUseTool: makeGuard(cfg),
    settingSources: [],
    maxTurns: opts.maxTurns ?? 60,
    resume: opts.resume,
  };

  let text = "";
  let sessionId: string | undefined;
  let costUsd: number | undefined;
  let isError = false;

  for await (const msg of query({ prompt: opts.prompt, options })) {
    if ("session_id" in msg && typeof msg.session_id === "string") sessionId = msg.session_id;
    if (msg.type === "result") {
      costUsd = msg.total_cost_usd;
      if (msg.subtype === "success") text = msg.result;
      else {
        isError = true;
        text = `I hit a problem and stopped (${msg.subtype}).`;
      }
    }
  }
  console.log(`[agent] done session=${sessionId} cost=$${costUsd?.toFixed(3)} error=${isError}`);
  return { text, sessionId, costUsd, isError };
}
