import { env, loadConfig } from "./config.js";
import { startEmail } from "./email.js";
import { startScheduler } from "./jobs.js";
import { startSlack } from "./slackApp.js";

const cfg = loadConfig();
console.log(`[lane-agent] ${cfg.agent.name} for ${cfg.org.name}: ${cfg.clients.length} clients, ${cfg.jobs.filter((j) => j.enabled).length} jobs`);

if (!env.slackBotToken || !env.slackAppToken) throw new Error("SLACK_BOT_TOKEN and SLACK_APP_TOKEN are required");
await startSlack();
startScheduler();
startEmail();
