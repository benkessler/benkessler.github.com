import cron from "node-cron";
import { runAgent } from "./agent.js";
import { loadConfig, type Job } from "./config.js";
import { loadSkill } from "./prompts.js";
import { dmChannel, post } from "./slack.js";
import { getState, setState } from "./store.js";

/**
 * Scheduled work. Each job is a skill (a markdown playbook in skills/) plus a schedule.
 * Optional `precheck` runs a small, cheap skill first and only starts the full job if it
 * answers RUN, which is how "only when a prospect meeting is coming up" stays cheap.
 */

const running = new Set<string>();

export async function runJob(job: Job, opts: { force?: boolean } = {}) {
  const cfg = loadConfig();
  if (running.has(job.id)) return console.log(`[job ${job.id}] still running, skipped`);
  running.add(job.id);
  const started = new Date();
  try {
    const clients = job.clients ?? cfg.clients.map((c) => c.slug);
    const lastRun = getState<string>(`job:${job.id}:last-run`);
    const header =
      `Scheduled job "${job.id}". Clients in scope: ${clients.join(", ") || "none"}. ` +
      `Last successful run: ${lastRun ?? "never"}. Deliver results with mcp__lane__slack_post as the playbook says; ` +
      `if there is nothing worth sending, send nothing and end with "Nothing to report".`;

    if (job.precheck && !opts.force) {
      const gate = await runAgent({
        prompt: `${loadSkill(job.precheck)}\n\nAnswer with exactly RUN or SKIP on the last line.`,
        model: "claude-haiku-5-5",
        effort: "low",
        clientSlugs: clients,
        maxTurns: 15,
      });
      const verdict = gate.text.trim().split("\n").pop()?.trim().toUpperCase();
      if (verdict !== "RUN") return console.log(`[job ${job.id}] precheck said ${verdict ?? "nothing"}, skipped`);
    }

    const owner = await dmChannel(cfg.owner.slackUserId);
    const res = await runAgent({
      prompt: `${header}\n\n${loadSkill(job.skill)}${job.extra ? `\n\n# Extra instructions\n${job.extra}` : ""}`,
      model: job.model,
      effort: job.effort,
      clientSlugs: clients,
      ctx: { channel: owner },
    });
    if (res.isError) {
      await post({ channel: owner, text: `:warning: Job *${job.id}* failed: ${res.text}` });
    } else {
      setState(`job:${job.id}:last-run`, started.toISOString());
    }
  } catch (err) {
    console.error(`[job ${job.id}]`, err);
  } finally {
    running.delete(job.id);
  }
}

export function startScheduler() {
  const cfg = loadConfig();
  for (const job of cfg.jobs.filter((j) => j.enabled)) {
    if (!cron.validate(job.cron)) {
      console.error(`[scheduler] invalid cron for ${job.id}: ${job.cron}`);
      continue;
    }
    cron.schedule(job.cron, () => void runJob(job), { timezone: cfg.org.timezone, name: job.id });
    console.log(`[scheduler] ${job.id} @ "${job.cron}" (${cfg.org.timezone})`);
  }
}
