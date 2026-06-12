# Feature Development Tracker — Unified License Hub

_Last updated: 2026-06-12_

## Purpose

This tracker maps the current `unified-license-hub` repository against the uploaded ABC SupTech BRD/SRS requirements. It is intended to help the team identify:

- Features already present in the system.
- Features that appear partially implemented or scaffolded.
- Features still pending for future development planning.

Status values:

- **Done** — feature is evidenced in the repository by routes, pages, database schema, APIs, or implemented UI behavior.
- **In Progress** — feature is partially present, scaffolded, or has a base data model/UI but needs functional completion.
- **Pending** — feature is required by BRD/SRS but no clear implementation evidence was found in the repository search.

> Note: This is a planning tracker, not a QA sign-off. Each item should be validated in the running application and database before being treated as production complete.

---

## Evidence Summary from Repository Review

Observed implementation areas:

- React/Vite application structure with routed pages under `src/pages` and route files under `src/routes`.
- Admin Hub with access to regulator management, sector/service configuration, form builder, workflow configuration, notification templates, employee/user management, RBAC, complaint management, complaint types, and audit logs.
- Supabase migrations for applications, approval workflows/actions, complaints, audit logs, user roles/RBAC, licenses, license actions, fee configurations, payments, return configurations, compliance returns, and a larger foundational returns module.
- Dashboard routes and pages for applications, licenses, payments, messages, notifications, and post-license workflows.
- License detail actions such as suspend, revoke, renew, and related action history.
- Returns module base with database schema, RLS/RBAC policies, sequences, indexes, and UI scaffolding.

Uploaded requirement sources considered:

- `ABC_System_Requirement_Specification.docx`
- `ABC_BRD_V3.docx`

---

## 1. Cross-Cutting Platform Architecture

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| ARCH-001 | Unified multi-module platform | In Progress | Repository has licensing, admin, dashboards, complaints, licenses, returns, audit, and workflows. Fit & Proper, prudential analytics, conduct investigations, and executive cross-module oversight still need full integration. |
| ARCH-002 | Configuration-driven architecture | In Progress | Admin Hub and Form Builder / Workflow Configuration are present. Confirm that all forms, rules, thresholds, workflows, permissions, SLAs, and notifications are fully configurable without code. |
| ARCH-003 | Multi-sector entity support | In Progress | Admin sector/service configuration exists. Need verify support for all required sectors: banks, building societies, merchant banks, general/life insurance, securities dealers, MCIs, FHCs, MSBs, PSPs, pensions. |
| ARCH-004 | Object-level RBAC | In Progress | User roles, role management, RLS policies, and route guards exist. Need complete role matrix alignment with BRD roles and object-level access tests. |
| ARCH-005 | Twin Peaks regulatory separation | Pending | Need independent ABC/FSC workspaces, regulator-specific views, independent determinations, shared registry, conflict handling, and coordination workflow. |
| ARCH-006 | Shared entity registry | In Progress | Licensee/admin structures exist. Need confirm single authoritative entity registry across licensing, returns, F&P, prudential, conduct, and dashboards. |
| ARCH-007 | Structured/unstructured data ingestion | Pending | Need ingestion for Excel, Word, PDF, HTML, plain text, document parsing, indexing, and AI-assisted extraction. |
| ARCH-008 | Longitudinal 2021–2025 data support | Pending | Need load and surface 20 quarters of synthetic supervisory data across all sectors. |

---

## 2. Audit, Security, Notifications, SLA

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| AUD-001 | Immutable audit log | In Progress | Cloud audit log page/API and `audit_logs` schema are present. Need ensure every view/create/edit/approve/override/export/deny action is logged with before/after values. |
| AUD-002 | Case-centric chronological audit view | In Progress | Audit Logs admin page exists. Need case/entity filtered timeline from intake through decision/enforcement. |
| AUD-003 | Data lineage and version history | Pending | Need field-level before/after lineage for applications, PQs, returns, complaints, and configuration changes. |
| AUD-004 | Override justification capture | Pending | Need mandatory justification for overriding AI/system findings and storage of original output + override. |
| AUD-005 | Export audit logging | Pending | Need log user, timestamp, export filters, report type, and exported record count for CSV/PDF exports. |
| AUD-006 | Dedicated security event log | Pending | Need separate security log for failed auth, denied access, escalation attempts, session anomalies, and integration failures. |
| NOTIF-001 | Notification engine | In Progress | Notification templates and notifications pages appear present. Need verify dispatch, preview, status logging, and event triggers. |
| NOTIF-002 | Bidirectional communication log | Pending | Need regulator/applicant RFI and response threads with sender, recipient, timestamp, content, delivery/ack status. |
| NOTIF-003 | Notification content preview before dispatch | Pending | Need preview/confirm flow before sending notifications. |
| NOTIF-004 | Escalation alerts | Pending | Need SLA, severity, breach, threshold, and condition alerts with configurable recipients. |
| SLA-001 | Configurable SLA timers | Pending | Need SLA engine per process/stage and visible countdowns in queues/cases. |
| SLA-002 | SLA pause/resume on RFI | Pending | Need automatic pause when RFI issued and resume on response, with audit entries. |
| SLA-003 | SLA breach handling | Pending | Need escalation, breach logging, status update, and closure block until acknowledgement. |
| SLA-004 | SLA reporting | Pending | Need dashboard/report widgets for on-time, near-breach, breached by officer/team/process. |

---

## 3. Module 1 — Licensing, Registration & Approval

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| LIC-001 | Applicant / pre-licensee portal | Done | Repository includes pre-licensee application routes/pages and dashboard application tracking. Validate full external user journey. |
| LIC-002 | Draft application lifecycle | In Progress | Dashboard references draft applications. Need verify timestamped draft creation, retrieval, and audit logging. |
| LIC-003 | Dynamic license forms | In Progress | Form Builder and application form pages exist. Need confirm license-type-driven dynamic sections/fields and no hardcoded forms. |
| LIC-004 | Multi-license type support | In Progress | License type administration routes exist. Need seed/configure all BRD-required license types. |
| LIC-005 | Inline validation and correction | In Progress | Application forms exist. Need verify field-level validation, error display, correction without data loss. |
| LIC-006 | Document upload with versioning | In Progress | Application forms/doc workflows appear present. Need verify file metadata, version history, and multiple document versions. |
| LIC-007 | Batch document upload | Pending | Need multi-file upload with per-file validation and success/failure reporting. |
| LIC-008 | Submission reference number and intake queue | In Progress | Applications table has generated application numbers; application queue route exists. Need verify acknowledgement and regulatory queue entry. |
| LIC-009 | Acknowledgement artifact | Pending | Need on-screen/downloadable acknowledgement with reference number, entity, license type, timestamp, contact info. |
| LIC-010 | Licensing officer queue | Done | Applications queue route/page exists. Validate required columns and role restrictions. |
| LIC-011 | Queue sorting/filtering/saved views | In Progress | Need verify sorting/filtering and add saved custom queue views if missing. |
| LIC-012 | Automated sufficiency check | Pending | Need configurable sufficiency criteria and officer confirmation/override. |
| LIC-013 | RFI issuance and response | Pending | Need case-linked RFI workflow, applicant portal response, SLA pause/resume, communication log. |
| LIC-014 | Case assignment and routing | In Progress | Approval workflows/actions exist. Need assignment UI, routing history, and assignment notifications. |
| LIC-015 | Automated analyst assessment | Pending | Need rules/AI-generated risks, findings, and routing recommendation. |
| LIC-016 | Analyst review and override | Pending | Need analyst workspace to confirm/override generated outputs with justification. |
| LIC-017 | AI explanation of conclusions | Pending | Need sources, confidence, and plain-language explanation for each AI flag. |
| LIC-018 | Legal/compliance review stage | In Progress | Workflow support exists. Need dedicated restricted legal/compliance stage and access-denial logging. |
| LIC-019 | Legal notes with restricted access | Pending | Need legal notes visible to approvers only and access-controlled for other roles. |
| LIC-020 | Supervisor escalation | Pending | Need escalation action, response, and resolution logging. |
| LIC-021 | Consolidated decision-ready view | In Progress | Application detail exists. Need single view including all documents, findings, RFIs, legal notes, SLA, risks. |
| LIC-022 | Configurable decision options | In Progress | Approval workflows/actions exist. Need per-license decision config and mandatory rationale. |
| LIC-023 | Digitally signed license artifact | Pending | License records/actions exist, but digital signature certificate generation needs implementation/integration. |
| LIC-024 | Decision letter review workflow | Pending | Need draft letter, amendment, review, approval, and dispatch workflow. |
| LIC-025 | AI-recommended decision | Pending | Need AI decision recommendation with supporting rationale and override logging. |
| LIC-026 | License renewal | In Progress | License detail includes renew action. Need full renewal cycle, near-expiry alerts, and streamlined renewal workflow. |
| LIC-027 | License revocation | In Progress | License detail includes revoke action. Need show-cause, justification, notification, and audit-complete revocation workflow. |
| LIC-028 | Bulk licensing intake | Pending | Need batch intake for 5–10+ applications and group/individual batch status. |
| LIC-029 | Licensing-to-supervision continuity | Pending | Need automatic initial risk profile and supervisory plan after license completion. |
| LIC-030 | Twin Peaks licensing coordination | Pending | Need prudential/conduct findings, shared discussion space, conflict flags, and aligned/conditional positions. |

---

## 4. Module 2 — Fit & Proper Assessment

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| FP-001 | Multiple F&P initiation paths | Pending | Need initiation via license application, monitoring trigger, ad-hoc action, and cycle-based trigger. |
| FP-002 | Unique individual identifier | Pending | Need individual registry with persistent deduplicated ID. |
| FP-003 | Individual multiple roles/entities | Pending | Need cross-entity roles and cumulative governance influence risk. |
| FP-004 | Subject profile and linked entities | Pending | Need full individual profile with roles, history, screening, findings, determinations, conditions. |
| FP-005 | F&P access control and denial logging | Pending | Need object-level access restriction and security/audit entries. |
| FP-006 | PQ data capture and validation | Pending | Need configurable Personal Questionnaire form and validation rules. |
| FP-007 | Individual declaration submission | Pending | Need declaration portal, versioning, timestamps, and assessment linkage. |
| FP-008 | Configurable screening types | Pending | Need admin-configurable screening categories and thresholds. |
| FP-009 | Automated screening/media matching | Pending | Need third-party/media screening, confidence scoring, false-positive workflow. |
| FP-010 | Large adverse media dataset handling | Pending | Need ingestion and scoring of synthetic media scenarios. |
| FP-011 | Manual screening task assignment | Pending | Need assignment, due dates, status tracking, and linked results. |
| FP-012 | Third-party evidence attachment | Pending | Need evidence uploads linked to screening/adverse findings with metadata. |
| FP-013 | Adverse finding severity classification | Pending | Need alert, severity/risk score, and routing based on severity. |
| FP-014 | Severity-based escalation | Pending | Need configurable high-severity escalation and logged routing. |
| FP-015 | Historical comparison view | Pending | Need side-by-side/delta comparison of current vs prior F&P assessments. |
| FP-016 | Individual/population trend dashboards | Pending | Need trend analytics at individual and population levels. |
| FP-017 | AI analysis of structured/unstructured data | Pending | Need AI synthesis of PQs, media, court records, PDFs/reports. |
| FP-018 | AI citations and confidence | Pending | Need AI output with cited documents/data, confidence, inconsistencies, and explanations. |
| FP-019 | Human override of AI output | Pending | Need override/reject AI findings with mandatory justification and preserved original output. |
| FP-020 | Sector-specific F&P decision logic | Pending | Need configurable rules by sector/role type. |
| FP-021 | Multi-regulator determinations | Pending | Need ABC/FSC independent determination records over shared profile data. |
| FP-022 | Committee weighted voting | Pending | Need voting form, weights, rationales, anonymised deliberation, and audit trail. |
| FP-023 | Conditional determination | Pending | Need conditions, deadlines, reminders, evidence, and breach handling. |
| FP-024 | Condition SLA breach | Pending | Need breach logging, escalation, notification, and closure block. |
| FP-025 | F&P appeals | Pending | Need standalone and linked appeals, including license status update. |
| FP-026 | Scheduled/event-based reassessment | Pending | Need annual/biannual and event-triggered reassessment schedules. |
| FP-027 | Monitoring notifications and audit | Pending | Need monitoring execution logs and trigger notifications. |

---

## 5. Module 3 — Prudential Supervision / Returns

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| PRU-001 | Supervised entity register | In Progress | Entity/licensee structures exist. Need prudential category, systemic indicators, status, assigned team. |
| PRU-002 | Configurable risk taxonomy | Pending | Need configurable risk categories/subcategories per sector with version control. |
| PRU-003 | Sector-specific thresholds | Pending | Need configure DTI, GI, LI, SD thresholds from requirements and allow admin edits. |
| PRU-004 | Historical data access | Pending | Need historical returns, ratios, assessments, actions, enforcement history on entity profile. |
| PRU-005 | Entity return submission portal | In Progress | Foundational returns module and compliance returns schema exist. Need complete sector-specific submission portal. |
| PRU-006 | Return validation rules | In Progress | Returns schema exists; need configurable cross-field, range, mandatory validations and resubmission loop. |
| PRU-007 | Supervisor return intake queue | In Progress | Returns management route/page exists. Need required columns, validation status, SLA age, role access. |
| PRU-008 | Return version history | Pending | Need amended/corrected return versions with timestamps and submitter attribution. |
| PRU-009 | Automated ratio calculation | Pending | Need formula engine, transparent formula display, and automatic calculation per period/entity. |
| PRU-010 | Threshold breach detection | Pending | Need immediate breach alerts, severity assignment, risk status update, breach history. |
| PRU-011 | Peer comparison analytics | Pending | Need configurable peer groups, peer averages, outlier detection. |
| PRU-012 | Multi-period trend analysis | Pending | Need 2021–2025 ratio trend charts and trend classification. |
| PRU-013 | Group-level risk aggregation | Pending | Need FHC/subsidiary consolidation for CB1, GI1, SD1, MCI. |
| PRU-014 | Macro-financial context integration | Pending | Need macro data ingestion and overlay beside entity analytics. |
| PRU-015 | Supervisory assessment recording | Pending | Need CAMELS/risk assessment forms with evidence links and narratives. |
| PRU-016 | Risk score aggregation | Pending | Need configurable weighting and overall risk score history. |
| PRU-017 | Supervisory actions | Pending | Need remediation, intensified supervision, direction letter, restriction, enforcement referral workflows. |
| PRU-018 | Escalation routing | Pending | Need configurable escalation rules and logged routing path. |
| PRU-019 | Remediation tracking | Pending | Need deadlines, statuses, evidence upload, supervisor approve/reject. |
| PRU-020 | Early Warning Indicators | Pending | Need configurable EWI rules, alerts, execution log, and dashboard display. |
| PRU-021 | Event-based monitoring | Pending | Need event triggers on return submission and other defined events. |
| PRU-022 | Examination report ingestion | Pending | Need PDF ingestion, linking, searchability, and entity profile display. |
| PRU-023 | Payment systems/MSB oversight | Pending | BRD adds payment systems/MSB workflows and forms; no clear implementation evidence found. |
| PRU-024 | Stress testing/scenario analysis | Pending | BRD Should item; need scenario definition, results, and reports. |

---

## 6. Module 4 — Market Conduct / Complaints / Investigations

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| MCS-001 | Configurable conduct taxonomy | In Progress | Complaint Types admin exists. Need broader conduct risk taxonomy and product/channel mapping. |
| MCS-002 | Conduct supervisory universe | Pending | Need product/channel inventory and conduct history on entity profile. |
| MCS-003 | Historical conduct context | Pending | Need trends of complaint volumes/types/resolution outcomes over time. |
| MCS-004 | Multi-channel complaint intake | In Progress | Complaints table/management and complaint routes exist. Need portal, manual entry, email/call centre/chatbot ingestion alignment. |
| MCS-005 | Complaint reference and acknowledgement | In Progress | Complaint number generator exists. Need acknowledgement artifact visible to complainant/regulator. |
| MCS-006 | Complaint classification | In Progress | Complaint types configuration exists. Need configurable severity/product/channel fields and workflow. |
| MCS-007 | Automated prioritization/routing | Pending | Need priority score and automatic routing by rules/availability. |
| MCS-008 | Complaint SLA tracking | Pending | Need configurable SLA, near-breach/breach alerts, dashboard reporting. |
| MCS-009 | Synthetic complaints data load | Pending | Need load New FinCorp complaints XLSX and demonstrate analytics. |
| MCS-010 | Conduct analytics dashboard | Pending | Need volume trends, spikes, repeat complainants, emerging issue patterns, alert trigger. |
| MCS-011 | Pattern-based alerts | Pending | Need configurable pattern threshold rules referencing underlying data. |
| MCS-012 | Thematic review initiation | Pending | Need initiate thematic review from alert or independently. |
| MCS-013 | Thematic review record and assignment log | Pending | Need charter, assigned team, status tracking, audit log. |
| MCS-014 | Formal investigation escalation | Pending | Need one-action escalation to restricted investigation workflow. |
| MCS-015 | Restricted investigation access | Pending | Need investigator role, restricted evidence access, denial logging. |
| MCS-016 | Evidence repository | Pending | Need secure evidence uploads with metadata and immutable investigation linkage. |
| MCS-017 | Supervisory action/outcome recording | Pending | Need remediation/warning/restriction/sanction/penalty outcome, rationale, evidence links, letter generation. |
| MCS-018 | Outcome notifications | Pending | Need notifications to entity with action, rationale, deadline, escalation consequences. |
| MCS-019 | Ongoing conduct monitoring rules | Pending | Need recurrence and relapse monitoring with execution log. |
| MCS-020 | Closed-loop oversight dashboard | Pending | Need trend → case → action → outcome drill-down. |
| MCS-021 | Proactive market surveillance | Pending | BRD Should item: product pricing, disclosure, advertising monitoring. |
| MCS-022 | Financial literacy/education tracking | Pending | BRD Could item: programme management and outcome metrics. |

---

## 7. Module 5 — Dashboards, Reporting & Data Governance

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| DASH-001 | Unified cross-module dashboard | In Progress | Dashboard exists for application/user stats. Need aggregate KPIs across licensing, F&P, prudential, conduct, SLA, actions. |
| DASH-002 | AI-driven dashboard insights | Pending | Need natural-language insights with cited source data. |
| DASH-003 | Role-specific dashboard views | In Progress | Dashboard uses role-based data concepts. Need full executive/operator/entity widget separation and object-level visibility. |
| DASH-004 | Drill-down navigation | In Progress | Dashboard links/pages exist. Need ensure every metric drills to filtered list then individual record. |
| RPT-001 | Pre-built operational reports | In Progress | Report pages/routes appear in repo search. Need required report set and live data integration. |
| RPT-002 | Report filters and segmentation | Pending | Need filters by time period, entity, sector, risk rating, officer, etc., with saved presets. |
| RPT-003 | Ad-hoc report builder | Pending | Need data source/field/filter/grouping builder, save/share reports. |
| RPT-004 | Controlled CSV/PDF export | Pending | Need export plus audit log entries. |
| GOV-001 | Integration event logging | Pending | Need inbound/outbound integration event log with direction, endpoint, payload summary, success/failure. |
| GOV-002 | Security event log | Pending | Need dedicated security log separate from audit log. |
| GOV-003 | Integration readiness | Pending | Need documented APIs/file exchange for external providers, other regulators, reporting, identity/auth services. |

---

## 8. Admin Configuration, Form Builder, Workflow Designer, Rule Engine

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| CFG-001 | Admin Hub | Done | Admin Hub exists and exposes core admin modules. |
| CFG-002 | Form Builder core capabilities | In Progress | Form Builder page exists. Need verify field types, conditional display, multi-step, versioning, preview, fees, multilingual support, auto-population. |
| CFG-003 | Licensing form catalogue | Pending | Need configure LF-001 to LF-011, renewal, variation, suspension/revocation forms. |
| CFG-004 | F&P form catalogue | Pending | Need PQ, annual declaration, material change, adverse response, condition evidence, appeal forms. |
| CFG-005 | Prudential return forms | In Progress | Returns base exists. Need configure PR-001 to PR-016 and templates. |
| CFG-006 | Supervisory assessment/exam forms | Pending | Need CAMELS, onsite scoping, findings, summary report, management response, CAP, PFMI, action order, stress test forms. |
| CFG-007 | Market conduct forms | Pending | Need complaint, classification, thematic review, investigation, interview, evidence, enforcement, remediation, surveillance forms. |
| CFG-008 | Workflow Designer core capabilities | In Progress | Workflow configuration/routes and approval workflow schema exist. Need stage/transition/SLA/escalation/parallel/versioning UI validation. |
| CFG-009 | Licensing workflows | In Progress | Approval workflow base exists. Need implement WF-L01 through WF-L07 completely. |
| CFG-010 | F&P workflows | Pending | Need WF-F01 through WF-F05. |
| CFG-011 | Prudential workflows | Pending | Need WF-P01 through WF-P05. |
| CFG-012 | Market conduct workflows | Pending | Need WF-M01 through WF-M05. |
| CFG-013 | Rule engine | Pending | Need configurable threshold, trend, peer, pattern, validation, routing, SLA, condition, recurrence, scheduling, macro, group contagion rules. |
| CFG-014 | Rule versioning and sandbox testing | Pending | Need rule version history, sandbox test run, activation, rollback, execution log. |

---

## 9. Data Loading & Demo Preparation

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| DATA-001 | Entity universe load | Pending | Load all 35+ entity profiles with correct sector classifications and identifiers. |
| DATA-002 | Risk thresholds load | Pending | Configure all risk indicator thresholds per sector. |
| DATA-003 | Quarterly financial data load | Pending | Import 2021 Q1–2025 Q4 balance sheet/P&L for all entities. |
| DATA-004 | Macro data load | Pending | Import macro-financial data and link to analytics. |
| DATA-005 | F&P PQ load | Pending | Create 15 individual profiles and load PQ files with persistent IDs. |
| DATA-006 | Adverse media scenario load | Pending | Ingest 14 adverse media/background scenarios and link to individual profiles. |
| DATA-007 | Examination report load | Pending | Ingest 5 PDFs and link to New FinCorp entities. |
| DATA-008 | Complaints data load | Pending | Load New FinCorp Commercial Bank complaints XLSX for conduct analytics. |
| DATA-009 | New FinCorp licensing case | Pending | Pre-configure or prepare live New FinCorp license submission. |
| DATA-010 | Group aggregation verification | Pending | Verify FHC consolidation across CB1, GI1, SD1, MCI. |
| DATA-011 | Role setup for demo | In Progress | RBAC exists. Need create/verify all required role accounts and denial tests. |
| DATA-012 | Continuity smoke test | Pending | Submit test application and verify licensing → F&P → prudential → conduct → dashboard/audit continuity. |

---

## 10. Non-Functional Requirements

| ID | Feature / Task | Status | Description / Next Action |
|---|---|---:|---|
| NFR-001 | Page load under 3 seconds | Pending | Need performance testing under demo and production load. |
| NFR-002 | Analytics calculation speed | Pending | Need benchmark ratio calculations and reports across full dataset. |
| NFR-003 | Concurrent users | Pending | BRD requires production 500 concurrent users, demo/UAT 50. Need load testing. |
| NFR-004 | Report generation timing | Pending | Need benchmark pre-built and ad-hoc reports. |
| NFR-010 | MFA/SSO authentication | In Progress | Supabase auth exists. Need verify MFA and SSO support/configuration. |
| NFR-011 | Encryption | Pending | Need deployment/security verification for encryption at rest and TLS 1.2+. |
| NFR-012 | Session management | Pending | Need configurable inactivity timeout and concurrent session flagging. |
| NFR-013 | RBAC immediate enforcement | In Progress | RBAC/RLS exists. Need test immediate effect of role changes. |
| NFR-020 | Admin configuration UI | In Progress | Admin UI exists. Need prove all configurable elements are admin-managed without code deployment. |
| NFR-021 | Configuration version control | Pending | Need versioning, change log, rollback for forms/workflows/rules/thresholds. |
| NFR-022 | Zero hardcoded business logic | Pending | Need audit code paths and migrate business rules into configuration/rule engine. |
| NFR-023 | Accessibility WCAG 2.1 AA | Pending | Need accessibility audit for portals, forms, tables, queues, navigation. |
| NFR-024 | Backup/DR/RTO/RPO | Pending | Need infrastructure plan and DR testing evidence. |

---

## Recommended Development Priorities

### Priority 1 — Complete Licensing Core

1. Finish RFI + SLA pause/resume + communication log.
2. Finish sufficiency check and configurable decision workflow.
3. Implement acknowledgement and decision artifacts.
4. Add digital license certificate generation/signing.
5. Strengthen audit logging for all licensing actions.

### Priority 2 — Build Rule/SLA/Audit Foundations

1. Implement generic rule engine.
2. Implement SLA engine shared across modules.
3. Implement field-level data lineage and version history.
4. Implement security event log separate from operational audit log.
5. Implement export audit logging.

### Priority 3 — Prudential Returns and Analytics

1. Complete returns portal and validation loop.
2. Add formula/ration calculation engine.
3. Configure thresholds and breach detection.
4. Add EWI and peer/trend analytics.
5. Load synthetic 2021–2025 prudential data.

### Priority 4 — Fit & Proper Module

1. Add individual registry and PQ form.
2. Add screening/adverse media workflows.
3. Add AI-assisted analysis with citations/confidence.
4. Add committee voting and determinations.
5. Add ongoing monitoring and appeals.

### Priority 5 — Market Conduct and Investigations

1. Complete complaint intake, classification, and SLA tracking.
2. Add conduct analytics/pattern alerts.
3. Add thematic review workflow.
4. Add restricted investigation workspace and evidence repository.
5. Add enforcement outcomes and recurrence monitoring.

### Priority 6 — Executive Dashboards and Reporting

1. Build unified cross-module dashboard.
2. Add role-specific widgets and drill-downs.
3. Add operational report pack.
4. Add ad-hoc report builder.
5. Add AI dashboard insights with cited source data.

---

## Validation Checklist Before Marking Items Done

For each tracker item, confirm:

- UI route/page exists and is reachable by the correct role.
- Database tables/columns/RLS policies support the feature.
- Workflow state transitions are persisted.
- Required notifications are generated and logged.
- Audit log records user, timestamp, action, object, before/after values where applicable.
- Access denial is tested and logged where restricted access is required.
- Feature works with uploaded demo/synthetic data.
- No required business rule is hardcoded where the BRD/SRS requires configuration.
