# Market Conduct Supervisory System — Current State

Programme status:

| Epic | Scope | Status |
| --- | --- | --- |
| MC-00 | Repository truth & canonicalisation | BUILT / CERTIFIED |
| MC-01 | Public complaint intake (7-step wizard, parties, respondents, tracking) | BUILT / TESTED / CERTIFIED |
| MC-02 | Jurisdiction assessment & risk-based triage | BUILT / TESTED / CERTIFIED |
| MC-03 | Investigation & casework | NOT STARTED |

Detail: `docs/product/market-conduct/MC-02_JURISDICTION_TRIAGE.md`.
Certification evidence: `docs/certification/market-conduct/MC-02_CERTIFICATION.md`.

The baseline below is the MC-00 repository truth document, retained as the record of the
starting position; it was verified against the live database schema and repository source
on the date of writing, and sections it marks for replacement were delivered by MC-01/MC-02.

---


## 1. Method

- Database: enumerated `public` schema tables, row counts and RPC surface.
- Repository: enumerated routes, domain pages/hooks and all browser-side writes.
- Tests: enumerated existing pgTAP suites and Playwright certification specs.

No code or schema was changed while producing this baseline.

---

## 2. What exists today

### 2.1 Volumes (live)

| Object | Rows |
| --- | --- |
| `complaints` | 9 |
| `conduct_investigations` | 8 |
| `conduct_findings` | 7 |
| `enforcement_actions` | 5 |

Volumes are low, so migration risk is minimal and canonicalisation can be done by extension
rather than by data-heavy backfills.

### 2.2 Domain tables present (74 in the conduct/complaints/thematic/enforcement families)

Consumer protection: `complaints`, `complaint_types`, `complaint_status_catalogue`,
`complaint_intake_rules`, `complaint_evidence`, `complaint_correspondence`, `complaint_rfis`,
`complaint_rfi_items`, `complaint_rfi_responses`, `complaint_rfi_settings`,
`complaint_investigation_tasks`, `complaint_closure_reviews`, `complaint_escalation_cases`,
`complaint_escalation_rules`, `complaint_escalation_log`, `complaint_duplicate_rules`,
`complaint_duplicate_pairs`, `complaint_duplicate_clusters`, `complaint_duplicate_scoring_config`,
`complaint_import_batches`, `complaint_import_rows`, `complaint_storage_cleanup_deadletter`.

Intelligence: `conduct_alerts`, `conduct_alert_thresholds`, `conduct_signal_events`,
`conduct_signal_evidence`, `conduct_monitoring_rules`, `conduct_monitoring_rule_versions`,
`conduct_monitoring_rule_runs`, `conduct_monitoring_results`, `conduct_monitoring_reviews`,
`conduct_intelligence_reports` (+ versions, recipients, templates), `conduct_triage_rules`,
`conduct_triage_audit_events`, `conduct_risk_categories`, `conduct_products`, `conduct_channels`.

Supervision & outcomes: `conduct_investigations`, `conduct_investigation_closures`,
`conduct_interviews` (+ participants, attachments), `conduct_evidence`,
`conduct_evidence_access_log`, `conduct_findings`, `conduct_actions`,
`conduct_post_closure_monitoring`, `conduct_closure_breaches`, `conduct_supervision_annotations`,
`conduct_saved_views`, `thematic_reviews` (+ `_entities`, `_products`, `_findings`, `_evidence`,
`_actions`, `_status_history`), `enforcement_actions` and the enforcement workflow tables.

### 2.3 Governed RPC surface

202 `public` RPCs exist, the majority `SECURITY DEFINER`. Confirmed canonical entry points
include `create_complaint`, `classify_complaint`, `list_complaints`,
`start_complaint_investigation`, `retry_complaint_triage`, `get_complaint_current_assignees`,
`conduct_investigation_open`, `conduct_finalise_interview`, `conduct_amend_interview`,
`set_conduct_signal_disposition`, `refer_conduct_signal_to_investigation`,
`conduct_supervision_loop_summary` / `_cases` / `_timeline` / `_unresolved_risks` / `_learning`,
`conduct_supervision_log_view` / `_log_export`, and `thematic_review_create`.

Conclusion: the governed-RPC pattern the Master Plan mandates is already the dominant pattern.
The gap is coverage, not architecture.

---

## 3. Canonical object classification

Verified against `information_schema`. "Absent" means the table does not exist today.

### 3.1 Complaint objects

| Master Plan object | Classification | Note |
| --- | --- | --- |
| `complaints` | EXTEND | 58 columns; already carries triage, SLA, closure, vulnerability and duplicate fields |
| `complaint_evidence` | REUSE | |
| `complaint_rfis` | REUSE | RFI cycle already governed |
| `complaint_closure_reviews` | REUSE | |
| `complaint_duplicate_pairs` | REUSE | |
| `complaint_escalation_cases` | REUSE | |
| `complaint_parties` | NEW | complainant identity is inline on `complaints` (`complainant_name`, `_phone`, `email`) |
| `complaint_respondents` | NEW | respondent is a single `licensee_id` / `license_holder_id` today |
| `complaint_contact_preferences` | NEW | only `preferred_contact_method` inline |
| `complaint_vulnerability_assessments` | NEW / MIGRATE | inline `vulnerability_indicator`, `_notes`, `_category`, `_review_state` |
| `complaint_jurisdiction_assessments` | NEW | no jurisdiction decision record exists |
| `complaint_allegations` | NEW | free-text `description` only |
| `complaint_issue_determinations` | NEW | |
| `complaint_representations` | NEW | |
| `complaint_redress` | NEW | no redress model at all |
| `complaint_qa_reviews` | NEW | |
| `complaint_reviews` (reconsideration) | NEW | |
| `complaint_referrals` | NEW | only `enforcement_action_id` link exists |

### 3.2 Intelligence objects

Absent: `conduct_intelligence_inputs`, `conduct_signals`, `conduct_signal_sources`,
`conduct_signal_metrics`, `conduct_alert_links`, `conduct_clusters`, `conduct_cluster_members`,
`conduct_peer_metrics`, `conduct_emerging_risks`.

Present and reusable: `conduct_signal_events` (event-shaped, not a signal aggregate),
`conduct_signal_evidence`, `conduct_alerts`, `conduct_monitoring_rules` + `_versions` + `_runs`.

Implication: signals must be introduced as a first-class aggregate (`conduct_signals`) with
`conduct_signal_events` retained as its event stream — MIGRATE, not replace.

### 3.3 Supervision objects

Absent: `conduct_risk_assessments`, `conduct_risk_dimensions`, `conduct_supervisory_plans`,
`conduct_supervisory_plan_actions`, `thematic_review_requests`, `thematic_review_assessments`,
`conduct_investigation_allegations`.

Present: `conduct_investigations`, `conduct_interviews`, `thematic_reviews` (+ scope tables).

### 3.4 Outcome objects

Absent: `conduct_finding_evidence`, `conduct_remediation`, `customer_remediation_programmes`,
`customer_remediation_progress`, `conduct_enforcement_referrals`, `conduct_effectiveness_reviews`,
`conduct_recurrence_events`.

Present: `conduct_findings`, `conduct_actions` (38 columns — currently doubles as the remediation
carrier), `conduct_post_closure_monitoring` (partial recurrence/effectiveness surrogate).

Implication: `conduct_actions` is EXTEND + split. Remediation programmes and effectiveness reviews
are genuinely NEW.

### 3.5 AI governance

`ai_insights` exists with 33 columns and 7 policies — EXTEND to the Master Plan field list
(model provenance, prompt policy version, accepted/rejected sections, superseded_by,
action_created_type/id). No second AI result table will be created.

---

## 4. Public intake — current state

- Route: `/complaints/file` → `src/pages/public/PublicComplaintIntake.tsx` (389 lines, single page).
- Aliases `/complaints/submit` and `/complaints/new` redirect to it.
- Tracking: `/complaints/track` and `/complaints/track/:reference` (`ComplaintTracking`).
- Submission goes through `create_complaint`, so the write path is already governed.

Gap vs Master Plan section 6: no representative/third-party model, no accessibility or
vulnerability capture, no consent/declaration step, no staged wizard, no jurisdiction pre-check.
This screen is confirmed for replacement in MC-01 (route preserved, write path reused).

---

## 5. Browser-side write inventory (remediation list)

### 5.1 Authoritative writes that must move behind governed RPCs (P1)

| Location | Write | Why it matters |
| --- | --- | --- |
| `src/components/conduct/InvestigationCaseFilePanel.tsx` | direct `update` on `conduct_investigations` (scope, legal basis, plan) | investigation case file is a regulatory record; needs authority + audit |
| `src/hooks/useConductInterviews.ts` | direct `insert`/`update` on `conduct_interviews`, `_participants`, `_attachments` | finalise/amend are governed, but pre-finalise edits are not |
| `src/pages/supervision/NewThematicReview.tsx` | direct `insert` on `thematic_review_entities`, `_products` | review scope is a supervisory decision |
| `src/pages/supervision/ThematicReviewDetail.tsx` | direct `insert`/`delete` on `thematic_review_entities`, `_products`, `_evidence` | scope changes and evidence provenance |
| `src/components/complaints/ComplaintInvestigationTab.tsx` | direct `insert` on `complaint_correspondence` | outbound/inbound correspondence must be dispatch-governed |
| `src/hooks/useConductSurveillance.ts` | direct `insert` on `conduct_signal_evidence` | evidence chain of custody |

### 5.2 Configuration writes to bring under policy governance (P2)

`src/pages/admin/conduct/TriageRules.tsx`, `MonitoringRules.tsx`, `RiskTaxonomy.tsx`,
`ProductsChannels.tsx`, `src/pages/admin/ComplaintTypes.tsx`, `src/pages/admin/SlaManager.tsx`,
`src/pages/complaints/escalations/EscalationRulesAdmin.tsx`,
`src/components/complaints/duplicates/DetectionRulesPanel.tsx`,
`src/components/entity-detail/ProductsChannelsTab.tsx`.

These change decision behaviour, so they require versioning + effective dating + change audit
rather than plain table writes.

### 5.3 Non-authoritative (acceptable as-is)

`src/hooks/useConductSavedViews.ts`, `src/hooks/useSupervisionLoop.ts`
(`conduct_supervision_annotations`), `src/pages/reports/services/reportService.ts`
(report definitions/runs).

---

## 6. Route baseline

Public: `/complaints/file`, `/complaints/track`, `/complaints/track/:reference`.

Consumer protection (internal): `/complaints`, `/complaints/:id`, `/complaints/internal/new`,
`/complaints/analytics`, `/complaints/bulk-intake`, `/complaints/duplicates`,
`/complaints/escalations`, `/complaints/rfi-approvals`.

Conduct: `/conduct`, `/conduct/alerts`, `/conduct/surveillance`, `/conduct/actions(/:id)`,
`/conduct/findings(/:id)`, `/conduct/entities(/:id)`, `/conduct/work-queue`,
`/conduct/investigations(/:id)`, `/conduct/closure-approvals`, `/conduct/supervision-loop`.

Thematic: `/supervision/thematic-reviews`, `/new`, `/:id`, `/supervision/thematic-closure-approvals`.

Against the Master Plan navigation target (section 38), the missing surfaces are: Intake Queue,
Complaint Reviews, Redress, Signals, Patterns & Clusters, Emerging Risks, Peer Analysis,
AI Intelligence, Conduct Risk Assessments, Supervisory Plans, Interviews (as a top-level surface),
Customer Remediation Programmes, Enforcement Referrals, Effectiveness Reviews, Recurrence,
Regulatory Learning, and the Administration group for Jurisdiction Rules and AI Policy.

---

## 7. Test baseline

- `supabase/tests/complaints/` — 16 pgTAP files (intake, workflow, concurrency, duplicates,
  escalations, attachments, public tracking, notifications, RLS, audit, security, regulator scope,
  regression, RPC permissions).
- `supabase/tests/conduct/` — 3 pgTAP files (interview records, investigation closure,
  supervision loop).
- `supabase/tests/phase8/` — market surveillance, referral, rule versions.
- Playwright `e2e/cert-v2/` — authentication, audience boundary, process surfaces.

Gap: conduct coverage is thin relative to complaints. Every MC epic must add pgTAP for its
governed RPCs plus a negative-authority case.

---

## 8. Architecture rules carried into MC-01+

1. One canonical authority per action — governed `SECURITY DEFINER` RPC, never a client table write.
2. Deterministic rules decide; AI only advises, and every AI output is reviewable and attributable.
3. No invented regulation — jurisdiction, redress and enforcement logic stay configuration-driven.
4. Business labels only in the UI — no UUIDs, table names or internal epic codes on screen.
5. Extend before creating — reuse `complaints`, `conduct_*`, `thematic_review_*` and `ai_insights`.
6. Every new public table ships with GRANTs, RLS and policies in the same migration.

---

## 9. MC-00 exit position

Baseline is complete: objects classified, governed RPC surface inventoried, browser-side writes
listed with priority, routes and tests baselined. MC-01 (Public Complaint Intake redesign) can
start against `/complaints/file` reusing `create_complaint`, with the new party, contact
preference, vulnerability and jurisdiction objects introduced as the first canonical extensions.
