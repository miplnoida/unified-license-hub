# Direct-Write Remediation Inventory (Package A1)

Generated: 2026-08-20 — scanner: `.insert(|.update(|.upsert(|.delete(` across `src/**/*.{ts,tsx}`.

## 1. Classification model

| Class | Meaning | A1 obligation |
|---|---|---|
| GOVERNED_RPC_ONLY | Regulatory decision / canonical state already behind a governed RPC; table DML revoked from `anon`/`authenticated` | Closed |
| P1 | Regulatory decision or canonical business state still written directly from the browser | Must reach 0 |
| P2_REVIEW | Operational supporting records (tasks, correspondence, working records) requiring authority checks but not decision-grade | Deferred (A2) |
| P2_P3 | Configuration / metadata / draft authoring / working notes / telemetry | Deferred (A2) |
| UNRESOLVED_DYNAMIC | Dynamic table name (`from(table as any)`) resolved at runtime by generic hooks | Deferred (A2) — requires hook-level allowlists |

## 2. Current census

| Class | Sites |
|---|---|
| P1 (open) | 99 |
| P2_REVIEW | 233 |
| P2_P3 | 182 |
| UNRESOLVED_DYNAMIC | 62 |
| **Total scanned sites** | **609** |

Baseline at A1 kick-off: 632 sites / 178 files. Current: 609 sites / 173 files.

## 3. Closed under A1 — governed RPC boundary

Tables with `INSERT`/`UPDATE`/`DELETE` revoked from `anon` and `authenticated` (SELECT retained for read-only views); all writes flow through permission-checked `SECURITY DEFINER` RPCs that emit exactly one `audit_logs` row per transition:

- `fp_appeals`
- `license_conditions`
- `licensing_audit_determinations`
- `licensing_audit_risk_profiles`
- `risk_ratings`
- `entity_relationships`
- `twinpeaks_clearances`
- `twinpeaks_disagreements`
- `inspection_findings`

Governed RPCs: `fp_appeal_file`, `fp_appeal_start_review`, `fp_appeal_record_decision`, `license_condition_create`, `license_condition_set_status`, `license_condition_delete`, `licensing_audit_record_determination`, `licensing_audit_record_risk_profile`, `record_entity_risk_rating`, `entity_relationship_save`, `entity_relationship_delete`, `twinpeaks_upsert_clearance`, `twinpeaks_raise_disagreement`, `twinpeaks_resolve_disagreement`, `inspection_finding_save`, `inspection_finding_escalate`.

Fit & Proper governed operations (cluster closed): assessment lifecycle (`fp_assessment_initiate`, `fp_assessment_set_status`, `fp_assessment_assign_committee`, `fp_assessment_save_pq`, `fp_request_pq_amendment`), findings (`fp_finding_disposition`, `fp_finding_set_false_positive`, `fp_finding_escalate`, `fp_finding_assign`, `fp_finding_save_note`, `fp_finding_set_evidence`), conditions and evidence (`fp_condition_create`, `fp_condition_set_status`, `fp_condition_record_reminder`, `fp_condition_evidence_submit`, `fp_condition_evidence_review`), determinations (`fp_determination_record`), committees (`fp_committee_create`, `fp_committee_update`, `fp_committee_member_add`, `fp_committee_member_remove`, `fp_committee_member_set_active`, `fp_committee_member_set_weight`, `fp_committee_set_casting_vote`, `fp_committee_cast_vote`), monitoring (`fp_monitoring_event_raise`, `fp_monitoring_event_acknowledge`) and declarations (`fp_declaration_invitation_create`, `fp_declaration_invitation_resend`). All are exposed to the browser through the single typed wrapper `src/lib/fpGovernedOps.ts`.

Migrated callers: `FpAppealsPanel.tsx`, `FpaAppeals.tsx`, `LicenseConditionsPanel.tsx`, `RelationshipsTab.tsx`, `RiskRatingsTab.tsx`, `LicensingAuditTab.tsx`, `InspectionDetail.tsx`, `twinPeaksClearance.ts`.

## 4. Remaining P1 sites by canonical store

| Table | Sites |
|---|---|
| applications | 14 |
| supervisory_plan_actions | 7 |
| compliance_returns | 7 |
| approval_actions | 6 |
| conduct_actions | 5 |
| returns_filed | 5 |
| enforcement_actions | 4 |
| conduct_alerts | 4 |
| registration_form_submissions | 4 |
| approval_step_actions | 3 |
| payments | 3 |
| conduct_investigations | 3 |
| license_appeals | 3 |
| prudential_thresholds | 3 |
| prudential_ratios | 3 |
| prudential_risk_taxonomy | 3 |
| prudential_assessments | 3 |
| prudential_stress_indicators | 3 |
| complaint_investigation_tasks | 2 |
| enforcement_obligations | 2 |
| examination_exit_meetings | 2 |
| prudential_actions | 2 |
| prudential_escalations | 2 |
| licensees | 1 |
| prudential_assessment_component_ratings | 1 |
| prudential_stress_events | 1 |
| prudential_data_feed_logs | 1 |
| registrations | 1 |
| enforcement_case_events | 1 |

## 5. Remaining P1 sites by file

| File | Sites |
|---|---|
| src/hooks/usePrudentialSupervision.ts | 15 |
| src/pages/applications/ApplicationDetail.tsx | 8 |
| src/hooks/useMarketConduct.ts | 7 |
| src/hooks/usePrudentialConfig.ts | 6 |
| src/pages/compliance/ReturnSubmission.tsx | 5 |
| src/pages/NewApplication.tsx | 4 |
| src/components/entity-detail/EnforcementTab.tsx | 3 |
| src/hooks/useLicenseAppeals.ts | 3 |
| src/hooks/useReturnsManagement.ts | 3 |
| src/pages/supervision/SupervisoryPlansDashboard.tsx | 3 |
| src/components/applications/ApplicationRfiTab.tsx | 2 |
| src/components/applications/PaymentVerificationDialog.tsx | 2 |
| src/components/complaints/ComplaintInvestigationTab.tsx | 2 |
| src/components/enforcement/EnforcementObligationsPanel.tsx | 2 |
| src/components/entity-detail/SupervisoryPlanTab.tsx | 2 |
| src/hooks/useExaminations.ts | 2 |
| src/pages/applications/ApplicationQueue.tsx | 2 |
| src/pages/conduct/ConductAlerts.tsx | 2 |
| src/pages/registration/PreLicenseeRegistration.tsx | 2 |
| src/pages/registration/RegistrationFormFill.tsx | 2 |
| src/pages/returns-mgmt/ReturnDetail.tsx | 2 |
| src/pages/supervision/BreachInbox.tsx | 2 |
| src/components/applications/RaiseRfiDialog.tsx | 1 |
| src/components/conduct/InvestigationCaseFilePanel.tsx | 1 |
| src/components/conduct/IssueActionDialog.tsx | 1 |
| src/components/entity-detail/BackgroundInfoTab.tsx | 1 |
| src/components/entity-detail/LicensingAuditTab.tsx | 1 |
| src/hooks/usePrudentialPhase2.ts | 1 |
| src/lib/workflowTemplateSnapshot.ts | 1 |
| src/pages/ApplicationForms.tsx | 1 |
| src/pages/NewPostLicenseApplication.tsx | 1 |
| src/pages/PostLicenseApplicationForms.tsx | 1 |
| src/pages/PreLicenseeDashboard.tsx | 1 |
| src/pages/compliance/ComplianceReturns.tsx | 1 |
| src/pages/conduct/ConductActions.tsx | 1 |
| src/pages/entity/returns/FillReturnPage.tsx | 1 |
| src/pages/licenses/LicenseDetail.tsx | 1 |
| src/pages/payments/PaymentHistory.tsx | 1 |
| src/pages/registration/RegistrationPortal.tsx | 1 |
| src/pages/supervision/PrudentialEarlyWarnings.tsx | 1 |

## 6. Verified authority boundary (runtime evidence)

Executed against the live backend with real end-user sessions (PostgREST, `anon` key + user JWT):

| Probe | Licensing Officer | Applicant |
|---|---|---|
| Direct `INSERT` on governed tables (`license_conditions`, `entity_relationships`, `risk_ratings`, `inspection_findings`), direct `UPDATE fp_appeals` | 403 `42501 permission denied for table …` | 403 `42501` |
| `license_condition_create` / `set_status` / `delete` | 200 / 200 / 204 | 403 `permission denied: license_management.manage_conditions` |
| `entity_relationship_save` (create + update) / `delete` | 200 / 204 | 403 `permission denied: license_management.edit` |
| `record_entity_risk_rating` | 400 `invalid risk rating` (domain rule enforced) | 403 `permission denied: prudential_supervision.record_camels_assessment` |
| `licensing_audit_record_determination` | 400 `rationale must be at least 10 characters` | 403 `permission denied: license_management.approve` |
| `inspection_finding_save` | 403 `permission denied: inspection_management.edit` (out-of-domain) | 403 same |
| `twinpeaks_raise_disagreement` | 403 `permission denied: coordination.update` (out-of-domain) | 403 same |
| SELECT visibility on governed tables | rows returned | empty (RLS scoping) |
| Audit rows per transition | exactly 1 (`license.condition.created/status_changed/deleted`, `entity.relationship.created/updated/deleted`) | n/a |

All probe records were created and deleted through governed RPCs; no residual test data remains.

## 7. A1 exit status

- P1 bypasses: **99 open** — target 0. Fit & Proper decisions cluster is **closed** (0 open). Highest-value remaining clusters: prudential supervision (22), application lifecycle (14), returns/compliance filings (12), conduct actions (12), enforcement (7).
- Unjustified `anon`-executable `SECURITY DEFINER` mutators: reduced to 0 (see `docs/rbac/secdef-exposure-triage.md`).
- **A1 COMPLETE: NO.**
