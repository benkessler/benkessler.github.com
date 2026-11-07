import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { OrgConfig } from "./config.js";

/**
 * The approval gate. Reads run freely; anything that changes the outside world is denied
 * here and the agent is told to file it with `propose_action`, which turns it into an
 * Approve / Reject card in Slack. Unknown verbs count as writes: safe by default.
 */

const READ_VERBS = new Set([
  "GET", "LIST", "FETCH", "SEARCH", "FIND", "RETRIEVE", "QUERY", "READ", "DESCRIBE",
  "LOOKUP", "VIEW", "CHECK", "COUNT", "REPORT", "PREVIEW", "STATS", "INSIGHTS", "ANALYTICS",
]);

export function isReadSlug(slug: string, cfg: OrgConfig) {
  const s = slug.toUpperCase();
  if (cfg.agent.treatAsRead.map((x) => x.toUpperCase()).includes(s)) return true;
  // Slugs look like TOOLKIT_VERB_OBJECT (GMAIL_FETCH_EMAILS, HUBSPOT_LIST_CONTACTS ...)
  const words = s.split("_").slice(1);
  if (words.length && READ_VERBS.has(words[0]!)) return true;
  // GAQL-style "GOOGLEADS_RUN_..._QUERY" / "..._RUN_REPORT" endpoints only read.
  return words[0] === "RUN" && words.some((w) => w === "QUERY" || w === "REPORT");
}

export function isAutoApproved(slug: string, cfg: OrgConfig) {
  return cfg.agent.autoApprove.map((x) => x.toUpperCase()).includes(slug.toUpperCase());
}

const PROPOSE_HINT =
  "This action changes something outside your workspace, so it needs the owner's approval. " +
  "Do not retry it. Call mcp__lane__propose_action with the same tool slug and arguments, " +
  "a one-line title, and the numbers that justify it. Then carry on with the rest of the work.";

type MultiExecInput = { tools?: Array<{ tool_slug?: string; slug?: string }> };

export function makeGuard(cfg: OrgConfig): CanUseTool {
  return async (toolName, input) => {
    // Our own tools and read-only built-ins are always fine.
    if (toolName.startsWith("mcp__lane__")) return { behavior: "allow", updatedInput: input };

    if (toolName.startsWith("mcp__composio__")) {
      const meta = toolName.slice("mcp__composio__".length).toUpperCase();

      if (meta.includes("WORKBENCH") || meta.includes("BASH")) {
        return cfg.agent.allowWorkbench
          ? { behavior: "allow", updatedInput: input }
          : { behavior: "deny", message: "The remote workbench is disabled for this deployment. Fetch data with read tools and analyse it yourself." };
      }

      if (meta.includes("PROXY_EXECUTE")) {
        const method = String((input as { method?: string }).method || "GET").toUpperCase();
        return method === "GET"
          ? { behavior: "allow", updatedInput: input }
          : { behavior: "deny", message: PROPOSE_HINT };
      }

      if (meta.includes("MULTI_EXECUTE") || meta === "COMPOSIO_EXECUTE_TOOL" || meta.endsWith("EXECUTE_TOOL")) {
        const calls = (input as MultiExecInput).tools ?? [input as { tool_slug?: string; slug?: string }];
        const blocked = calls
          .map((c) => c.tool_slug || c.slug || "")
          .filter((slug) => slug && !isReadSlug(slug, cfg) && !isAutoApproved(slug, cfg));
        if (blocked.length) {
          return { behavior: "deny", message: `Blocked: ${blocked.join(", ")}. ${PROPOSE_HINT}` };
        }
      }
      // Search / schemas / connection management are fine.
      return { behavior: "allow", updatedInput: input };
    }

    // Built-ins: allow; the tool list itself is restricted in agent.ts (no Bash).
    return { behavior: "allow", updatedInput: input };
  };
}
