# Post-Licensing Services — Low-Impact Execution Plan (15 Services)

Additive, configuration-first delivery of 15 post-licensing services on top of the existing post-license application architecture. No redesign of Application Queue, applications schema, workflow engine, payments, Form Builder, pre-licensing, returns, complaints or public register.

## Baseline confirmed (read-only checks already done)

- `services` already carries the metadata the plan needs: `sector_id`, `sub_sector_id`, `workflow_id`, `decision_type`, `requires_fit_and_proper`, `sla_days`, `lifecycle_stage`, `document_checklist`, `effective_from/to`.
- Current master data: 16 services = 2 services (`Renew`, `Change of Registered Address`) × 8 sub-sectors (Commercial Bank, Merchant Bank, Building Society, Micro-credit, Financial Holding, Life Insurance, General Insurance, Securities Dealer).
- 17 published `post_license` form templates, each scoped by `service_id` — one form per sub-sector service. New services follow the same pattern exactly.
- Applicant entry point `NewPostLicenseApplication.tsx` derives sector/sub-sector from the licence entitlement and filters services by `sub_sector_id` + `status='active'`, then resolves the published form by `service_id`. No code change needed for new services to appear.
- Fee resolution (`src/lib/applicationFeeBreakdown.ts`) requires, for a service application, a `fee_configurations` row whose `service_id` matches — so each service needs its own fee config row.
- Workflow resolution (`src/lib/workflowApprovalResolver.ts`) already ranks `service_id` first, then category, sub-sector, sector — service-specific workflow routing is supported today.
- Only 2 existing post-license applications and 17 applications total; existing demo data will not be touched.

## Decisions taken (questions were skipped)

- **Coverage:** all 8 sub-sectors — 15 services × 8 = 120 service records, 120 published forms, 120 fee configs. Delivered in the 6 batches from the source document so each batch is verified before the next.
- **Workflows:** create the 4 patterns (Standard Post-License, Enhanced Review, Fit & Proper, Notification) and map them per service via `services.workflow_id` / `service_id` routing. Existing workflows are left untouched.
- **Post-approval effects:** Tier 1 only (legal name, address, director resignation, new branch, branch closure, external auditor, deregistration status). Tier 2 subjects remain approved regulatory evidence with the proposed values displayed.

## Scope of services and fees

| # | Service | Fee (USD) | Workflow |
|---|---|---:|---|
| 1 | Change of Legal Name | 125 | Standard |
| 2 | Change of Address | 100 | Standard |
| 3 | Change of Control | 200 | Enhanced |
| 4 | Shareholding Change | 175 | Enhanced |
| 5 | Beneficial Owner Change | 200 | Fit & Proper |
| 6 | Director Appointment | 175 | Fit & Proper |
| 7 | Director Resignation | 100 | Notification |
| 8 | Key Function Holder Change | 175 | Fit & Proper |
| 9 | Group Restructure | 200 | Enhanced |
| 10 | New Branch | 150 | Standard |
| 11 | Branch Closure | 125 | Standard |
| 12 | Material Outsourcing Notification | 150 | Notification |
| 13 | External Auditor Change | 150 | Standard |
| 14 | Material Incident Notification | 100 | Notification |
| 15 | Entity Deregistration / Relationship Closure | 200 | Enhanced |

All amounts live in Fee Management only — never in frontend code.

## Delivery sequence

**Phase 1 — Guardrail snapshot.** Record counts/IDs of existing applications, services, form templates, published versions, fee configs, workflows and approved licences. Re-compare after every batch; any unexplained change is a blocker.

**Phase 2 — Workflow patterns.** Create the 4 new workflow records with their steps (Analyst → Licensing Officer → Final Approval; Analyst → Specialist → Final Approval; Analyst → F&P → Licensing Officer → Final Approval; Regulatory Review → Acknowledge/Close). Notification-pattern decisions reuse existing approve/close actions with clear decision labels.

**Phase 3 — Service master seeding (per batch).** Insert service rows per sub-sector with `lifecycle_stage='post_license'`, status active, `workflow_id`, `sla_days`, `requires_fit_and_proper`, `document_checklist`. Idempotent on (sub_sector, name) so re-runs never duplicate or alter existing services.

**Phase 4 — Forms.** One published `post_license` form template per service, named `PLS - <Service>` scoped to sector/sub-sector/service, built with the existing Form Builder structures (form_templates + fields + published version). Shared sections: read-only Entity/Licence block, Request Details, Supporting Documents, Declaration — plus the service-specific fields listed in the source document.

**Phase 5 — Fees.** One active `fee_configurations` row per service (`service_id` scoped, fee_type `Application Fee`, currency USD). Verified that each service resolves only its own fee.

**Phase 6 — Duplicate protection.** Block a new request when an open application already exists for the same `license_id + service_id` (draft/in_progress/submitted/under_review/query_raised/resubmission_requested). Terminal statuses do not block. Subject-level checks (same director, branch, BO, auditor) added from application `data` where the subject reference exists.

**Phase 7 — Application detail enhancement (small, service-aware).** In the existing detail view, add a Post-License Service Summary block (service, licence, entity, sector, fee, payment status, requested effective date, current step) and a Current → Proposed change table derived from submitted form data. Optional-field fallbacks so legacy applications render unchanged.

**Phase 8 — Tier 1 post-approval effects.** On final positive decision only, apply the isolated canonical updates through governed operations with audit; rejected/withdrawn requests never mutate canonical data; no hard deletes; history preserved.

**Phase 9 — Regression and certification.** Full PASS/FAIL matrix across registration, pre-license, existing post-license, queue filters/totals/export, application detail, Form Builder and versions, payments/invoices/offline verification, workflows, RFI, F&P, licences, returns, complaints, public register, permissions, audit, dashboards. Plus the per-service test matrix and the demo-data protection comparison.

## Technical notes

- New applications keep `data.type = 'post_license'` with `license_id`, `license_number`, `service_id`, `service_name`, sector/sub-sector/category IDs and `form_template_ids`. No new application type, no new queue, no new tables for the service framework.
- Service-specific metadata (requested effective date, subject reference, proposed values) is stored inside the existing application `data` JSON.
- Any new table, if one proves unavoidable, ships with GRANTs, RLS and governed-RPC writes, and is added to the convergence privilege guardrail test (anon/authenticated direct DML denied).
- Seeding is done via migrations/SQL that are idempotent and never update existing service, form, version, fee or workflow rows.

## Out of scope

New service-catalogue architecture, generic regulatory effects engine, new obligation engine, reporting redesign, payment-flow redesign (Material Incident keeps pay-before-submit and is documented as a demo limitation), Tier 2/3 canonical mutations, new roles.
