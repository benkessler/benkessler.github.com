# Weekly funnel and CRM audit

Read-only. Compare with state `crm-audit:last:<client>`.

## Process (per client)
1. Lead volume and lifecycle movement, last 7 and 28 days: new -> MQL -> booked -> held -> customer/won. Conversion at each stage; where leads stall.
2. Follow-up gaps: leads with no owner activity or next step; no-shows nobody followed up.
3. Workflow health: active workflows, enrollments, errors; missing workflows (no-show, nurture, scheduling).
4. Attribution quality: missing or "offline" sources, UTM coverage, whether ad-platform offline conversions are fed back.
5. Pipeline change vs last week, against monthly goals.
6. Save findings to `crm-audit:last:<client>`.

## Output and delivery
Per client, in the client's channel: the top 3-5 automation or process fixes ranked by impact on qualified pipeline, each with a concrete build spec. Summary message, full audit in the thread. Nothing is built in the CRM without an approved `propose_action`.
