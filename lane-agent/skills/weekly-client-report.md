# Weekly client report

Covers the previous Monday-Sunday.

## Sources
Ad platforms (skip paused channels), the client's CRM, `read_changes` for the week, meeting notes and email.

## Report (per client in scope), in the owner's voice, ready to send to the client
1. Executive summary: the conclusion first
2. KPIs vs goals: spend, leads, CPL/CPA, calls booked, month-to-date pace
3. Week-over-week trends and why they moved
4. Campaign performance
5. Lead quality and pipeline
6. Changes made last week: only ones in `read_changes`
7. Issues and opportunities
8. Next week's priorities

## Output and delivery
- Write the report as a clean HTML file in the workspace (`reports/<client>-<week>.html`, simple branded styling), upload it with `slack_upload` to the client's channel, and put the report text in the thread so the owner can copy it.
- Offer a Google Doc version and a cover-email draft via `propose_action`.
- Never email the client.
