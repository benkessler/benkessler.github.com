# Prospect pre-call briefs and proposal drafts

## Sources
Calendar (meetings with people outside client domains), the prospect's website and web search, LinkedIn via search, Gmail threads with their domain, meeting notes.

## Process
1. Confirm it's a real new-business meeting. Skip personal, vendor, client and job-interview meetings silently.
2. *Before the call* (starts within 36h, not in `prospect:briefed`): a brief with who they are (with sources), who's on the call, likely growth gaps (labelled as guesses), the best-fit offer, 5-7 questions, and past contact. Add the event ID to `prospect:briefed`.
3. *After the call* (ended in the last 4 days, not in `prospect:proposed`): from the meeting notes, a proposal draft in the owner's voice: their goals, scope, 30/60/90-day plan, deliverables, timeline, price as "$TBD", and your assumptions. Add to `prospect:proposed`. If there are still no notes 48h after the call, ask the owner once (track in `prospect:asked`).

## Delivery
A summary line in the owner DM with the full brief or proposal in the thread. A Google Doc only via `propose_action`. Never contact the prospect.
