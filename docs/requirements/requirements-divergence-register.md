# Requirements Divergence Register

Places where the delivered platform **intentionally differs** from the
BRD/FRD, or where the two authoritative sources differ from each other.
Divergence is not automatically a defect — each entry records the reason
and the decision that is required.

## D1 — Complaint closure quality review removed

| Field | Value |
| --- | --- |
| Requirement | FRD `MCS-CMP-006` Complaint Case Closure & Quality Review; BR-MC-08 |
| As-built | Closure requires a resolution and rationale (10-character minimum) but the separate QA review step was removed on explicit business instruction. |
| Reason | Business decision recorded during complaints build; QA step was judged redundant against supervisor closure approval. |
| Risk | FRD-conformance reviewer will read this as a missing control. |
| Decision needed | Either restore an optional configurable QA gate, or obtain written FRD amendment. |

## D2 — Digital signature capture disabled

| Field | Value |
| --- | --- |
| Requirement | Workflow approval steps in FRD assume signature capture on decision actions. |
| As-built | `WORKFLOW_SIGNATURE_CAPTURE_ENABLED = false`. |
| Reason | Requested; signature UX deemed out of scope for current phase. |
| Risk | Non-repudiation of approvals rests on audit records rather than a captured signature. |
| Decision needed | Confirm audit-record non-repudiation is acceptable, or re-enable. |

## D3 — Collaborative review and markup behind a flag

| Field | Value |
| --- | --- |
| Requirement | LIC-REV-001 collaborative annotation of submitted applications. |
| As-built | `COLLAB_REVIEW_ENABLED = false`; `InlineMarkup` shipped but disabled. |
| Reason | Feature stabilisation. |
| Decision needed | Enable for demo, or record as deferred scope. |

## D4 — Transitional entity identity rule

| Field | Value |
| --- | --- |
| Requirement | Canonical regulatory data model expects a dedicated regulated-entity key. |
| As-built | `licensees.id` remains the local regulated-entity UUID (documented transitional rule of programme RDM-ENTITY-001). |
| Reason | Avoids a repository-wide key migration; deliberate and documented. |
| Risk | Terminology confusion between "licensee" and "regulated entity" in code and screens. |
| Decision needed | Keep transitional rule for this phase; schedule rename in a later wave. |

## D5 — Legacy returns model retained alongside canonical model

| Field | Value |
| --- | --- |
| As-built | Canonical Wave C tables (`return_definitions`, `entity_reporting_obligations`, `reporting_periods`, `return_filings`, `return_filing_versions`, `return_metric_values`) carry all certification data. Legacy tables (`returns_filed` = 0, `compliance_returns` = 0, `return_form_data` = 0, `return_configurations` = 4) remain in the schema with legacy admin routes still mounted (`/admin/returns/*`, `/returns-management/*`, `/compliance/returns`, `/entity/returns/legacy`). |
| Risk | Two visible returns experiences; a reviewer can land on a legacy screen with no data and conclude returns are broken. |
| Decision needed | Retire or hide legacy returns routes before demo; see `docs/architecture/legacy-retirement-report.md`. |

## D6 — Role naming divergence

| Field | Value |
| --- | --- |
| Requirement | FRD defines roles R-01 … R-14 by name and duty. |
| As-built | Dynamic `sec_roles` plus an 11-value `app_role` enum; no artefact maps the two. |
| Risk | Persona-based demo scripts cannot be run against named FRD roles with confidence. |
| Decision needed | Publish an R-xx → `sec_role` mapping table (tracked as GAP-XC-04). |

## D7 — Reports are code-defined, not user-defined

| Field | Value |
| --- | --- |
| Requirement | DASH-RPT-002 Ad-Hoc Report Builder. |
| As-built | Recharts-based report templates defined in code with CSV/JSON export. |
| Reason | Delivery sequencing. |
| Decision needed | Accept as "pre-built library + export" for this phase, or fund a true builder (GAP-XC-09). |

## D8 — Screening operates without an external provider

| Field | Value |
| --- | --- |
| Requirement | BR-FP-05 automated screening across configured sources. |
| As-built | Full configuration surface, provider-state banner reporting "not configured", no live provider bound. |
| Reason | No provider credentials supplied. |
| Decision needed | Bind a provider or demo with an explicitly labelled simulated provider. |

## D9 — Public complaint intake requires login on one path

| Field | Value |
| --- | --- |
| Requirement | MCS-POR-001/002 public consumer portal. |
| As-built | Public submission exists (`/submit-complaint`, `/complaints/submit`), and a login-required path was added by request for authenticated complainants. |
| Risk | None material; both paths coexist. Recorded for completeness. |

## D10 — Assignment-only regulator is read-only by design

| Field | Value |
| --- | --- |
| As-built | Users mapped as regulators on a licensee but holding no dynamic-role permissions get read-only access to submitted-lifecycle returns for their mapped entities and nothing else — `useCan` returns `false` for every action. |
| Requirement | FRD does not describe this persona. |
| Reason | Deliberate least-privilege construct; documented in `docs/rbac/assignment-only-matrix.md`. |
| Decision needed | Confirm the persona is acceptable as an extension beyond FRD. |

## Roll-up

| Class | Count |
| --- | --- |
| Deliberate scope reduction requiring FRD amendment | D1, D2, D3, D7 |
| Transitional architecture, scheduled for later removal | D4, D5 |
| Documentation/mapping debt | D6 |
| Environment/credential dependent | D8 |
| Extension beyond FRD | D9, D10 |
