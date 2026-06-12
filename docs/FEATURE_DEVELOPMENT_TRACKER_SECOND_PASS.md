# Feature Development Tracker — Second Pass

_Last updated: 2026-06-12_
_Author: Lovable agent (code-evidence review)_
_Companion to:_ `docs/FEATURE_DEVELOPMENT_TRACKER.md` (first pass — not superseded)

---

## 1. Scope and Method

This document is a **second-pass, evidence-based feature coverage matrix** for the
`unified-license-hub` repository, compared against the requirements in:

- `ABC_System_Requirement_Specification.docx` (SRS)
- `ABC_BRD_V3.docx` (BRD)

**Method**

- Static review of the repository tree only — `src/`, `supabase/migrations/`,
  `supabase/functions/`, `docs/`, `package.json`, route files, and the Lovable
  Cloud schema (≈110 public tables, 190 migrations, 30+ edge functions).
- Each feature is graded against concrete repository evidence (file paths,
  routes, Supabase tables, edge functions, migration names, test files).
- **This is NOT runtime QA.** Existence of UI/schema/route does not guarantee
  end-to-end behavior. Items requiring such confirmation are flagged
  `Needs Verification`.
- Where requirements depend on Row-Level Security or server-side enforcement,
  the matrix says so explicitly.

**Status legend**

| Status | Meaning |
|---|---|
| Done | Clear evidence of UI + persistence + (where applicable) workflow/edge logic. |
| In Progress | Partial evidence — e.g. schema + admin screen but no end-user flow, or UI without enforcement. |
| Needs Verification | Code suggests the feature exists but runtime behavior, RLS, or completeness must be confirmed manually. |
| Pending | No meaningful repository evidence found. |

**Effort legend**

| Effort | Meaning |
|---|---|
| S | < 1 day of focused work |
| M | 1–3 days |
| L | 1–2 weeks |
| XL | Module-level build, multi-sprint |

---

## 2. Executive Summary

The repository is a mature **Licensing + Registration + Returns + Workflow**
platform built on React 18 / Vite / TypeScript / Tailwind / shadcn-ui with a
Supabase (Lovable Cloud) backend. Approximately **190 migrations**, **110 public
tables**, **30+ edge functions**, and a deep admin configuration surface
(Form Builder, Workflow Builder with versioning, Registration Form Builder,
Master Data Management, Notification Templates, Fee Management, Return
Configuration, RBAC, Audit Logs) are in place. The most recently hardened
area is the Approval Workflow Builder, which now supports per-action
configuration, specific-user approvers, editable step order, full v2 template
snapshots, and immutable version pinning of in-flight instances.

**Overall implementation maturity: ≈ 55 %** (weighted by BRD module scope).

**Module-level high-level coverage (detail in Section 3):**

- Platform / Admin / Configuration — strong (≈ 75 %)
- Licensing & Registration — strong (≈ 70 %)
- Prudential / Returns — mid (≈ 55 %, configuration + intake only; no analytics)
- Market Conduct / Complaints — early (≈ 30 %, intake + types only)
- Fit & Proper — minimal (≈ 5 %, individuals modelled only as web users)
- Dashboards / Reporting / Audit — mid (≈ 45 %, audit + report engine scaffold)
- Non-Functional — mid (≈ 50 %, auth + RLS + RBAC; MFA partial; perf untested)
- Data / Demo Readiness — low (≈ 15 %, no synthetic universe loaded)

**Key risks and blockers**

1. **Fit & Proper module is absent.** No PQ forms, no individual registry as a
   first-class entity, no adverse-media screening, no committee voting. This
   is an XL build.
2. **Prudential analytics are absent.** Returns are submitted and reviewed but
   no ratios, thresholds, breach alerts, peer comparison, CAMELS, EWIs, group
   aggregation, or macro overlay exist.
3. **Twin Peaks (ABC/FSC) regulator coordination is unproven.** Multiple
   regulators exist in schema but cross-regulator determination, conflict
   handling, and shared individual registry are not implemented.
4. **SLA engine is partial.** Workflow steps carry `sla_hours` columns but
   pause/resume on RFI, breach escalation, and SLA reporting widgets are
   missing.
5. **Demo data is not loaded.** No 2021–2025 quarterly synthetic universe,
   no FinCorp group, no macro/adverse-media datasets — blocks end-to-end demo.
6. **Reporting exports lack export-audit logging.** A `report_logs` table
   exists, but export user/filters/record-count audit needs confirmation.
7. **Override-justification capture for AI/system findings is missing**
   (BRD audit requirement).

**Biggest gaps for future development**

- Fit & Proper module (XL)
- Prudential analytics + EWIs + CAMELS + ratios (XL)
- Market Conduct investigations + restricted evidence repository (L)
- Twin Peaks coordination + cross-regulator determinations (L)
- SLA engine end-to-end (M–L)
- Demo data pack (M)

---

## 3. Module Coverage Scorecard

| Module | Coverage | Notes |
|---|---:|---|
| Platform Architecture / Configuration | **75 %** | Strong admin surface; configurable forms, workflows, fees, masters, notifications. Twin Peaks isolation and ingestion of unstructured data are weak. |
| Licensing & Registration | **70 %** | Registration, draft → submit → review, dynamic forms, decision letters, license actions (suspend/revoke/renew). Missing bulk intake, digital certificate generation, decision-ready cockpit, licensing-to-supervision handoff. |
| Fit & Proper Assessment | **5 %** | Only `pre_license_users`, `entity_user_access`, and primary/secondary user concepts exist. No PQ, no screening, no committee, no appeals. |
| Prudential Supervision / Returns | **55 %** | Return types, configurations, due dates, late fees, intake queue, review workflow, version history all present. No ratios, thresholds, EWIs, peer/macro analytics, CAMELS, stress tests. |
| Market Conduct / Complaints / Investigations | **30 %** | Complaint intake + types + listing + assignment present. No SLA enforcement, no thematic review, no investigation case file, no enforcement-outcome lifecycle, no restricted evidence repository. |
| Dashboards / Reporting / Auditability | **45 %** | Role-aware dashboards, audit log table + admin UI, full reporting metadata model (`report_*` tables), generate-report edge function, scheduling. Drill-down depth, AI insights, export-audit, security event log not evidenced. |
| Non-Functional Requirements | **50 %** | Supabase auth, force-password change, RLS everywhere, dynamic RBAC, route guards. MFA gate present but provider config unverified. No load/perf or DR evidence. |
| Data Loading / Demo Readiness | **15 %** | Master data import dialogs and seeders exist; no large synthetic universe, no quarterly returns data, no macro/adverse-media datasets, no FinCorp group. |

---

## 4. Critical Gaps

| # | Gap | Impact | Recommended Phase |
|---|---|---|---|
| 1 | Fit & Proper module absent (PQ, individual registry, screening, committee, appeals) | Cannot demonstrate F&P assessment lifecycle | Phase 3 |
| 2 | Prudential analytics (ratios, thresholds, breach alerts, CAMELS, EWI, peer/macro, group) | Returns are intake-only; supervisory value missing | Phase 2 |
| 3 | SLA pause/resume + breach escalation + SLA dashboards | Process accountability story incomplete | Phase 1 |
| 4 | Market Conduct investigation case-file + restricted evidence repository + enforcement outcomes | Conduct lifecycle stops at intake | Phase 4 |
| 5 | Twin Peaks coordination (ABC/FSC), shared individual registry, multi-regulator determinations | Required by BRD | Phase 3 |
| 6 | Digital license certificate generation + decision-letter template engine | Decision artefacts incomplete | Phase 1 |
| 7 | Export-audit logging + dedicated security event log + override justification capture | Audit BRD requirements unmet | Phase 1 |
| 8 | 2021–2025 quarterly synthetic universe + FinCorp group + macro/adverse-media datasets | Demo cannot tell a credible story | Phase 5 |
| 9 | AI insights (dashboard cards, adverse media analysis, drill-downs) | BRD AI promise unmet | Phase 5 |

---

## 5. Requirement-to-Code Matrix

### 5.A Platform / Admin / Configuration

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| PLT-001 | Admin Hub | Done | Admin landing page wires every admin module. | `src/pages/admin/AdminHub.tsx`, `/admin` route in `src/routes/adminRoutes.tsx` | None material. | — | S |
| PLT-002 | Form Builder (license forms) | Done | Builder + management screens, schema, versioning, historical render. | `src/pages/admin/FormBuilder.tsx`, `FormManagement.tsx`, `src/components/form-builder/*`, tables `form_templates`, `form_versions`, `form_fields`, `field_conditions`, `form_field_dependencies` | Bulk import covered for masters; form-template import flow needs verification. | Smoke-test publish + version pinning. | S |
| PLT-003 | Workflow Designer (Approval Workflow Builder v2) | Done | Step ordering, per-action notifications, specific-user approvers, version snapshot + publish RPC, immutable instance pinning. | `src/pages/workflows/WorkflowList.tsx`, `src/components/workflows/*`, `src/hooks/useWorkflowVersions.ts`, `src/lib/workflowTemplateSnapshot.ts`, tables `approval_workflows`, `approval_workflow_versions`, `approval_steps`, `approval_step_actions`, `approval_action_notifications`, `workflow_instances`, RPC `publish_workflow_version` | Visual canvas (vs list editor) not present; cross-regulator template scope unverified. | Add timeline visualizer; verify cross-regulator scoping. | M |
| PLT-004 | Registration Form Builder | Done | Dedicated builder + preview + multi-step config. | `src/pages/admin/RegistrationFormBuilder.tsx`, `RegistrationFormPreviewPage.tsx`, `src/components/registration-builder/*`, `registration_form_configs`, `registration_form_submissions` | Versioning model lighter than license forms; verify draft/publish. | Align with license-form versioning. | M |
| PLT-005 | Role Management / RBAC | Done | Dynamic role assignment, `has_role` SECURITY DEFINER pattern, route guards. | `src/pages/admin/RoleManagement.tsx`, `src/components/auth/RouteGuards.tsx`, `src/hooks/useUserPermissions.ts`, tables `roles`, `permissions`, `role_permissions`, `user_roles`, `user_dynamic_roles` | Object-level matrix against BRD personas not audited. | Produce a role × module access matrix. | S |
| PLT-006 | Master Data Management | Done | Two-tier (types + items) with import dialogs. | `src/pages/admin/MasterDataManagement.tsx`, `src/components/admin/MasterDataImportDialog.tsx`, `MasterDataItemsImportDialog.tsx`, tables `master_data_types`, `master_data_items` | None material. | — | S |
| PLT-007 | Sector / Regulator configuration | Done | Regulator + sector/sub-sector/category/service masters with admin UI; PPOC mappings; global active-sector context. | `src/pages/admin/RegulatorManagement.tsx`, `MasterConfiguration.tsx`, `PpocManagement.tsx`, `src/contexts/ActiveSectorContext.tsx`, `RegulatorContext.tsx`, tables `regulators`, `sectors`, `sub_sectors`, `categories`, `services`, `ppoc_*` | Sector coverage breadth (Twin Peaks scope) needs data seed. | Seed full BRD sector catalogue. | S |
| PLT-008 | Notification templates | Done | Templates + event configs + dispatch log + dispatch edge fn. | `src/pages/admin/NotificationTemplates.tsx`, edge fn `dispatch-notification-event`, `send-notification`, tables `notification_templates`, `notification_event_configs`, `notification_dispatch_log` | Template preview before send not surfaced. | Add preview/test-send UI. | S |
| PLT-009 | Fee configuration + breakdown | Done | Configurable rules, components, types, breakdowns, late-fee structures. | `src/pages/admin/FeeManagement.tsx`, `src/lib/applicationFeeBreakdown.ts`, tables `fee_configurations`, `fee_rules`, `fee_components`, `fee_types`, `late_fee_structures`, `late_fee_penalty_tiers` | Refund workflow gates documented in memory; audit UI for refunds limited. | Verify refund flow + admin override controls. | S |
| PLT-010 | Rule engine (conditional logic) | In Progress | Field conditions, dependencies, safe arithmetic parser. | `src/lib/safeEval.ts`, tables `field_conditions`, `form_field_dependencies` | Cross-module rule engine (e.g. risk thresholds) absent. | Generalize to a thresholds engine for returns. | L |
| PLT-011 | SLA configuration | In Progress | `sla_hours` on `approval_steps`; queue SLA wiring tested. | `src/test/applicationsQueueSlaWiring.test.ts`, `approval_steps.sla_hours` | No pause/resume on RFI, no breach escalation engine, no SLA report widgets. | Build SLA service + breach jobs + dashboard widgets. | L |
| PLT-012 | Configuration versioning / rollback | In Progress | Workflows have full snapshot + publish. Forms have versions. | `approval_workflow_versions`, `form_versions`, `application_form_versions`, `return_form_versions`, `registration_form_configs` (single-row) | Registration configs, fees, masters not versioned. | Extend snapshot pattern to fees/masters/registration. | L |

### 5.B Licensing & Registration

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| LIC-001 | Applicant portal | Done | Public `/register` + applicant dashboard + draft resumption. | `src/pages/Register.tsx`, `src/components/dashboard/ApplicantDashboard.tsx`, `src/pages/registration/*` | None material. | — | S |
| LIC-002 | Draft applications | Done | Applications continue route, draft staging. | `/applications/:id/continue`, `applications` table | — | — | S |
| LIC-003 | Dynamic license forms | Done | Form renderer + version pinning + acknowledgements. | `src/components/form-renderer/FormRenderer.tsx`, `application_form_versions`, `form_responses` | — | — | S |
| LIC-004 | License type configuration | Done | License-type concept via sectors + services + master data. | `services`, `sectors`, `categories`, `master_data_*` | Explicit "license type" table not present; relies on category model. | Confirm BRD-aligned license-type taxonomy. | M |
| LIC-005 | Document uploads | Done | Secure storage, 20 MB cap, signed URLs, multi-file staging. | `src/lib/secureFileUpload.ts`, `src/components/documents/*`, `documents`, `file_uploads` | — | — | S |
| LIC-006 | Submission reference number | Done | Generated on submit (registrations + applications). | `registrations.application_id`-style refs, code in `verify-and-submit` edge fn | Format/uniqueness guarantee needs verification. | DB check. | S |
| LIC-007 | Acknowledgement artifact | In Progress | `ReviewAcknowledgement` component + tests. | `src/components/applications/ReviewAcknowledgement.tsx`, `src/test/acknowledgmentMetadata.test.ts` | PDF/email acknowledgement artefact generation not evidenced. | Generate PDF via edge fn. | M |
| LIC-008 | Licensing officer queue | Done | Application queue with filters + per-action permissions. | `src/pages/applications/ApplicationsList.tsx`, `src/lib/applicationQueueFilters.ts` | — | — | S |
| LIC-009 | Sufficiency check | Needs Verification | Workflow actions include review/return-for-info patterns. | `approval_step_actions`, `WorkflowPanel.tsx` | Explicit sufficiency-check checklist UI not found. | Add checklist control. | M |
| LIC-010 | RFI workflow | In Progress | Return-for-info action exists; resubmission UI handles re-open. | `src/lib/applicationStatus.ts`, `applications.status` | SLA pause on RFI missing. | Wire SLA pause. | M |
| LIC-011 | Assignment and routing | Done | Auto-routing with prefix matching + delegation rules. | `delegation_rules`, `src/pages/delegation/DelegationRules.tsx`, `src/test/delegationExpiry.test.ts` | — | — | S |
| LIC-012 | Analyst review | Done | Review acknowledgement + workflow steps. | `src/components/applications/ApplicationReviewBuilder.tsx` | — | — | S |
| LIC-013 | Legal/compliance review step | Needs Verification | Workflow steps configurable; specific legal/compliance personas not seeded. | `approval_steps` | Persona seed missing. | Seed roles + sample workflow. | S |
| LIC-014 | Decision-ready view | Pending | No dedicated decision-cockpit component found. | — | Build consolidated decision panel. | Build "Decision Pack" view per application. | M |
| LIC-015 | Decision letter generation | Pending | Templates exist for notifications; no PDF letter generator. | `notification_templates` | Letter template engine missing. | Add letter template + PDF render edge fn. | M |
| LIC-016 | Digital license certificate | Pending | License records exist; no certificate PDF or signature. | `licenses` | Certificate generator missing. | Edge fn with signed PDF. | M |
| LIC-017 | Renewal | Done | License action handled. | `src/pages/licenses/LicenseDetail.tsx`, `license_actions` | Auto-reminder needs verification. | Cross-check `license-expiry-reminders` edge fn. | S |
| LIC-018 | Revocation | Done | License action. | `license_actions` | — | — | S |
| LIC-019 | Suspension | Done | License action. | `license_actions` | — | — | S |
| LIC-020 | Variation / amendment | In Progress | Post-license application flow exists. | `src/pages/NewPostLicenseApplication.tsx`, `PostLicenseApplicationForms.tsx` | Variation-specific schema + diff view absent. | Add variation comparison. | M |
| LIC-021 | Bulk intake | Pending | No bulk-intake feature found. | — | Build CSV/Excel licensee import. | Excel template + edge fn. | L |
| LIC-022 | Licensing → supervision handoff | Pending | No explicit handoff event / trigger found. | — | Add post-approval automation that registers entity into returns + supervisory queue. | Edge fn + trigger. | M |
| LIC-023 | Twin Peaks coordination | Pending | Multi-regulator schema only. | `regulators`, `ppoc_*` | Cross-regulator workflow not built. | Design coordination workflow. | L |
| LIC-024 | License lifecycle auto-generation | Done | Documented in memory; license generated on approval. | `approve-pre-licensee` edge fn, `licensee-onboarding` flow | — | — | S |

### 5.C Fit & Proper Assessment

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| FAP-001 | Individual registry (persistent ID) | Pending | Only `profiles`, `pre_license_users`, `entity_user_access` exist (web-user model). | `profiles`, `pre_license_users`, `entity_user_access` | No "individual" entity separable from web user; no global ID across entities. | New `individuals` table + linkages. | L |
| FAP-002 | Multiple roles per individual across entities | In Progress | `entity_user_access` allows multi-entity mapping. | `entity_user_access` | Not role/F&P-classified. | Extend to F&P role taxonomy. | M |
| FAP-003 | PQ forms | Pending | Generic form builder exists; no PQ-specific schema. | — | Define PQ schema in form builder + seed templates. | L |
| FAP-004 | Declaration submission | Pending | — | — | Build declaration flow. | M |
| FAP-005 | Screening types (criminal, sanctions, regulatory) | Pending | — | — | Define types + screening table. | M |
| FAP-006 | Automated adverse-media screening | Pending | No integration found. | — | Integrate provider via edge fn. | L |
| FAP-007 | Manual screening tasks | Pending | — | — | Build task queue. | M |
| FAP-008 | Evidence attachment | Needs Verification | Generic `file_uploads` + `documents` reusable. | `documents`, `file_uploads` | F&P evidence taxonomy missing. | Add evidence types. | S |
| FAP-009 | Adverse finding classification | Pending | — | — | — | M |
| FAP-010 | Historical comparison | Pending | — | — | — | M |
| FAP-011 | AI analysis | Pending | No Lovable AI integration found in repo. | — | Use Lovable AI Gateway for analysis. | L |
| FAP-012 | Sector-specific determination logic | Pending | — | — | — | L |
| FAP-013 | Multi-regulator determinations | Pending | — | — | — | L |
| FAP-014 | Committee weighted voting | Pending | — | — | — | L |
| FAP-015 | Conditions & monitoring | Pending | — | — | — | M |
| FAP-016 | Appeals | Pending | — | — | — | M |
| FAP-017 | Scheduled reassessments | Pending | — | — | Cron via Supabase scheduled functions. | M |

### 5.D Prudential Supervision / Returns

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| PRU-001 | Entity register | Done | Licensees table + admin detail (10-tab). | `src/pages/admin/LicenseeDetail.tsx`, `licensees`, `licenses` | — | — | S |
| PRU-002 | Return configuration | Done | Types, configs, cutoffs, due dates, late fees, notification templates. | `src/pages/admin/returns/*`, tables `return_types`, `return_configs`, `return_configurations`, `return_config_forms`, `return_cutoff_config`, `return_due_dates`, `late_fee_structures`, `late_fee_penalty_tiers`, `return_notification_templates` | — | — | S |
| PRU-003 | Return submission portal | Done | Entity returns dashboard + create/fill/view pages. | `src/pages/entity/returns/*`, `compliance_returns`, `return_form_data`, `returns_filed` | — | — | S |
| PRU-004 | Return validation | In Progress | Form-level validation via form renderer; safe arithmetic. | `src/lib/safeEval.ts`, `form_fields` | Schema-level cross-field business rules not modeled centrally. | Threshold/ratio rule engine. | L |
| PRU-005 | Return intake queue | Done | View queue + review panel + workflow. | `src/pages/returns-mgmt/ViewReturns.tsx`, `ReturnDetail.tsx`, `src/components/returns/ReturnReviewPanel.tsx`, `ReturnWorkflowPanel.tsx` | — | — | S |
| PRU-006 | Version history | Done | `return_form_versions` + return audit log. | `return_form_versions`, `return_audit_log` | — | — | S |
| PRU-007 | Ratio calculation | Pending | — | — | Define ratios per sector. | L |
| PRU-008 | Threshold configuration | Pending | — | — | Build thresholds table. | M |
| PRU-009 | Breach alerts | Pending | — | — | Reuse `notification_event_configs`. | M |
| PRU-010 | Peer comparison | Pending | — | — | — | L |
| PRU-011 | Trend charts | Pending | — | — | — | M |
| PRU-012 | Group-level risk aggregation | Pending | `entity_relationships` exists; aggregation logic absent. | `entity_relationships` | Build group rollup. | L |
| PRU-013 | Macro-financial overlay | Pending | — | — | — | L |
| PRU-014 | Supervisory assessments | Pending | — | — | — | L |
| PRU-015 | CAMELS scoring | Pending | — | — | — | L |
| PRU-016 | Supervisory actions | Pending | License actions cover suspend/revoke; supervisory action lifecycle missing. | `license_actions`, `enforcement_actions` | — | M |
| PRU-017 | Remediation tracking | Pending | `enforcement_actions` table only. | `enforcement_actions` | UI absent. | M |
| PRU-018 | Early Warning Indicators | Pending | — | — | — | L |
| PRU-019 | Event-based monitoring | Pending | — | — | — | L |
| PRU-020 | Examination report ingestion | Pending | — | — | — | M |
| PRU-021 | Payment systems / MSB oversight | Pending | — | — | — | L |
| PRU-022 | Stress testing | Pending | — | — | — | XL |

### 5.E Market Conduct / Complaints / Investigations

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| MC-001 | Complaint intake | Done | List page + intake; contact data autofill. | `src/pages/complaints/ComplaintsList.tsx`, `complaints` | — | — | S |
| MC-002 | Complaint reference number | Needs Verification | `complaints.complaint_number`-style column expected. | `complaints` | Verify uniqueness/format. | DB check. | S |
| MC-003 | Complaint acknowledgement | Needs Verification | Notification dispatch on intake likely. | `notification_event_configs` | Confirm event seeded. | Inspect seeds. | S |
| MC-004 | Complaint type configuration | Done | Admin module. | `src/pages/admin/ComplaintTypes.tsx`, `complaint_types` | — | — | S |
| MC-005 | Classification | In Progress | Type + sector linkages. | `complaints` | Severity / categorical taxonomy not modeled. | Add classification fields. | S |
| MC-006 | Priority scoring | Pending | — | — | Add scoring rules. | M |
| MC-007 | Routing | Needs Verification | Delegation rules + workflow reusable. | `delegation_rules` | Complaint-specific routing not wired. | Wire workflow to complaints. | M |
| MC-008 | Complaint SLA | Pending | No SLA on complaints. | — | Add SLA via shared engine. | M |
| MC-009 | Complaint analytics | Pending | — | — | Add dashboard widgets. | M |
| MC-010 | Pattern alerts | Pending | — | — | — | L |
| MC-011 | Thematic review | Pending | — | — | — | L |
| MC-012 | Formal investigation | Pending | — | — | Build case-file model. | L |
| MC-013 | Restricted evidence repository | Pending | Generic documents only; no restricted bucket / ACL tier. | `documents` | Storage bucket with stricter RLS. | M |
| MC-014 | Enforcement outcomes | In Progress | `enforcement_actions` table only. | `enforcement_actions` | UI + lifecycle absent. | Build outcome UI. | M |
| MC-015 | Outcome notifications | In Progress | Notification engine ready. | `notification_event_configs` | Events not seeded for outcomes. | Seed events. | S |
| MC-016 | Recurrence monitoring | Pending | — | — | — | M |
| MC-017 | Closed-loop dashboard | Pending | — | — | — | M |
| MC-018 | Market surveillance | Pending | — | — | — | L |
| MC-019 | Financial literacy tracking | Pending | — | — | — | M |

### 5.F Dashboards / Reporting / Audit

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| RPT-001 | Role-specific dashboards | Done | Supervisory / Licensee / Applicant dashboards. | `src/components/dashboard/SupervisoryDashboard.tsx`, `LicenseeDashboard.tsx`, `ApplicantDashboard.tsx`, `src/pages/Dashboard.tsx` | — | — | S |
| RPT-002 | Cross-module executive dashboard | Pending | No single composite dashboard. | — | Build executive view. | M |
| RPT-003 | Drill-down widgets | In Progress | `dashboardDrilldowns.ts` + `licenseeDashboardDrilldowns.ts`. | `src/lib/dashboardDrilldowns.ts`, `src/lib/licenseeDashboardDrilldowns.ts` | Drill-down depth on each widget needs verification. | Expand routes. | M |
| RPT-004 | AI insights | Pending | No Lovable AI integration. | — | Add Lovable AI Gateway. | M |
| RPT-005 | Pre-built reports | Done | Report definitions + dashboard layouts + scheduling + generation. | `src/pages/reports/*`, edge fn `generate-report`, `run-scheduled-reports`, tables `report_definitions`, `report_templates`, `report_dashboard_layouts`, `report_dashboard_widgets`, `report_schedules`, `report_sources`, `report_source_columns` | — | — | S |
| RPT-006 | Report filters | Done | Filter metadata model. | `report_filters`, `report_source_filters`, `report_option_sets`, `report_status_options` | — | — | S |
| RPT-007 | Ad-hoc report builder | In Progress | Reporting metadata model + filter editor present. | `report_*` tables | Visual builder completeness unverified. | UI audit. | M |
| RPT-008 | CSV/PDF export | Done | Generate-report edge fn writes `report_run_files`. | `report_run_files`, `report_run_rows`, `report_logs` | — | — | S |
| RPT-009 | Export audit log | Needs Verification | `report_logs` exists. | `report_logs` | Confirm captures user, timestamp, filters, record count for every export. | Audit edge fn. | S |
| RPT-010 | Audit log page | Done | Admin page + table. | `src/pages/admin/AuditLogs.tsx`, `audit_logs`, `docs/audit-log-coverage.md` | — | — | S |
| RPT-011 | Case-centric timeline | In Progress | Status timeline per application + activity tab. | `src/components/applications/StatusTimeline.tsx`, `ActivityTab.tsx` | Cross-module case timeline absent. | Build per-entity timeline. | M |
| RPT-012 | Data lineage / field-level history | Pending | Workflow snapshot only; field-level lineage absent. | — | Add audit trigger on key tables. | L |
| RPT-013 | Security event log | Pending | No dedicated table. | — | Add `security_events` table + middleware. | M |
| RPT-014 | Integration event logging | In Progress | Notification dispatch log captures one integration class. | `notification_dispatch_log` | Generalize to all integrations. | M |

### 5.G Data Loading / Demo Readiness

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| DAT-001 | Synthetic entity universe | Pending | Only individual seed migrations. | `supabase/migrations/*` | Need ~50–100 entities across all sectors. | Seed migration pack. | M |
| DAT-002 | Risk thresholds | Pending | — | — | Depends on PRU-008. | M |
| DAT-003 | 2021–2025 quarterly data | Pending | — | — | Seed 20 quarters per entity. | L |
| DAT-004 | Macro data | Pending | — | — | Seed table + values. | M |
| DAT-005 | PQ data | Pending | — | — | Depends on F&P module. | M |
| DAT-006 | Adverse-media data | Pending | — | — | Seed sample. | S |
| DAT-007 | Examination reports | Pending | — | — | Seed sample. | S |
| DAT-008 | Complaints data | Pending | — | — | Seed sample. | S |
| DAT-009 | FinCorp group aggregation | Pending | `entity_relationships` only. | `entity_relationships` | Build seed group + UI rollup. | M |
| DAT-010 | Demo roles | In Progress | RBAC and dynamic role tables exist; seeded roles not confirmed. | `roles`, `user_roles`, `user_dynamic_roles` | Add demo personas. | S |
| DAT-011 | End-to-end continuity test | Pending | Vitest suite covers units; no e2e fixture. | `src/test/*` | Add Playwright/Cypress e2e. | L |

### 5.H Non-Functional Requirements

| ID | Requirement Name | Status | Evidence Found | Related Files / Routes / Tables | Gaps | Suggested Next Step | Effort |
|---|---|---|---|---|---|---|---|
| NFR-001 | Authentication | Done | Supabase auth, unified login, force-password change, forgot password (3-step OTP). | `src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`, `src/pages/ForgotPassword.tsx`, `src/pages/ChangePassword.tsx` | — | — | S |
| NFR-002 | MFA / SSO | In Progress | `mfaStatus` gate in `AuthContext` + `/login?mfa=required` redirect. | `src/contexts/AuthContext.tsx`, `src/routes/routeHelpers.tsx` | Provider configuration + enrolment UI not evidenced. | Add enrolment UI + TOTP. | M |
| NFR-003 | Encryption assumptions | Needs Verification | Relies on Supabase-managed encryption; storage uses signed URLs. | `src/lib/secureFileUpload.ts` | Confirm at-rest encryption claim in BRD. | Doc note. | S |
| NFR-004 | Session timeout | Needs Verification | Auth context manages session refresh. | `src/contexts/AuthContext.tsx` | Configurable timeout not exposed. | Add config. | S |
| NFR-005 | RLS / RBAC | Done | RLS used widely; `has_role` SECURITY DEFINER; dynamic role assignment. | All `public.*` tables with policies | Periodic policy audit recommended. | Run `supabase--linter`. | S |
| NFR-006 | Page load performance | Needs Verification | TanStack Query caching, lazy routes. | `src/App.tsx`, route lazy imports | No perf measurements. | Lighthouse. | S |
| NFR-007 | Analytics performance | Needs Verification | Reports use server-side aggregation in `generate-report` edge fn. | edge fn `generate-report` | Untested at scale. | Load test. | M |
| NFR-008 | Report performance | Needs Verification | Same as above. | — | — | M |
| NFR-009 | Concurrent users | Pending | No load-test artefacts. | — | k6 plan. | M |
| NFR-010 | Accessibility | Needs Verification | shadcn-ui primitives are largely accessible; project-level audit absent. | `src/components/ui/*` | Run axe scan. | S |
| NFR-011 | Backup / DR | Needs Verification | Relies on Lovable Cloud managed backups. | — | Document RPO/RTO. | S |
| NFR-012 | Audit retention | Needs Verification | `audit_logs` retention policy not declared. | `audit_logs` | Add retention policy. | S |

---

## 6. Recommended Build Roadmap

### Phase 1 — Stabilize Licensing + Audit + SLA  _(weeks 1–4)_
- LIC-014 Decision-ready cockpit (M)
- LIC-015 Decision letter PDF (M)
- LIC-016 Digital license certificate (M)
- LIC-022 Licensing → supervision handoff (M)
- PLT-011 SLA engine (pause/resume on RFI, breach jobs, dashboard widgets) (L)
- RPT-009 Export audit logging hardening (S)
- RPT-013 Security event log table + middleware (M)
- AUD override-justification capture (M)

### Phase 2 — Complete Returns + Prudential Analytics  _(weeks 4–10)_
- PRU-007 Ratio calculation framework (L)
- PRU-008 Threshold configuration (M)
- PRU-009 Breach alerts via notification engine (M)
- PRU-010 Peer comparison (L)
- PRU-011 Trend charts (M)
- PRU-012 Group rollup using `entity_relationships` (L)
- PRU-015 CAMELS scoring (L)
- PRU-018 Early Warning Indicators (L)

### Phase 3 — Build Fit & Proper  _(weeks 10–18)_
- FAP-001 Individual registry (L)
- FAP-002–005 PQ + declaration + screening types (L)
- FAP-006 Adverse-media integration (L)
- FAP-013 Multi-regulator determinations (L)
- FAP-014 Committee weighted voting (L)
- FAP-015–017 Conditions, appeals, reassessments (M each)

### Phase 4 — Build Market Conduct Investigations  _(weeks 18–24)_
- MC-006 Priority scoring (M)
- MC-008 Complaint SLA on shared engine (M)
- MC-012 Investigation case file (L)
- MC-013 Restricted evidence repository (M)
- MC-014–015 Enforcement outcome lifecycle + notifications (M)
- MC-017 Closed-loop dashboard (M)

### Phase 5 — Executive Reporting + AI + Demo Data  _(weeks 24–30)_
- RPT-002 Cross-module executive dashboard (M)
- RPT-004 AI insights via Lovable AI Gateway (M)
- RPT-012 Data lineage (L)
- DAT-001–010 Synthetic universe + FinCorp + macro + adverse media + PQ (L cumulative)
- DAT-011 Playwright end-to-end continuity test (L)

---

## 7. QA Validation Checklist

The following test cases should be executed against the running preview before
status values in Section 5 are upgraded:

**Authentication & Access**
- [ ] Public `/register` submits and creates `registrations` row.
- [ ] Unapproved pre-licensee is redirected to `/registration-status` and cannot bypass via direct URL.
- [ ] `forcePasswordChange` redirects on first login and clears after change.
- [ ] MFA gate activates when `mfaStatus = 'pending'`.

**Workflow Builder & Versioning**
- [ ] Editing step order persists and reloads after refresh.
- [ ] Duplicate step keys are blocked client-side and server-side.
- [ ] Saving a workflow creates/updates `approval_workflows`; clicking **Publish version** creates a new `approval_workflow_versions` row with `version_number = max+1`.
- [ ] A pre-existing `workflow_instances` row continues to use its pinned `workflow_version_id` and `version_snapshot` after publish.
- [ ] Specific-user approver dispatches to chosen user.
- [ ] Per-action notifications fire on action execution.

**Licensing**
- [ ] Application submission creates a unique reference number.
- [ ] Decision/issue flow updates `licenses` and triggers notifications.
- [ ] Suspend / revoke / renew write `license_actions` rows.

**Returns**
- [ ] Due date generation respects cutoff config.
- [ ] Late fee calculation respects tiers.
- [ ] Return resubmission restores paused workflow.

**Reporting & Audit**
- [ ] Generated report writes `report_run_files` and `report_logs`.
- [ ] Every export logs user, timestamp, filters, and record count (currently `Needs Verification`).
- [ ] Audit log captures view/create/edit/approve/override/deny on critical tables.

**RLS / Security**
- [ ] Run `supabase--linter` — no warnings remain.
- [ ] Cross-tenant data not visible to a different licensee account.
- [ ] Edge functions reject unauthenticated or wrong-role callers.

---

## 8. Open Questions

1. **License-type taxonomy** — does the BRD expect a first-class `license_types`
   table, or is the existing sector/sub-sector/category/services hierarchy
   sufficient?
2. **Twin Peaks model** — should ABC and FSC share one app instance with
   regulator-scoped RLS (current direction) or two separate deployments?
3. **Fit & Proper individual registry** — should it reuse `profiles` or be
   modelled as a separate `individuals` table independent of web users?
4. **SLA pause semantics** — does an RFI pause the SLA only for the issuing
   step or for the whole case?
5. **Override justification** — is this needed only for AI overrides, or for
   any system-generated determination?
6. **Restricted evidence repository** — separate Supabase Storage bucket with
   stricter RLS, or row-level ACL on existing `documents`?
7. **Letter/certificate generation** — preferred PDF stack
   (e.g. `pdfkit`/`pdf-lib` inside an edge fn vs HTML→PDF via headless
   chromium)?
8. **AI insights** — which model class on Lovable AI Gateway is appropriate
   for adverse-media analysis given data-residency requirements?
9. **Audit retention period** — is the legal retention period 7 years (typical
   for financial regulators) or jurisdiction-specific?
10. **Demo data scope** — must the 2021–2025 dataset be regenerated each
    deploy or seeded once into Lovable Cloud?

---

_End of second-pass tracker._
