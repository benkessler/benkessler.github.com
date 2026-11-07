# Lane Agent

A self-hosted AI growth and marketing employee. It lives in Slack (and email), logs into your tools through Composio, does the work, and hands back finished output. Anything that changes the outside world waits for a one-click approval. It remembers your tools, naming and preferences, so each request needs less explaining than the last.

It's the same idea as Viktor, but you own it. You pay Anthropic and Composio directly at cost: no credits and no markup.

## How it works

```
 Slack (@mention, DM, thread replies)  ─┐
 Email (inbound webhook)               ─┼─►  runAgent()  ──►  Claude Agent SDK loop
 Scheduler (cron jobs from YAML)       ─┘        │                 │
                                                 │                 ├─ Composio MCP  → Google Ads, Meta, HubSpot, Gmail,
                                                 │                 │                  Calendar, Todoist, Granola… (1000+ apps)
                                                 │                 ├─ lane tools    → memory, checkpoints, Slack posts,
                                                 │                 │                  propose_action, change log
                                                 │                 └─ web search / fetch, workspace files
                                                 │
                                       guard.ts (canUseTool) ── reads pass; writes are denied and
                                                                 refiled as Approve/Reject cards
                                                                 → on Approve, the exact call runs via Composio
```

| Piece | File | Notes |
|---|---|---|
| Agent loop | `src/agent.ts` | Claude Agent SDK. No shell access; file tools are limited to `data/workspace`. |
| Approval gate | `src/guard.ts`, `src/approvals.ts` | Tool slugs are sorted by verb. Unknown verbs count as writes. Approved calls run verbatim, with no model in between. |
| Memory | `src/store.ts` → `data/memory/*.md` | Plain markdown you can read and edit. Loaded into every run and tidied nightly. |
| Jobs | `config/org.yaml` + `skills/*.md` | Each job is a schedule plus a markdown playbook. Add a job by writing a playbook. |
| Slack | `src/slackApp.ts` | Socket Mode, so no public URL is needed. Thread follow-ups keep the full context (SDK session resume). |
| Email | `src/email.ts` | Only allowlisted senders can assign work. Replies come from the agent's own Gmail. |

### Jobs included (from the current Viktor setup)

| Job | Schedule | What it does |
|---|---|---|
| `meeting-prep` | weekdays 6:30 | Agenda, numbers, open items and asks for each client meeting, posted to the client's channel |
| `daily-performance-sweep` | weekdays 7:30 | Campaign metrics, budget and goal pacing, anomalies, 3–5 recommendations filed as approvals |
| `inbox-triage` | weekdays 8:00, 14:00 | Sorts client email, writes Gmail drafts, proposes tasks with no duplicates |
| `weekly-client-report` | Mon 7:00 | Client-ready report (HTML upload plus copyable text). Only cites logged changes |
| `funnel-crm-audit` | Wed 7:00 | Lifecycle conversion, follow-up gaps, workflow health, attribution; top fixes with build specs |
| `prospect-brief` | 13:00, 18:00 | A cheap Haiku pre-check, then a pre-call brief or post-call proposal draft only when needed |
| `pacing-snapshot` | every 2h, 6–20 | Month-to-date pacing vs goals on Haiku. Posts only when something tips into a miss |
| `memory-tidy` | nightly | Merges and prunes memory |

## Two ways to deploy, same code

**1. Your own Slack (Lane Growth).** One deployment. `org` is Lane Growth, and `clients` lists every client with their channel, email domains, account IDs and goals. The agent works from your connected accounts (your MCC, your Gmail, your HubSpot access).

**2. Inside a client's Slack.** One deployment per client: its own container, `org.yaml`, data volume, Slack app install and Composio user ID. The client connects their own tools under that Composio user, so their credentials, memory and logs never mix with anyone else's. This is the "install my own Viktor for you" version. You can white-label the name (`agent.name`) and the Slack app.

Because each deployment is a separate container with its own volume, isolation between clients comes from the infrastructure rather than from code paths that could leak.

## Setup

```bash
npm install
cp .env.example .env                      # ANTHROPIC_API_KEY, COMPOSIO_API_KEY, Slack tokens
cp config/org.example.yaml config/org.yaml  # your org, clients, goals, jobs
```

1. **Slack app:** api.slack.com/apps → *Create New App* → *From a manifest* → paste `slack-manifest.yaml`. Create an app-level token with `connections:write` (this is `SLACK_APP_TOKEN`), install the app, and copy the bot token (`SLACK_BOT_TOKEN`). Invite the bot to each client channel.
2. **Connect tools:** for each app, run `npm run connect -- <toolkit>` (e.g. `googleads`, `metaads`, `hubspot`, `gmail`, `googlecalendar`, `todoist`, `granola`), then open the printed link and authorize. The agent can also send connect links in Slack when it finds something missing.
3. **Try it without Slack:** run `npm run ask -- "How is Acme pacing this month?"` or `npm run job -- daily-performance-sweep --force`. Slack posts print to the terminal.
4. **Run it:** `npm run dev` locally, or build the Docker image and run one container per org:

```bash
docker build -t lane-agent .
docker run -d --env-file .env -v $PWD/config:/config -v lane-data:/data lane-agent
```

Any always-on host with a persistent volume works (Fly.io, Railway, Render, a small VPS). Socket Mode means the container needs no inbound port unless you turn on email.

## Using it

- `@Lane what changed in Acme's CPA this week and why?` in a channel. The channel tells it which client you mean.
- DM `run weekly-client-report` to trigger a job, or `pending` to list approvals still waiting on you.
- Reply in any thread it's part of to keep going; no `@` is needed.
- Correct it once ("our campaigns are named Client_Channel_Goal") and it saves that to memory.

## Cost control

- Every run reports its cost in the logs (`total_cost_usd`).
- `AGENT_MODEL` / `AGENT_EFFORT` set the defaults. Each job can override `model` and `effort`. The example config puts the high-frequency pacing job and the pre-check on Haiku.
- `precheck` gates keep expensive jobs from running when there's nothing to do.
- The system prompt is ordered stable-first, so the prompt cache works across runs.

## Safety model

- **Approvals:** writes are blocked at the tool layer, not just discouraged in the prompt. The agent files the exact call, and a click runs that exact call. Only `owner.slackUserId` can approve.
- **No shell:** the agent can't read environment variables or run commands on the host. Composio's remote workbench (which can call any tool from code) is off by default.
- **Untrusted content:** emails, web pages and documents are treated as data. Prompt injection can at most lead to a *proposal*, which you see before anything happens.
- **Email:** only senders on the allowlist can give the agent work, and the webhook requires a shared token.
- **Never contacts clients or prospects:** this is enforced by the approval gate, not only by the prompt.

## Roadmap

- PDF rendering for weekly reports (Playwright HTML → PDF)
- An "Edit" button on approval cards (modal to tweak arguments before running)
- Multi-workspace Slack OAuth, so one hosted instance serves many client workspaces (for a self-serve product)
- Postgres-backed store for running many orgs on one host
- A pacing dashboard page served from `pacing:snapshot`
- Composio triggers (new HubSpot deal, ad disapproval) as event-driven jobs alongside cron
