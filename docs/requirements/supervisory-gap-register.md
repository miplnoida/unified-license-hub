# Supervisory Gap Register

**Task type:** Discovery. Nothing in this register has been implemented.
Priorities: **P1** = blocks BRD/FRD conformance or demo credibility.
**P2** = material supervisory weakness. **P3** = polish / hardening.

Effort: **S** ≤ 1 day, **M** 2–5 days, **L** > 5 days.

## P1 — Conformance / demo blocking

| ID | Gap | Requirement impacted | Evidence | Effort |
| --- | --- | --- | --- | --- |
| GAP-XC-01 | 472 direct browser writes to 184 tables bypass governed RPCs; no audit record, no workflow precondition check | BR-X-11, BR-X-12, AUD-LOG-001/002 | repo scan of `insert(`/`update(`/`delete(` in `src` | L |
| GAP-XC-02 | 27 routes are authenticated-only with no module permission, including `/applications/:id`, `/returns/queue`, `/returns/filings/:filingId`, `/entity/returns/*`, `/admin/forms`, `/admin/regulatory-data-model/reporting`, `/admin/permission-coverage` | ADM-RM-001, BR-X-03 | `src/routes/*Routes.tsx` guard classification | M |
| GAP-XC-03 | AI traceability contract unproven — `ai_insights` has 0 rows across all modules | BR-FP-06, BR-X-10, DASH-AI-001, FP-ASS-002 | live count | M |
| GAP-XC-04 | FRD roles R-01 … R-14 are not mapped to any `sec_role`; no artefact states the correspondence | FRD §1.2 role model, ADM-RM-001 | no mapping file in repo | S |
| GAP-PS-01 | Threshold breach detection produces no breaches (`return_threshold_breaches` = 0) despite 240 metric values | BR-PS-09, PRU-RET-003 | live count | M |
| GAP-PS-02 | Early Warning Indicators: 5 rules configured, 0 alerts ever generated | BR-PS-11, PRU-ANA-001 | live count | M |
| GAP-MC-01 | Formal investigation chain never exercised — `conduct_investigations` = 0, `conduct_alerts` = 0 | BR-MC-11/14, MCS-INV-001…004 | live count | M |
| GAP-MC-02 | Thematic review chain never exercised — `thematic_reviews` = 0 | BR-MC-13, MCS-THM-001…003 | live count | M |
| GAP-LIC-01 | Decision letters and licence certificates never generated — `decision_artifacts` = 0 | BR-LIC-06, LIC-DEC-002 | live count | M |
| GAP-XC-05 | Escalation engine produces no escalations (`escalations` = 0) although rules, sweeps and notification paths exist | BR-MC-09, NOT-ESC-001 | live count | M |
| GAP-DASH-01 | No Team Performance dashboard exists | BR-X-04, DASH-OPS-002 | route inventory | M |

## P2 — Material supervisory weakness

| ID | Gap | Requirement impacted | Evidence | Effort |
| --- | --- | --- | --- | --- |
| GAP-FP-01 | Screening has no bound provider; all screening states are "not configured" | BR-FP-05, FP-SCR-001 | `fp_screening_configs`, provider banner | M |
| GAP-FP-02 | Determination → conditions → monitoring → appeals chain has no data (`fp_findings`, `fp_conditions`, `fp_appeals` all 0) | BR-FP-08/10/13/14 | live counts | M |
| GAP-FP-03 | Committee governance exercised for 0 cases (1 committee configured) | BR-FP-09, FP-COM-001 | live count | S |
| GAP-PS-03 | Financial group consolidation has no groups (`financial_groups` = 0), so group EWI and consolidated risk are unproven | BR-PS-15, PRU-GRP-001 | live count | M |
| GAP-PS-04 | PFMI / payment systems oversight has 0 assessments | BR-PS-16, PRU-PAY-001 | live count | M |
| GAP-PS-05 | Peer comparison and stress indicators render but are not driven by seeded peer/stress data | BR-PS-10/17 | live counts | M |
| GAP-XC-06 | Export audit registry has 0 jobs; export governance is asserted by pgTAP but never produced a real export | BR-X-14, AUD-EXP-001 | live count | S |
| GAP-XC-07 | Rule engine has 1 active rule against 12 declared rule types | ADM-RE-001 | live count | L |
| GAP-XC-08 | No consolidated data lineage viewer; lineage is spread across filing versions, form versions and identity snapshots | AUD-LIN-001 | route inventory | M |
| GAP-XC-09 | Ad-hoc report builder has no dimension/measure picker; reports are code-defined templates | BR-X-08, DASH-RPT-002 | `src/pages/reports` | L |
| GAP-XC-10 | Report scheduling and distribution partially wired; no scheduled-run evidence | BR-X-09, DASH-RPT-003 | `/settings/schedule` | M |
| GAP-MC-03 | Conduct monitoring rules configured (3) but no run results or supervision-loop outcomes | BR-MC-16, MCS-MON-002 | `conduct_monitoring_rule_runs` | M |
| GAP-MC-04 | Enforcement compliance monitoring: actions seeded (6) but obligations/evidence follow-through not exercised | BR-MC-15, MCS-ENF-002 | live counts | S |

## P3 — Hardening and hygiene

| ID | Gap | Evidence | Effort |
| --- | --- | --- | --- |
| GAP-SEC-01 | 1,550 database linter findings outstanding | `supabase--linter` | L |
| GAP-SEC-02 | 684 SECURITY DEFINER functions executable by `anon`, 848 by `authenticated` — execute grants not narrowed to the caller set that needs them | linter | L |
| GAP-SEC-03 | 12 functions with mutable `search_path` | linter | S |
| GAP-SEC-04 | 1 SECURITY DEFINER view flagged | linter | S |
| GAP-SEC-05 | `worker_invocation_tokens` has RLS enabled with no policy (service-only by intent — needs explicit deny-all policy + comment) | `pg_policies` | S |
| GAP-SEC-06 | Leaked-password protection disabled in auth configuration | auth config | S |
| GAP-UX-01 | 20+ list surfaces still not migrated to `EnterpriseDataGrid` | `docs/ux/enterprise-grid-inventory.md` | M |
| GAP-QA-01 | Action-level authorization coverage is thin: 34 `useCan` + 22 `PermissionGate` against 2,067 `onClick` handlers | repo scan | L |
| GAP-QA-02 | `cert_verify_dataset_v1()` execute privilege is not granted to the analysis role, so drift cannot be checked from the SQL console | permission denied on call | S |

## Roll-up

| Priority | Count |
| --- | --- |
| P1 | 11 |
| P2 | 13 |
| P3 | 9 |
| **Total** | **33** |

## Dominant theme

Twenty of the 33 gaps are the same defect in different modules: the
**detection-to-action** half of each supervisory chain is built but never
exercised, so no supervisory consequence has ever been produced end to
end. Closing GAP-PS-01, GAP-PS-02, GAP-MC-01, GAP-MC-02, GAP-LIC-01,
GAP-XC-03 and GAP-XC-05 — by extending CERTIFICATION DATASET v1 through
each chain's terminal stage — converts 15 NOT-CERTIFIED verdicts to
testable status in a single coordinated wave.
