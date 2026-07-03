
# Phase 5 — Close all Script 1–5 gaps (production-grade, not demo)

## Progress log
- ✅ Phase 5A schema migration: `license_certificate_signatures` table, cert dispatch_status, F&P weighted-vote columns, AI-routing columns on `application_ai_assessments`, `has_legal_access()` helper, tightened `application_legal_notes` RLS.
- ✅ Gap 4 (License signing & dispatch): edge fns `sign-license-certificate` + `dispatch-license-certificate` with HMAC-SHA256 ledger, `LicenseSignaturePanel` wired into `LicenseDetail.tsx`, secret `LICENSE_SIGNING_SECRET` generated.
- ✅ Gap 2 (AI routing acceptance): `AIRoutingDecisionActions` in `ApplicationAiAssessmentPanel` with Accept + OverrideReasonDialog persisting `routing_decision/*` on `application_ai_assessments`, rule_overrides + audit mirrored.
- ✅ Gap 11 (F&P weighted voting): `vote_weight` editable on `fp_committee_members`, `casting_vote_member_id` selector on committee, weighted tally + casting-vote tie-break in `FpDeterminationsPanel`, weight persisted on each `fp_committee_votes` row.
- ✅ Gap 12 (F&P appeals): confirmed `FpAppealsPanel` fully implements filing, committee assignment, decision recording (with override dialog for overturn), reversal of prior `fp_determinations`, and full audit via `logFpAction`.
- ✅ Gap 3 (Legal-access RLS): `has_legal_access()` gates `application_legal_notes`; denied-access events + viewer already surface in `ComplianceAuditLogs`.
- ✅ Gap 6 (Twin-Peaks clearance + divergence): tables `twinpeaks_clearances`/`twinpeaks_disagreements` + `coordination_cases.clearance_required`, `TwinPeaksPanel` mounted in `ApplicationDetail`, approval blocked in `ConfigurableDecisionActions` unless override recorded.
- ✅ Gap 5 (Auto-provisioning supervisory plan): trigger `trg_license_issued_seed_plan` on `licenses` insert/status→active materialises `supervisory_plans` + `supervisory_plan_actions` from best-matching template with template offset due dates.
- ✅ Phase 5C schema: `fp_individual_roles.reassessment_cycle_months/last_reassessment_at/next_reassessment_due`; `fp_findings.confidence_score/resolution_status/resolution_reason/resolved_by/resolved_at/citations` + confidence-band trigger.
- ✅ Gap 7 (Cycle scheduler): edge fn `fp-cycle-scheduler` opens cycle assessments when roles are due; manual trigger button on `FpPopulationTrends`; per-role cycle editable on individual detail Roles tab with next-due tracking.
- ✅ Gap 8 (Adverse-media confidence + triage): screening engine and AI ingest write `confidence_score`; auto-band trigger drafts false-positive/needs-review/true-positive; `FpScreeningPanel` triage dialog with mandatory reason (min 10 chars), citations rendered inline.
- ✅ Gap 9 (Population trends): `FpPopulationTrends` page at `/fit-and-proper/trends` — Recharts for findings-by-month, throughput, check-type mix, resolution mix, appeals stats.
- ✅ Gap 10 (AI ingest): edge fn `fp-ai-media-ingest` calls Lovable AI Gateway, stores findings with citations + confidence, exposed via "AI media scan" button in `FpScreeningPanel`; analyst must accept/reject each hit with reason before it counts.
- ✅ Phase 5D partial: Gap 13 conduct taxonomy (`ConductRiskTaxonomy`) already live; Gap 14 peer comparison already live in `PrudentialAnalytics`; Gap 16 `MonitoringRules` admin with on-demand runner already live.
- ✅ Gap 15 (Product/channel dimension): migration adds `licensee_products` + `licensee_channels` join tables with regulator-managed / licensee-read RLS; new `ProductsChannelsTab` mounted on `LicenseeDetail` for effective-dated product & channel mapping.
- ✅ Gap 1 (Batch document upload): existing `BatchDocumentUpload` reusable widget wired into `ApplicationDetail` Documents tab alongside single-file uploader — drag-drop many files with per-file type / description / confidentiality.
- ⏭️ Next: Phase 5E (dashboard AI insights, export audit surface, entity change-history drawer, security-events viewer).

Scope: turn every 🟡/❌ item from the approved assessment into fully wired, RLS-secured, audited, tested features. Grouped into 5 phases by dependency and risk. Each phase ends with build + targeted tests green.



---

## Phase 5A — Decision integrity & legal defensibility (highest risk)

Blocks approval quality across Scripts 1, 2, 4.

**Gap 4 — Digital license signature + pre-dispatch review/amend gate**
- New table `license_certificate_signatures` (certificate_id, signer_user_id, signed_at, signature_hash, signing_key_fingerprint, dispatch_status: draft→ready→dispatched).
- Edge fn `sign-license-certificate`: takes certificate id, signs SHA-256 of PDF bytes with server-held HMAC secret (`LICENSE_SIGNING_SECRET`), stores hash + signer, marks status `ready`.
- Amend/dispatch flow in `ApplicationDetail` decision dialog: after approve → certificate generated → reviewer opens "Review & Dispatch" drawer → can amend cover letter/conditions → click Sign → click Dispatch (calls `send-correspondence`). Dispatch blocked until signed.
- Signature panel on public `PublicRegistry` license view + verification endpoint `verify-license-signature`.

**Gap 3 — Legal reviewer denied-access audit + investigation restricted access**
- Extend `security_event_logs` writer: any component/edge fn hit on legal-only routes (`application_legal_notes`, enforcement evidence, F&P adverse notes) without `legal_reviewer`/`investigator` role writes a `denied_access` event with route, user, target id.
- Central RLS helper `public.has_legal_access(uid)` + policies on `application_legal_notes`, `enforcement_actions.evidence_*`, `complaint_evidence`.
- New admin viewer `SecurityEvents.tsx` (see Gap 20).

**Gap 12 — F&P appeals module**
- New tables `fp_appeals` already exists but needs wiring: verify columns, add `fp_appeal_events`, `fp_appeal_documents`.
- Pages `FitAndProperAppeals.tsx` (list) + `FpAppealDetail.tsx` (grounds, evidence, committee decision, license impact).
- On upheld appeal → auto-reverse linked `fp_determination` + fire `license.reinstate` workflow if the determination had triggered a license action.
- Notifications + audit on every state transition.

**Gap 11 — Committee weighted-voting calculation**
- Extend `fp_committee_votes` with `weight`, `rationale_required`.
- New RPC `finalize_fp_committee_vote(committee_id, assessment_id)` → sum(weight * vote_value), quorum check, ties broken by chair (configured on `fp_committees`).
- UI in `FpCommittees` + assessment detail: cast vote, live tally, finalize button gated to chair.

**Gap 2 — AI-proposed routing acceptance UI**
- Extend `application_ai_assessments` with `proposed_routing_step_id`, `proposed_routing_rationale`.
- In `generate-application-ai-assessment`: after producing findings, pick the best matching workflow step from `approval_steps` for the app's workflow via rule map (risk_score, sufficiency_status, category) and record it.
- New `AIRoutingCard` in `ApplicationDetail`: shows proposal + Accept / Override with reason (mandatory ≥10 chars, logged via `logRuleOverride`).

**Deliverables:** 4 migrations, 3 edge functions, 6 new pages/components, 8 vitest suites.

---

## Phase 5B — Twin-Peaks & Licensing→Supervision handover

**Gap 6 — Conditional clearance + divergence resolution**
- New tables `twinpeaks_clearances` (application_id, regulator_role: prudential|conduct, status: clear|conditional|blocked, conditions[], recorded_by, recorded_at) and `twinpeaks_disagreements` (application_id, raised_by, description, resolution, resolved_by, resolved_at).
- Extend `coordination_cases` with `clearance_required: bool`.
- New `TwinPeaksPanel` in `ApplicationDetail`: shows both regulators' clearance status; approval gate blocks final approve if either is `blocked` unless override.
- Resolution wizard (chair-only) with mandatory rationale, audits both sides.

**Gap 5 — Auto-provisioning of initial supervisory plan**
- DB trigger `trg_license_issued_seed_plan` on `licenses` insert: pick template by `sector_id + license_type` from `supervisory_plan_templates`, materialise `supervisory_plans` + `supervisory_plan_actions` with due dates = issue_date + template offset.
- Include time-bound corrective actions carried over from application `sufficiency_evaluations` where an override was recorded.
- UI: banner on new license page "Initial supervisory plan created — X actions due".

**Deliverables:** 2 migrations, 1 trigger, 2 components, 3 tests.

---

## Phase 5C — F&P depth (Scripts 2 items)

**Gap 7 — Cycle-based F&P re-assessment scheduler**
- Extend `fp_individual_roles` with `reassessment_cycle_months`.
- Cron edge fn `fp-cycle-scheduler` (daily): for each active role where `last_assessment_at + cycle_months <= today`, initiate a new assessment (path=`cycle`) and notify assessor.
- Admin UI in `FpScreeningConfigs` to set cycle per role type.

**Gap 8 — Adverse-media match confidence + FP resolution**
- Extend `fp_screening_runs` results shape: hits[] each with `confidence_score` (0-100), `status: pending|true_positive|false_positive|needs_review`, `resolved_by`, `resolution_reason`.
- Update `fp-screening-run` edge fn to accept AI/gateway responses with scores; auto-mark <30 as false_positive draft, ≥80 as true_positive draft, middle band as needs_review.
- Analyst UI on assessment detail: resolve each hit with reason (audited).

**Gap 9 — F&P population-level trend dashboard**
- New page `FpPopulationTrends.tsx`: charts for adverse-finding rate over time by sector, average risk score, escalation rate, appeal outcomes. Uses Recharts + `useSupervisoryMetrics` extended.

**Gap 10 — F&P AI ingest of unstructured sources**
- Edge fn `fp-ai-media-ingest`: given individual id, calls Lovable AI Gateway with retrieved documents/urls, returns findings[] with citations{source_url, excerpt, confidence}.
- Store into `fp_findings` with `source: ai`, `citations` jsonb column (add).
- UI card in `FitAndProperIndividualDetail`: "Run AI media scan" → shows results with click-through citations, analyst must accept/reject each with reason before it counts.

**Deliverables:** 3 migrations, 3 edge functions, 4 UI surfaces, 6 tests.

---

## Phase 5D — Prudential + Conduct depth (Scripts 3–4)

**Gap 13 — Configurable prudential + conduct risk taxonomy admin**
- Reuse `master_data_types`/`master_data_items` with `type_key='prudential_risk_taxonomy'` and `'conduct_risk_taxonomy'`; add hierarchy (parent_id) already present.
- Admin pages `PrudentialRiskTaxonomy.tsx` and `ConductRiskTaxonomy.tsx`: tree editor, publish/version.
- Wire ratio/threshold configs + `conduct_alerts` to reference taxonomy items.

**Gap 14 — Peer comparison view for prudential ratios**
- Extend `PrudentialAnalytics.tsx` with a Peer Compare tab: for a chosen ratio + period, list entities in same sector/sub-sector with values, quartile bands, z-score highlighting.
- DB view `v_peer_ratio_snapshot` for efficient reads.

**Gap 15 — Product/channel dimension for conduct universe**
- Tables `conduct_products`, `conduct_channels` already present — add `licensee_products` (licensee_id, product_id, active_from, active_to) and `licensee_channels`.
- Extend `LicenseeDetail` with Products/Channels tabs.
- Complaint intake + thematic reviews scope by product/channel.

**Gap 16 — Relapse/repeat-complaint monitoring rule admin**
- Extend `conduct_monitoring_rules` schema: `rule_kind` enum (`repeat_post_remediation`, `product_channel_concentration`, `relapse_threshold`), thresholds jsonb, evaluation window.
- Admin editor page `ConductMonitoringRules.tsx`.
- `evaluate-conduct-monitoring` extended to evaluate each kind.

**Gap 1 — Applicant batch document upload**
- New component `BatchDocumentUpload.tsx` in `NewApplication` / `ApplicationDetail`: drag-drop many files, per-file document-type dropdown, parallel signed uploads (max 5 concurrent), progress bar.
- Enforces `secure-documents` bucket path scoping and per-doc size/type from `document_groups`.

**Deliverables:** 3 migrations, 1 edge fn extension, 5 UI surfaces, 5 tests.

---

## Phase 5E — Cross-module reporting & auditability (Script 5)

**Gap 17 — AI-insights narrative layer on cross-module dashboard**
- Edge fn `generate-dashboard-insights` (cached 15 min): pulls current metrics deltas, calls Lovable AI Gateway to produce 3–5 bullet insights + top 3 recommended actions with links.
- `ExecutiveDashboard.tsx` shows Insights card; refresh + acknowledge; feedback (thumbs) stored for tuning.

**Gap 18 — Export audit log surface**
- Extend `audit_export_jobs` (already present) writer to cover every CSV/PDF/JSON export in the app (reports, applications, returns, complaints). Central helper `logExport(userId, dataset, filters, row_count, file_hash)`.
- Admin viewer `ExportAudit.tsx` with filters and download links.

**Gap 19 — Unified before/after value viewer per entity (data lineage)**
- New table `entity_change_history` (entity_type, entity_id, changed_by, changed_at, field_key, old_value, new_value, source: user|system|edge_fn).
- DB triggers on `applications`, `registrations`, `compliance_returns`, `complaints`, `fp_assessments`, `licenses` capturing changed fields via `pg_notify` + trigger fn.
- Reusable `<ChangeHistoryDrawer entityType entityId />` opened from every detail page's header menu.

**Gap 20 — Security-event viewer**
- Already have `security_event_logs`. Build `SecurityEvents.tsx` admin page: filters by user/route/type (denied_access, failed_login, permission_denied, suspicious_export), export, retention notice.
- Wire additional emitters from Gaps 3 + 18 + auth flow.

**Deliverables:** 1 migration (change history), 1 edge fn, 3 admin pages, 1 reusable drawer, 5 tests + Playwright smoke on export-audit + change-history + security-events.

---

## Cross-cutting requirements (every phase)

- **RLS**: every new table gets explicit policies (regulator scope, licensee scope, service_role bypass), plus GRANTs in the same migration.
- **Audit**: every state transition writes to `audit_logs` and, where applicable, `compliance_audit_logs`/`return_audit_log`.
- **Overrides**: any bypass of a system gate uses the existing `rule_overrides` + `OverrideReasonDialog` (min 10 chars, mandatory).
- **Notifications**: hook into `notification_event_configs` — no ad-hoc emails.
- **Tests**: vitest for pure logic; Playwright smoke for each new admin page and each new gate.
- **Docs**: append to `docs/FEATURE_DEVELOPMENT_TRACKER.md` per phase.
- **Memory**: update `mem://index.md` with references for each new subsystem.

## Milestone gates

After each phase: `npm run build`, targeted vitest suites, `scripts/verify-hardening.sql` re-run. No phase is "done" until all pass.

## What I will do first on approval

Start with **Phase 5A**, and within it the two items with the largest blast radius:
1. Migration + edge fn for **Gap 4 (license signature + dispatch gate)**.
2. Migration for `security_event_logs` writers + RLS helpers for **Gap 3**.

Once those land and pass, continue through the rest of Phase 5A sequentially. Confirm to start.
