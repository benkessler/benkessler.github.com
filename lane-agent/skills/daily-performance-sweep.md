# Daily performance sweep

"Yesterday" means the previous day; on Mondays it covers Fri-Sun.

## Sources
Ad platforms for each client in scope (skip paused channels), the CRM for leads and calls, and state `perf-sweep:last:<client>` from the previous sweep.

## Process (per client)
1. Every active campaign: yesterday, last 7 days, and the 7 before. Spend, impressions, clicks, CTR, CPC, conversions, CPA, conversion rate.
2. Budget pacing: month-to-date spend vs the client's monthly budget goal, month-end projection, campaigns that are budget-capped or underdelivering.
3. Goal pacing: leads and calls month-to-date vs the client's goals, and where the month ends at the current run rate.
4. Flag anomalies. Keep urgent items (spend spikes, tracking breaks, disapprovals, zero conversions on a normally converting campaign) apart from normal noise.
5. 3-5 recommendations, each with the exact change, the numbers behind it and the expected impact. File each one that maps to a tool call with `propose_action`; the rest are listed as manual.
6. Compare with the last sweep: mark issues new or still open. If the account shows the owner made a change you recommended, `log_change` it.
7. Save this sweep's issues and recommendations to `perf-sweep:last:<client>`.

## Output and delivery
Per client, in the client's channel:
- Summary message: urgent items (or "Nothing urgent"), one pacing line, top recommendations.
- Thread reply: detail tables in code blocks.
- `mention_owner` only if something is urgent.
