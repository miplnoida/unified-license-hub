
## SCRIPT 4 verification — findings

I walked every demo ID against the codebase and DB. The screens exist for every item, but several are functionally hollow because reference/seed data is missing, and two flows have real bugs.

Legend: ✅ works · ⚠️ works but seed missing · ❌ broken/missing

| ID | Item | Status | Notes |
|---|---|---|---|
| MCS-001 | Risk taxonomy & framework config | ⚠️ | 10 risk categories seeded; only **1 product**, 6 channels, **2 complaint types**. Framework config screens work but look bare. |
| MCS-002 | Supervisory universe & history | ⚠️ | Complaints exist but 8/9 have `licensee_id = NULL` → no entity history to open. No historical actions/investigations attached. |
| MCS-003 | Complaint intake (ext + int) | ✅ | Both channels functional; attachments + ack email verified in prior turns. |
| MCS-004 | Classification, triage, prioritization | ❌ | `conduct_triage_rules` table is **empty** → `evaluate-complaint-triage` runs but applies nothing. Classification/severity stays at intake defaults. |
| MCS-005 | Conduct analytics & alerts | ⚠️ | 3 alerts + 2 thresholds seeded; charts render. Fine for demo but sparse. |
| MCS-006 | Thematic review initiation | ⚠️ | `thematic_reviews = 0`. Full CRUD exists (`NewThematicReview`, detail with findings/actions/evidence tabs) but nothing to open. |
| MCS-007 | Investigation & evidence mgmt | ❌ | 1 investigation, **0 evidence rows**. Escalation button works but the evidence repo & restricted-access story has no artefacts to show. |
| MCS-008 | Supervisory actions & outcomes | ❌ | `conduct_actions = 0`. `ConductActions` page renders empty; no notification log rows for the "notifications sent" evidence. |
| MCS-009 | Ongoing monitoring rules | ❌ | `conduct_monitoring_rules = 0`, no rule runs. Admin CRUD exists and edge function `evaluate-conduct-monitoring` is deployed, but never executed. |
| MCS-010 | Oversight dashboard & drill-down | ⚠️ | Dashboard renders; needs the above seed so trend → cases → actions drill-through shows anything. |

## Fix plan

### 1. Seed migration — market conduct framework

Expand reference data so the framework tab is credible and downstream demos have targets.

- `conduct_products`: seed ~12 products across sectors (Personal Loan, Mortgage, Credit Card, Savings Account, Motor Insurance, Life Insurance, Health Insurance, Investment Fund, Pension, Money Transfer, Digital Wallet, Business Loan) with active=true.
- `complaint_types`: add ~8 (Mis-selling, Unfair Charges, Poor Service, Disclosure Failure, Fraud/Unauthorised Transaction, Data Privacy Breach, Advertising Misleading, Vulnerable Customer) each linked to a default `conduct_risk_category_id` and default SLA days.
- `conduct_triage_rules`: seed 6 prioritised rules:
  1. Vulnerable indicator + monetary_impact > 50k → severity=critical, priority=p1, sla=5d, assigned_team=Enforcement.
  2. Fraud category → severity=high, priority=p1, sla=7d, team=Investigations.
  3. Repeat complainant (>=3 in 90d against same entity) → severity=high, priority=p2, team=Investigations.
  4. Mis-selling + Insurance product → severity=high, priority=p2, team=Conduct Ops.
  5. Fees/Charges + monetary_impact <10k → severity=medium, priority=p3, team=Conduct Ops.
  6. Default catch-all → severity=medium, priority=p3, team=Conduct Ops.

### 2. Seed migration — historical complaints + investigations

- Backfill `licensee_id` on the 8 existing NULL complaints (round-robin across 3 licensees).
- Insert ~15 additional historical complaints spanning 24 months, mixed status/severity/category/product/channel — so entity history views, analytics, and thematic hypothesis have volume.
- Create 3 investigations linked to escalated complaints, each with 2–3 `conduct_evidence` rows (mix of `restricted=true` + `confidentiality_level='high'` to demo restricted-access evidence).

### 3. Seed migration — thematic reviews

- 2 thematic reviews (e.g. "Mis-selling of Credit Life Insurance", "Digital Wallet Fee Disclosure Sweep") with:
  - `thematic_review_entities` (3 licensees each), `thematic_review_products` (2 products each).
  - 2 findings and 2 `thematic_review_actions` per review (one Draft, one In Progress).
  - 1 `thematic_review_evidence` per review.

### 4. Seed migration — supervisory actions

- Insert 6 `conduct_actions` across complaints/investigations/thematic reviews covering the action types demanded: Remediation Request, Written Warning, Sanction/Fine, Undertaking, Directions Letter, Public Censure — with rationale in `outcome`/`completion_notes` and 1 `approval_action_notifications`/`notification_dispatch_log` row each for the "notifications sent" evidence.

### 5. Seed migration — ongoing monitoring rules

- Insert 3 `conduct_monitoring_rules`:
  1. Repeat complaints post-remediation (>=2 new complaints within 60d after last resolved).
  2. Product concentration (>=5 open complaints on same product in 30d).
  3. Channel concentration (>=8 complaints on same channel in 90d).
- Trigger the `evaluate-conduct-monitoring` edge function once during migration (via a `pg_net` call or scheduled cron insert) to produce `conduct_monitoring_rule_runs` + `conduct_monitoring_results` rows so the execution log is non-empty. If direct invocation is not possible in a migration, insert one synthetic run per rule with realistic timestamps and matched complaint IDs.

### 6. Code fixes (small)

- `evaluate-complaint-triage`: with rules seeded (Step 1) verify severity/priority/team are applied on intake. If the intake path skips triage (current code uses `triggered_by='intake'` guard), ensure the DB trigger passes that value. Check `trg_apply_complaint_type_sla` order vs triage so triage doesn't get overwritten.
- `ConductDashboard`: current alert-band deep links go to `/complaints?...`; add analogous drill links from "monitoring hits" and "thematic findings" tiles to `/conduct/monitoring` and `/supervision/thematic-reviews` filtered by the clicked bucket. Wire trend chart → filtered `/complaints` list.
- `ConductActions.tsx`: ensure the empty state renders a "Create action" CTA and the list refreshes after seed inserts (verify query key invalidation).

### 7. Verification pass

After migrations run:

- Playwright: login as regulator, walk MCS-001 → MCS-010 clicking through each screen; screenshot each ID's evidence artefact (taxonomy, entity history, ack, triage log, alert, thematic review, evidence file, action + notification, monitoring execution log, dashboard drill).
- Assert counts non-zero for each table listed above via `psql`.
- Confirm `evaluate-complaint-triage` mutates severity/priority on a fresh complaint; confirm `evaluate-conduct-monitoring` produces a new run row.

## Out of scope

- Adding brand-new modules — everything needed already exists.
- Rewriting the workflow engine — assignment already routes via workflow instances (fixed last turn).

## Files touched

- New migration: `supabase/migrations/<ts>_script4_market_conduct_seed.sql` (single large migration, one insert block per section above, idempotent via `ON CONFLICT DO NOTHING` using stable natural keys).
- Small edits: `supabase/functions/evaluate-complaint-triage/index.ts` (guard order), `src/pages/conduct/ConductDashboard.tsx` (drill links), `src/pages/conduct/ConductActions.tsx` (CTA + refresh).

Approve and I will implement steps 1–6, then run the Playwright verification pass in step 7 and report screenshots per demo ID.
