# BRD / FRD Traceability Matrix

**Programme:** SUPTECH BRD/FRD Conformance & Supervisory Readiness
**Task type:** Discovery and analysis only — no functionality was implemented while producing this matrix.
**Measured:** live database + repository at the time of writing.

## Authoritative sources

| Source | Identifiers extracted |
| --- | --- |
| `ABC_FRD_v1-2.docx` | 90 screen specifications, 355 requirement/screen identifiers, roles R-01 … R-14 |
| `Master_Vendor_Demo_Instruction_Pack.docx` | 5 demo scripts, mandatory demonstration areas, evaluation principles |
| `SCRIPT_1 … SCRIPT_5 (.xlsx)` | 58 DEMO-* scenarios, 64 BR-* business requirements |

## Conformance verdict vocabulary

| Verdict | Meaning |
| --- | --- |
| **CONFORMS** | Capability exists, is reachable through a guarded route, is backed by canonical tables/RPCs, and certification data exercises it. |
| **PARTIAL** | Capability exists but one of: configuration is hard-coded, workflow stage missing, authorization not enforced server-side, or no supervisory outcome is produced. |
| **NOT CERTIFIED** | Capability is built but **zero rows** exist in CERTIFICATION DATASET v1, so it has never been proven end to end. |
| **GAP** | No implementation found. |

## Measured platform surface

| Measure | Value |
| --- | --- |
| Routes declared | 282 unique paths (285 route elements) |
| Routes with module permission guard | 186 |
| Routes authenticated-only (no module permission) | 27 |
| Routes public/unauthenticated by design | 69 |
| Pages | 290 |
| Hooks | 108 |
| Edge functions | 76 |
| Database tables (all RLS-enabled) | 464 |
| RLS policies | 991 |
| RPCs (SECURITY DEFINER) | 896 of 2,146 |
| Database migrations | 775 |
| pgTAP suites / Vitest files | 113 / 121 |
| Direct browser writes (insert/update/delete) | 472 call sites across 184 tables |

---

## Part A — Business requirement traceability (BRD, 64 requirements)

### A1. Unified Licensing, Registration & Approval (BR-LIC-01 … 07)

| BR | Requirement theme | Implementation evidence | Verdict |
| --- | --- | --- | --- |
| BR-LIC-01 | Configurable application forms per licence type, no code change | `form_templates` (55 rows), Form Builder `/admin/forms`, `FormRenderer` | CONFORMS |
| BR-LIC-02 | Multi-step applicant submission with draft, validation, documents, fees | `/applications/new`, `/applications/:id/continue`, `verify-and-submit` edge fn, mandatory payment gate | CONFORMS |
| BR-LIC-03 | Intake, sufficiency determination, RFI cycle | `/applications/queue`, `/admin/sufficiency-rules`, `application_rfis`, `application_rfi_items` | CONFORMS |
| BR-LIC-04 | Multi-disciplinary review (analyst, legal, specialist) with segregated notes | `application_legal_notes`, `application_legal_referrals`, `application_ai_assessments` | CONFORMS |
| BR-LIC-05 | Configurable approval workflow, delegation, SLA, escalation | `approval_workflows` (11), `approval_steps`, `delegation_rules`, `/admin/sla-manager` | CONFORMS |
| BR-LIC-06 | Decision, letter and certificate generation with preview | `decision_artifacts` (**0 rows**), `src/lib/licenseCertificate.ts`, `/licenses/:id` | NOT CERTIFIED |
| BR-LIC-07 | Authoritative licence register with conditions, expiry, history | `entity_licenses` (28), `/licenses`, `/registry/licensees` | CONFORMS |

### A2. Fit & Proper (BR-FP-01 … 16)

| BR | Requirement theme | Implementation evidence | Verdict |
| --- | --- | --- | --- |
| BR-FP-01 | Single canonical individual identity across entities | `parties` (75), `/fpa/individuals` | CONFORMS |
| BR-FP-02 | Personal Questionnaire configurable form, individual portal | `/fpa/declarations`, `/declaration/:token`, `declaration_invitations` | CONFORMS |
| BR-FP-03 | Four assessment trigger types | `/fpa/initiation`, `/fpa/scheduler`, `fp_assessments` (16) | PARTIAL — scheduler-driven and event-driven triggers exist; certification data covers application-driven only |
| BR-FP-05 | Automated screening across configured sources | `/fpa/screening`, `/admin/fp-screening-configs`, `FpScreeningProviderBanner` | PARTIAL — no live provider bound; provider state surfaced as unconfigured |
| BR-FP-06 | AI analysis of PQ + screening with human override | `/fpa/ai-analysis`, `ai_insights` (**0 rows**) | NOT CERTIFIED |
| BR-FP-08 | Adverse finding capture and grading | `fp_findings` (**0 rows**), `/fpa/findings` | NOT CERTIFIED |
| BR-FP-09 | Committee review with weighted anonymous voting | `fp_committees` (1), `/fpa/committee` | PARTIAL — no committee case exercised |
| BR-FP-10 | Formal determination issuance | `/fpa/determinations` | PARTIAL — no determination in certification data |
| BR-FP-13 | Conditions and ongoing monitoring | `fp_conditions` (**0 rows**), `/fpa/conditions`, `/fpa/monitoring` | NOT CERTIFIED |
| BR-FP-14 | Appeals | `fp_appeals` (**0 rows**), `/fpa/appeals` | NOT CERTIFIED |
| BR-FP-15 | Sector-specific F&P rules | `/fpa/sector-rules`, `/admin/fp-sector-rules` | CONFORMS |
| BR-FP-16 | F&P trend and portfolio analytics | `/fpa/trends` | PARTIAL — analytics render but source tables are largely empty |

### A3. Prudential Supervision (BR-PS-01 … 17)

| BR | Requirement theme | Implementation evidence | Verdict |
| --- | --- | --- | --- |
| BR-PS-01 | Supervised entity register with risk rating and assigned supervisor | `/prudential/entities`, `entity_supervision_assignments` (20) | CONFORMS |
| BR-PS-02 | Entity 360 prudential profile | `/entities/:entityId` (Entity 360 canonical), `entity360_overview` | CONFORMS |
| BR-PS-03 | Configurable return definitions and obligation rules | `return_definitions` (6), `reporting_obligation_rules` (36) | CONFORMS |
| BR-PS-04 | Obligation generation per entity and reporting calendar | `entity_reporting_obligations` (56), `reporting_periods` (233), `/returns/calendar` | CONFORMS |
| BR-PS-05 | Entity return submission — web form and template upload | `/entity/returns`, `ReturnUploadPanel`, Excel/XML import | CONFORMS |
| BR-PS-06 | Supervisor return intake queue with on-time/late status | `/returns/queue` (`ReturnsFilingQueue`), `return_filings` (112) | CONFORMS |
| BR-PS-07 | Return detail review, validation results, version history | `/returns/filings/:filingId`, `return_filing_versions` (128), `FilingVersionComparison` | CONFORMS |
| BR-PS-08 | Automatic ratio and metric computation | `regulatory_metrics` (25), `return_metric_values` (240) | CONFORMS |
| BR-PS-09 | Threshold breach detection and supervisory follow-up | `return_threshold_breaches` (**0 rows**), `/supervision/breaches` | NOT CERTIFIED |
| BR-PS-10 | Peer group comparison | `prudential_risk_taxonomy` (11), `usePeerSettings` | PARTIAL |
| BR-PS-11 | Early warning indicators | `prudential_ewi_rules` (5), `prudential_ewi_alerts` (**0 rows**), `/supervision/early-warnings` | NOT CERTIFIED |
| BR-PS-12 | CAMELS supervisory assessment | `prudential_assessments` (9), `CamelsComponentsPanel` | CONFORMS |
| BR-PS-13 | Onsite examination lifecycle | `examinations` (9), `examination_findings` (9), `/prudential/examinations` | CONFORMS |
| BR-PS-14 | Supervisory actions and directives | `/prudential/actions`, `/entity/supervisory-actions`, `supervisory_plans` (11) | PARTIAL — plans seeded, actions not exercised |
| BR-PS-15 | Financial group consolidated risk profile | `financial_groups` (**0 rows**), `/prudential/groups`, `group_ewi_rules` | NOT CERTIFIED |
| BR-PS-16 | Payment systems / PFMI oversight | `pfmi_assessments` (**0 rows**), `pfmi_principles`, `/prudential/payment-systems` | NOT CERTIFIED |
| BR-PS-17 | Stress indicators and macro context | `prudential_stress_indicators`, `/prudential/stress-indicators` | PARTIAL |

### A4. Market Conduct Supervision (BR-MC-01 … 16)

| BR | Requirement theme | Implementation evidence | Verdict |
| --- | --- | --- | --- |
| BR-MC-01 | Public consumer complaint portal and submission | `/submit-complaint`, `/complaints/submit`, CAPTCHA config | CONFORMS |
| BR-MC-02 | Acknowledgement + public status tracking | `/track/complaint`, `/complaints/track/:reference` | CONFORMS |
| BR-MC-03 | Complaint intake rules, classification, triage | `complaint_intake_rules`, `conduct_triage_rules`, `complaints` (7) | CONFORMS |
| BR-MC-04 | Case workbench, investigation tasks, evidence | `/complaints/:id`, `complaint_investigation_tasks`, `complaint_evidence` | CONFORMS |
| BR-MC-05 | Entity RFI cycle with approval oversight | `complaint_rfis`, `/complaints/rfi-approvals`, `/entity/complaint-rfis` | CONFORMS |
| BR-MC-06 | Bulk complaint intake | `/complaints/bulk-intake`, `complaint_import_batches` | CONFORMS |
| BR-MC-07 | Duplicate detection and clustering | `complaint_duplicate_pairs`, `/complaints/duplicates` | CONFORMS |
| BR-MC-08 | Closure with rationale and quality review | `complaint_closure_reviews`, 10-char rationale validation | PARTIAL — QA closure step was removed by prior business decision; FRD MCS-CMP-006 expects a quality review gate |
| BR-MC-09 | Escalation workflow and SLA breach handling | `complaint_escalation_cases`, `escalations` (**0 rows**) | NOT CERTIFIED |
| BR-MC-10 | Conduct analytics dashboard | `/conduct`, `useConductDashboardMetrics` | PARTIAL — renders on empty conduct tables |
| BR-MC-11 | Pattern alert management | `conduct_alerts` (**0 rows**), `/conduct/alerts` | NOT CERTIFIED |
| BR-MC-12 | Market conduct intelligence report | `conduct_intelligence_reports`, templates, recipients | PARTIAL |
| BR-MC-13 | Thematic reviews (charter → workbench → closure) | `thematic_reviews` (**0 rows**), `/supervision/thematic-reviews` | NOT CERTIFIED |
| BR-MC-14 | Formal investigation incl. interview records | `conduct_investigations` (**0 rows**), `conduct_interviews` | NOT CERTIFIED |
| BR-MC-15 | Enforcement action lifecycle and register | `enforcement_actions` (6), `enforcement_obligations`, `/enforcement` | CONFORMS |
| BR-MC-16 | Ongoing conduct monitoring rules + supervision loop | `conduct_monitoring_rules` (3), `/conduct/supervision-loop` | PARTIAL — rules configured, no run results |

### A5. Cross-cutting: dashboards, audit, notifications (BR-X-01 … 14)

| BR | Requirement theme | Implementation evidence | Verdict |
| --- | --- | --- | --- |
| BR-X-01 | Executive cross-module dashboard | `/executive`, `ExecutiveSupervisoryDashboard` | CONFORMS |
| BR-X-02 | Twin Peaks coordination | `/coordination`, `coordination_cases`, pgTAP `06_twin_peaks.sql` | CONFORMS |
| BR-X-03 | Operational supervisor dashboard | `/dashboard`, `SupervisoryDashboard` | PARTIAL — route is authenticated-only, no module guard |
| BR-X-04 | Team performance dashboard | — | GAP — no team-performance surface found |
| BR-X-05 | Regulated entity dashboard | `LicenseeDashboard`, `/entity/returns/dashboard` | CONFORMS |
| BR-X-06 | Pre-built report library | `/reports`, `/reports/*` | CONFORMS |
| BR-X-08 | Ad-hoc report builder | `/reports` custom templates (Recharts + CSV/JSON) | PARTIAL — no true ad-hoc field/dimension picker |
| BR-X-09 | Report scheduler and distribution | `/settings/schedule`, `/admin/notification-engine/delivery` | PARTIAL |
| BR-X-10 | AI insights engine hub with traceability | `/analytics/ai-insights`, `ai_insights` has `source_records`, `citations`, `input_fingerprint`, `review_status` (**0 rows**) | NOT CERTIFIED |
| BR-X-11 | Cross-module audit log search | `/admin/audit-logs`, `/admin/compliance-audit-logs` (430 rows) | CONFORMS |
| BR-X-12 | Case-centric audit timeline | `/admin/case-audit/:entityType/:entityId` | CONFORMS |
| BR-X-13 | Security event log | `security_event_logs` (112), `/admin/security-events` | CONFORMS |
| BR-X-14 | Export audit trail | `audit_export_jobs` (**0 rows**), `audit_export_downloads`, `/admin/audit-export` | NOT CERTIFIED |

**Business requirement roll-up:** 64 requirements — 30 CONFORMS, 18 PARTIAL, 15 NOT CERTIFIED, 1 GAP.

---

## Part B — FRD screen traceability (90 screens)

### ADM — Administration & Configuration (9)

| Screen | Route | Verdict | Note |
| --- | --- | --- | --- |
| ADM-FB-001 Form Builder Dashboard | `/admin/forms` | PARTIAL | No module guard on route (auth-only) |
| ADM-FB-002 Form Definition Editor | `/admin/forms/create` | PARTIAL | No module guard on route |
| ADM-WF-001 Workflow List | `/admin/workflow-engine` | CONFORMS | |
| ADM-WF-002 Workflow Editor | `/admin/workflow-engine/rules` | PARTIAL | Rule/stage editing present; no visual canvas |
| ADM-RE-001 Rule Library | `/admin/rule-engine` | PARTIAL | `engine_rules` = 1 row; 12 rule types not all exercised |
| ADM-RE-002 Rule Editor | `/admin/rule-engine/:id`, `/test/:family/:id` | CONFORMS | Tester RPC + pgTAP parity suite |
| ADM-RM-001 Role & Permission Manager | `/admin/roles` | CONFORMS | `sec_*` model, `sec_get_user_context()` |
| ADM-SLA-001 SLA Manager | `/admin/sla-manager` | CONFORMS | Business calendars present |
| ADM-INT-001 Integration Manager | `/settings/integrations`, `/admin/integration-logs` | CONFORMS | Retry + dead-letter queues verified |

### LIC — Licensing (13)

| Screen | Route | Verdict | Note |
| --- | --- | --- | --- |
| LIC-APP-001 Applicant Home | `/dashboard` (`ApplicantDashboard`) | PARTIAL | Route auth-only |
| LIC-APP-002 Status Tracker | `/applications/:id` | CONFORMS | |
| LIC-APP-003 Application Type Selector | `/applications/new`, `/pre-license/new`, `/post-license/new` | CONFORMS | |
| LIC-APP-004 Multi-Step Application Form | `/applications/:applicationId/forms` | CONFORMS | |
| LIC-APP-005 Submission Acknowledgement | `/registration/success`, `useSubmissionAcknowledgement` | CONFORMS | |
| LIC-APP-006 RFI Response | `/update-registration-form/:registrationId` | PARTIAL | Route auth-only |
| LIC-INT-001 Intake Queue | `/applications/queue` | CONFORMS | |
| LIC-INT-002 Application Detail & Sufficiency | `/applications/:id` | PARTIAL | Route auth-only despite privileged content |
| LIC-INT-003 RFI Composer | `/admin/rfi-auto-rules` + application detail | CONFORMS | |
| LIC-REV-001 Analyst Review Workbench | `/applications/:id` (tabs) | CONFORMS | |
| LIC-REV-002 Notifications Triggered | notification engine | CONFORMS | |
| LIC-REV-003 Legal Review | `application_legal_notes` (approver-only visibility) | CONFORMS | |
| LIC-DEC-001 Consolidated Decision View | application detail decision tab | CONFORMS | |
| LIC-DEC-002 Letter & Certificate Preview | `decision_artifacts` | NOT CERTIFIED | 0 artifacts |
| LIC-LCY-001 License Register | `/licenses`, `/registry/licensees` | CONFORMS | |

### FP — Fit & Proper (11)

| Screen | Route | Verdict |
| --- | --- | --- |
| FP-REG-001 Individual Registry Search | `/fpa/individuals` | CONFORMS |
| FP-REG-002 Create/Edit Individual | `/fpa/individuals/:id` | CONFORMS |
| FP-REG-003 Full Profile View | `/fpa/individuals/:id` | CONFORMS |
| FP-REG-004 PQ Form (individual portal) | `/declaration/:token` | CONFORMS |
| FP-SCR-001 Screening Dashboard | `/fpa/screening` | PARTIAL — no bound provider |
| FP-ASS-001 Assessment Initiation & Overview | `/fpa/initiation`, `/fpa/assessments/:id` | CONFORMS |
| FP-ASS-002 AI Analysis Review | `/fpa/ai-analysis` | NOT CERTIFIED |
| FP-COM-001 Committee Setup & Voting | `/fpa/committee` | PARTIAL |
| FP-COM-002 Issue Determination | `/fpa/determinations` | PARTIAL |
| FP-CON-001 Conditions & Monitoring | `/fpa/conditions`, `/fpa/monitoring` | NOT CERTIFIED |
| (FP appeals, per BR-FP-14) | `/fpa/appeals` | NOT CERTIFIED |

### PRU — Prudential (10)

| Screen | Route | Verdict |
| --- | --- | --- |
| PRU-ENT-001 Supervised Entity Register | `/prudential/entities`, `/entities` | CONFORMS |
| PRU-ENT-002 Entity Prudential 360 | `/entities/:entityId` | CONFORMS |
| PRU-RET-001 Return Submission Portal | `/entity/returns` | PARTIAL — route auth-only |
| PRU-RET-002 Return Intake Queue | `/returns/queue` | PARTIAL — route auth-only |
| PRU-RET-003 Return Detail & Ratio Dashboard | `/returns/filings/:filingId` | PARTIAL — route auth-only |
| PRU-ANA-001 Entity Analytics Hub | `/admin/returns/prudential/analytics` | CONFORMS |
| PRU-ASS-001 CAMELS Assessment | `/prudential/assessments/:id` | CONFORMS |
| PRU-EXM-001 Examination Lifecycle | `/prudential/examinations/:id` | CONFORMS |
| PRU-ACT-001 Supervisory Action | `/prudential/actions` | PARTIAL |
| PRU-GRP-001 Group Consolidated Risk | `/prudential/groups` | NOT CERTIFIED |
| PRU-PAY-001 Payment Systems / PFMI | `/prudential/payment-systems` | NOT CERTIFIED |

### MCS — Market Conduct (28)

| Screen | Route | Verdict |
| --- | --- | --- |
| MCS-POR-001 Portal Home | `/submit-complaint` | CONFORMS |
| MCS-POR-002 Submission Form | `/complaints/submit` | CONFORMS |
| MCS-POR-003 Acknowledgement | complaint success view | CONFORMS |
| MCS-POR-004 Public Status Tracker | `/track/complaint`, `/complaints/track/:reference` | CONFORMS |
| MCS-CMP-001 Supervisor Queue | `/complaints` | CONFORMS |
| MCS-CMP-002 Case Detail & Workbench | `/complaints/:id` | CONFORMS |
| MCS-CMP-003 Entity RFI Workbench | `/entity/complaint-rfis` | CONFORMS |
| MCS-CMP-004 Bulk Intake | `/complaints/bulk-intake` | CONFORMS |
| MCS-CMP-005 RFI Approval & Oversight | `/complaints/rfi-approvals` | CONFORMS |
| MCS-CMP-006 Closure & Quality Review | `complaint_closure_reviews` | PARTIAL — QA gate removed by business decision (see divergence register) |
| MCS-ANA-001 Conduct Dashboard | `/conduct` | PARTIAL |
| MCS-ANA-002 Pattern Alert Management | `/conduct/alerts` | NOT CERTIFIED |
| MCS-ANA-003 Intelligence Report | conduct intelligence reports | PARTIAL |
| MCS-THM-001/002/003 Thematic Reviews | `/supervision/thematic-reviews[/new|/:id]`, `/supervision/thematic-closure-approvals` | NOT CERTIFIED |
| MCS-INV-001/002/004 Investigation | `/conduct/investigations[/:id]` | NOT CERTIFIED |
| MCS-INV-003 Interview Record | `conduct_interviews` | NOT CERTIFIED |
| MCS-ENF-001 Action Initiation | `/enforcement` | CONFORMS |
| MCS-ENF-002 Compliance Monitoring | `enforcement_compliance_evidence` | PARTIAL |
| MCS-ENF-003 Register & Portfolio | `/registry/enforcement` | CONFORMS |
| MCS-SUR-001 Surveillance Dashboard | `/conduct/surveillance` | PARTIAL |
| MCS-SUR-002 Entity Conduct Profile | `/conduct/entities/:id` | CONFORMS |
| MCS-MON-001 Monitoring Rules Config | `/admin/conduct/monitoring-rules` | CONFORMS |
| MCS-MON-002 Supervision Loop | `/conduct/supervision-loop` | PARTIAL |

### DASH — Dashboards & Reporting (8)

| Screen | Route | Verdict |
| --- | --- | --- |
| DASH-EXE-001 Executive Cross-Module | `/executive` | CONFORMS |
| DASH-EXE-002 Twin Peaks Coordination | `/coordination` | CONFORMS |
| DASH-OPS-001 Operational Supervisor | `/dashboard` | PARTIAL — auth-only route |
| DASH-OPS-002 Team Performance | — | GAP |
| DASH-ENT-001 Regulated Entity Dashboard | `LicenseeDashboard` | CONFORMS |
| DASH-RPT-001 Pre-Built Reports Library | `/reports` | CONFORMS |
| DASH-RPT-002 Ad-Hoc Report Builder | `/reports` | PARTIAL |
| DASH-RPT-003 Report Scheduler & Distribution | `/settings/schedule` | PARTIAL |
| DASH-AI-001 AI Insights Hub | `/analytics/ai-insights` | NOT CERTIFIED |

### AUD — Audit & Lineage (6)

| Screen | Route | Verdict |
| --- | --- | --- |
| AUD-LOG-001 Cross-Module Audit Search | `/admin/audit-logs` | CONFORMS |
| AUD-LOG-002 Case-Centric Timeline | `/admin/case-audit/:entityType/:entityId` | CONFORMS |
| AUD-LIN-001 Data Lineage & Version History | `return_filing_versions`, `entity_identity_snapshots`, `/preview/:versionId` | PARTIAL — no single lineage viewer |
| AUD-SEC-001 Security Event Log | `/admin/security-events` | CONFORMS |
| AUD-OVR-001 Override & Justification Registry | `/admin/overrides` | PARTIAL |
| AUD-EXP-001 Export Audit Registry | `/admin/audit-export` | NOT CERTIFIED |

### NOT — Notifications (3)

| Screen | Route | Verdict |
| --- | --- | --- |
| NOT-CEN-001 Notification Centre | `/notifications` | PARTIAL — auth-only route (acceptable: personal data) |
| NOT-THR-001 Communication Thread Manager | `/correspondence/manager` | CONFORMS |
| NOT-ESC-001 Escalation & Alert Manager | `/admin/escalations`, `/alerts` | NOT CERTIFIED — `escalations` = 0 rows |

**Screen roll-up:** 90 screens — 51 CONFORMS, 24 PARTIAL, 14 NOT CERTIFIED, 1 GAP.

---

## Part C — Demo scenario traceability (58 DEMO IDs)

| Script | DEMO range | Demonstrable today | Blocked / unsafe to demo |
| --- | --- | --- | --- |
| SCRIPT_1 Unified Licensing | DEMO-ULRA-001 … 012 | 10 | 002 pending decision-artifact preview; 011 team-performance view absent |
| SCRIPT_2 Fit & Proper | DEMO-FPA-001 … 015 | 8 | Screening provider, AI analysis, findings, conditions, appeals have no data |
| SCRIPT_3 Prudential | DEMO-PRUD-001 … 011 | 8 | Breaches, EWI alerts, group consolidation, PFMI have no data |
| SCRIPT_4 Market Conduct | DEMO-MCS-001 … 010 | 5 | Investigations, thematic reviews, pattern alerts have no data |
| SCRIPT_5 Dashboards & Audit | DEMO-DPA-001 … 009 | 6 | AI insights hub, export audit registry have no data |
| **Total** | **58** | **37 (64%)** | **21 (36%)** |

---

## Part D — Role traceability (R-01 … R-14)

The FRD names 14 roles; the platform models roles dynamically through
`sec_roles` / `sec_role_permissions` plus the legacy `app_role` enum
(11 values). Mapping is therefore **configuration-complete but not
name-aligned**: no artefact in the repository states which `sec_role`
represents R-01 … R-14. This is recorded as a P1 finding in the gap
register (`GAP-XC-04`).

---

## Maintenance

Regenerate the measured columns with:

```
node scripts/generate-rbac-audit.ts        # guard + permission coverage
bunx vitest run src/test/routeCoverage.test.ts
```
Counts in Parts A–B must be re-measured whenever CERTIFICATION DATASET v1
is reseeded.
