## Complaint Auto-Escalation — Current State

**Present:** Manual escalation only — a user can push a single complaint into enforcement via `ComplaintDetail.tsx` (Escalate tab) with a free-text justification.

**Missing:** Automatic rule-based escalation driven by:
- Consumer harm level
- Complaint age (SLA / days open)
- Institution risk rating
- Volume thresholds (per institution / product / period)
- Complaint recurrence (same complainant or same issue)

No rule engine, no auto-triggered queue, no configuration UI. This plan adds a **UI-only** module with mock data, mirroring the Duplicate Detection scaffold already merged.

## Scope (UI only, mock data)

Add new hub at `/complaints/escalations` with three tabs:

1. **Escalation Queue** — complaints auto-flagged for escalation, showing which rule fired, severity, age, assigned tier, and quick actions (Acknowledge / Escalate now / Dismiss / Snooze). All actions are local state.
2. **Triggered Rules Log** — history of rule firings with timestamps, matched complaint, trigger reason, and outcome badge.
3. **Escalation Rules** — admin config for each of the five criteria: enable toggle, thresholds, target tier (Supervisor / Head of Unit / Executive / Enforcement), and notification recipients. Weights preview + "Test rule" button that runs against mock complaints.

Plus:
- Small **Auto-Escalation banner** on `ComplaintsList.tsx` showing count of pending auto-escalations (like the DuplicateAlertBanner).
- New "Escalations" entry under Complaints in the Market Conduct sidebar.
- New action route registered in `src/routes` and nav in `src/config/navigation.tsx`.

## Files to add (`src/pages/complaints/escalations/`)

```text
types.ts                       -- Rule, Trigger, EscalationCase types
mockData.ts                    -- ~15 seeded complaints, 5 rules, ~10 triggers
EscalationHub.tsx              -- tabbed shell + header stats
EscalationQueueTable.tsx       -- queue with filters (rule, tier, severity, age)
EscalationCaseDrawer.tsx       -- side panel: complaint summary, rule match, timeline, actions
TriggeredRulesLog.tsx          -- chronological log with rule/outcome chips
EscalationRulesAdmin.tsx       -- 5 rule cards (harm, age, risk, volume, recurrence)
RuleCard.tsx                   -- reusable enable/threshold/tier editor
RuleTestPanel.tsx              -- runs rule against mock complaints, shows would-fire list
EscalationBanner.tsx           -- alert banner for ComplaintsList
```

## Files to touch (surgical)

- `src/pages/complaints/ComplaintsList.tsx` — mount `EscalationBanner` alongside `DuplicateAlertBanner`.
- `src/config/navigation.tsx` — add "Escalations" under Complaints (Market Conduct group).
- `src/routes/*` (whichever registers `/complaints/duplicates`) — add `/complaints/escalations` route.

No backend, no migrations, no changes to existing escalation flow in `ComplaintDetail.tsx`. Existing `EscalationsTab` and prudential escalations are untouched.

## Design tokens & UX

- Reuse shadcn Card / Table / Badge / Tabs / Dialog / Select consistent with Duplicate Detection module.
- Severity badges: Critical (red), High (amber), Medium (blue), Low (slate) — outline variants with dark text on light bg (following the readability rule from the Matched Signals fix).
- Rule cards show a live sample: "Would fire on 3 of 15 mock complaints."
- All destructive/confirm actions use SweetAlert2 per project standard.

## Out of scope

- Wiring to `complaints` table, RLS, edge functions, cron sweeps.
- Real notification dispatch.
- Modifying the existing manual "Escalate to enforcement" flow.
