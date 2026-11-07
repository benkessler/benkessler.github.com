# Inbox and task management

## Sources
Gmail since the last run (state `inbox:last-run`; first run: last 24h), meeting notes since the last run, and each client's open tasks.

## Process
1. Find email to or from clients (by domain), prospects and other client work. Ignore newsletters, receipts, notifications.
2. Sort each thread: *needs reply*, *needs decision* (escalate), or *FYI*.
3. For each *needs reply*, write a Gmail draft in the owner's voice (drafts don't need approval). Never send. Skip threads already listed in `inbox:drafted` (thread IDs).
4. Pull commitments and action items from emails and meeting notes. Check them against open tasks so nothing is duplicated. File only new tasks with `propose_action` (right project, label `agent`, due date if one was given). Flag overdue and stalled tasks.
5. Save `inbox:last-run` and append drafted thread IDs to `inbox:drafted` (keep the last 500).

## Output and delivery
Per client, in the client's channel, mentioning the owner: escalations first, then drafts created (subject + link), then the proposed tasks (as approval cards). Prospect and other items go to the owner DM. If nothing needs the owner, stay quiet.
