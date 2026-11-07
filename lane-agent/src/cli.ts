import { runAgent } from "./agent.js";
import { connectLink } from "./composio.js";
import { loadConfig } from "./config.js";
import { runJob } from "./jobs.js";

/**
 * Local testing without Slack (Slack posts print to stdout):
 *   npm run ask -- "How is pacing for acme this month?"
 *   npm run job -- daily-performance-sweep
 *   npm run connect -- googleads        # prints an OAuth link for the org's Composio user
 */
const [cmd, ...rest] = process.argv.slice(2);
const cfg = loadConfig();

if (cmd === "ask") {
  const res = await runAgent({ prompt: rest.join(" ") });
  console.log(res.text);
} else if (cmd === "job") {
  const job = cfg.jobs.find((j) => j.id === rest[0]);
  if (!job) throw new Error(`Unknown job. Jobs: ${cfg.jobs.map((j) => j.id).join(", ")}`);
  await runJob(job, { force: rest.includes("--force") });
} else if (cmd === "connect") {
  const toolkit = rest[0];
  if (!toolkit) throw new Error("Usage: npm run connect -- <toolkit> [composioUserId]");
  console.log(await connectLink(rest[1] ?? cfg.org.composioUserId, toolkit));
} else {
  console.log("Commands: ask <prompt> | job <id> [--force] | connect <toolkit> [userId]");
}
