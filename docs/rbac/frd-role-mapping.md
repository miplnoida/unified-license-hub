# FRD Persona → `sec_roles` Mapping (Package A1)

FRD personas R-01 … R-14 are mapped to canonical `sec_roles` keys. Authority is evaluated
exclusively server-side by governed RPCs via `enforce_permission(_module, _action)` /
`enforce_scoped_permission(...)`; the frontend never asserts authority.

| FRD | Persona | `sec_roles` key(s) | Primary governed authority (module.action) |
|---|---|---|---|
| R-01 | Applicant / Prospective Licensee | `applicant` | none (self-service submission paths only) |
| R-02 | Regulated Entity User | `regulated_entity_user` | `returns_management.submit`, entity self-service |
| R-03 | Registration Officer | `registration_officer` | `registration_management.review` |
| R-04 | Licensing Analyst | `licensing_analyst`, `analyst` | `license_management.edit`, `application_management.assess` |
| R-05 | Licensing Officer | `licensing_officer` | `license_management.manage_conditions`, `license_management.edit` |
| R-06 | Licensing Supervisor | `licensing_supervisor` | `license_management.approve` (determinations, risk profiles) |
| R-07 | Fit & Proper Officer / Assessor | `fit_proper_officer`, `f_p_assessor` | `fit_and_proper.assess`, `fit_and_proper.file_appeal` |
| R-08 | Fit & Proper Supervisor | `fit_proper_supervisor` | `fit_and_proper.decide_appeal` |
| R-09 | Prudential Analyst / Supervisor | `prudential_analyst`, `prudential_supervisor` | `prudential_supervision.record_camels_assessment` |
| R-10 | Market Conduct Supervisor / Analyst | `market_conduct_supervisor`, `conduct_supervisor`, `conduct_analyst` | `conduct.investigate`, `conduct.close` |
| R-11 | Inspector / Examiner | `inspector`, `investigator` | `inspection_management.edit`, `inspection_management.escalate` |
| R-12 | Enforcement Officer | `enforcement_officer` | `enforcement.act` |
| R-13 | Legal / Compliance Reviewer, Auditor | `legal_compliance_reviewer`, `auditor`, `read_only` | read-only + `coordination.update` where designated |
| R-14 | Administrator (security / system / data) | `super_admin`, `security_administrator`, `system_administrator`, `regulatory_data_administrator`, `integration_administrator` | configuration and role administration |

Cross-domain coordination (Twin Peaks) is gated by `coordination.update` and is intentionally
**not** granted to single-domain licensing personas — verified at runtime: a Licensing Officer
calling `twinpeaks_raise_disagreement` receives `42501 permission denied: coordination.update`.

## Duplicate role keys requiring consolidation (A2)

`approver_decision_maker_bef85f9b` and `approver_decision_maker_b5c0d563` are duplicate
"Approver / Decision-Maker" records; `legacy_admin` and `consumer_complainant`
(mis-typed as internal) are legacy artefacts. These are data-cleanup items, not authority gaps —
no governed RPC depends on them.
