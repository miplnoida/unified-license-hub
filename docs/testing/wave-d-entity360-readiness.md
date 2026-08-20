# Wave D — Entity 360 & Supervisory Certification Readiness

Program: RDM-ENTITY-001 · Baseline: CERTIFICATION DATASET v1

## 1. Business-data reset and reseed

- Disposable business data removed via dependency-sorted deletion (`cert_reset_dependency_order`,
  `cert_reset_nonproduction_business_data_v1`): 79,758 rows.
- Access backbone preserved: 56 auth users, 59 role grants, 15 integration connections.
- Identity, structure and returns reseeded (`cert_seed_identity_v1`, `cert_seed_structure_v1`,
  `cert_seed_returns_v1`).

## 2. Wave D supervisory extension

`public.cert_seed_wave_d_v1()` is repeatable (deterministic `cert_uuid` keys, upsert semantics) and
extends the E01–E20 cohort with:

| Domain | Records |
| --- | --- |
| Supervision assignments (incl. 2 superseded cycles) | 20 |
| Risk assessments (current + prior year) | 32 |
| Current risk scores | 16 |
| Supervisory plans | 11 |
| Prudential assessments | 9 |
| Market conduct complaints | 7 |
| AML/CFT assessments / findings | 7 / 7 |
| Resilience arrangements / incidents | 6 / 6 |
| Examinations / findings | 9 / 9 |
| Enforcement cases | 6 |
| Correspondence threads (inbound + outbound) | 36 |
| Entity documents | 40 |

E18 and E20 remain applicant-stage: no supervision, examination, enforcement or AML activity.

## 3. Verification

`public.cert_verify_dataset_v1()` — **failure_count: 0**. It now also reports Wave D telemetry and
asserts:

- applicant-stage entities carry no post-authorisation supervisory activity;
- no supervisory rows exist outside the certification cohort;
- every AML finding resolves to an AML assessment;
- ownership sums to 100% with no temporal overlap; each licence maps to one entity.

A nested-aggregate defect in the ownership overlap check was repaired in the same pass.

## 4. Entity 360 frontend

Route: `/entities/:entityId/360` (guarded by `license_management`), reachable from the Entity
Directory and the Entity Structure workspace.

- Overview: canonical profile plus domain tiles (risk, returns, supervision, prudential, ownership,
  governance, fit & proper, conduct, AML, resilience, examinations, enforcement, requests).
- Cross-domain timeline with domain filters.
- 19 section tabs served by `entity360_section`; sections the user cannot see are hidden.
- Point-in-time "as at" control replays temporal sections (identity, licences, ownership,
  governance, relationships, business profile, documents).

## 5. Backend fixes landed with this wave

- `entity360_*` access now admits internal staff via `is_internal_staff`; previously an internal
  user who also held an external portal role was refused.
- Returns and obligation summaries compare status case-insensitively.
- Added the missing `documents` section to `entity360_section`.
- Repaired three notification triggers (supervisory plan, examination, conduct pattern) that
  referenced a non-existent entity name column and blocked inserts.

## 6. Reset / reseed runbook

```sql
SELECT public.cert_reset_nonproduction_business_data_v1();
SELECT public.cert_seed_identity_v1();
SELECT public.cert_seed_structure_v1();
SELECT public.cert_seed_returns_v1();
SELECT public.cert_seed_wave_d_v1();
SELECT public.cert_verify_dataset_v1();
```

All functions are super-admin only and blocked on production-guarded environments.
