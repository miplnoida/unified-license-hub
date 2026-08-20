# Supervisory Operating Model — As-Built

**Task type:** Discovery and analysis. Describes what the platform does
today, not what it should do.

## 1. The supervisory spine

The platform implements a single canonical spine. Everything supervisory
hangs off the regulated entity.

```text
  Party (natural / legal person)
    └─ Organization
         └─ Regulated Entity           (licensees.id = local entity UUID)
              ├─ Entity Licences       (multi-licence, effective-dated)
              ├─ Appointments          (governance roles, F&P linkage)
              ├─ Ownership Interests   (structure, control)
              ├─ Reporting Obligations → Reporting Periods → Return Filings
              │                                                 └─ Filing Versions → Metric Values
              ├─ Supervision Assignment(lead / officer / alternate)
              ├─ Prudential Assessments(CAMELS), Examinations, AML, Resilience
              ├─ Conduct              (complaints, alerts, investigations, enforcement)
              └─ Correspondence / Notifications / Audit
```

Measured live volumes: 75 parties, 25 organizations, 20 regulated
entities, 28 entity licences, 160 appointments, 73 ownership interests,
56 obligations, 233 periods, 112 filings, 128 filing versions, 25
metrics, 240 metric values.

## 2. Lifecycle chains — where each chain stops

| Chain | Stages implemented | Terminates at |
| --- | --- | --- |
| **Licensing** | intake → sufficiency → RFI → multi-disciplinary review → approval workflow → decision → licence | Decision artefact generation is built but never exercised (0 rows) |
| **Fit & Proper** | registry identity → PQ invitation → assessment → (screening) → (AI) → (committee) → (determination) → (conditions) | Stops after assessment; findings/determinations/conditions/appeals all 0 rows |
| **Returns / Prudential** | definition → obligation rule → entity obligation → period → filing → version → validation → metric | Stops at metric; breaches (0), EWI alerts (0), supervisory action follow-through not exercised |
| **Market Conduct** | intake → triage → classification → investigation tasks → RFI → closure → enforcement | Formal investigations (0) and thematic reviews (0) never entered; enforcement seeded independently (6 rows) |
| **Cross-cutting** | audit logging → security events → notifications → correspondence | Escalations (0), export audit jobs (0), AI insights (0) |

The consistent shape of the gap is **detection-to-action**: the platform
records regulatory *facts* well and produces *supervisory consequences*
only partially.

## 3. Authorization model

Single-model RBAC, evaluated server-side:

- `public.sec_get_user_context()` returns roles, `<module>.<action>`
  permissions, per-module scopes, the route registry and the navigation
  tree in one round trip. `useSecurityContext` is the only frontend
  consumer; `useCan` / `PermissionGate` / `ModuleRoute` read from it.
- RLS is the authority. Helper family: `is_super_admin`,
  `has_permission`, `has_any_permission`,
  `user_has_entity_assignment`, `is_assignment_only_regulator`,
  `can_view_entity_returns`.
- Assignment-only regulators are read-only, restricted to mapped
  licensees and submitted-lifecycle returns, and excluded from exports,
  AI analysis and configuration.

Measured coverage: 464 tables all RLS-enabled (1 exception:
`worker_invocation_tokens`, an internal service table with no policy),
991 policies, 186/282 routes module-guarded, 34 `useCan` sites and 22
`PermissionGate` sites against 2,067 `onClick` handlers.

## 4. Configuration governance

Configurable without code change: forms (`form_templates`, 55),
workflows (`approval_workflows`, 11), SLAs, fees, obligation rules (36),
metrics (25), validation rules, conduct monitoring rules (3), triage
rules, notification templates/events, roles and permissions, navigation,
CAPTCHA, branding.

Not yet configuration-driven: rule engine coverage (1 active rule of 12
declared rule types), report definitions (code-defined Recharts
templates), FRD role naming (R-01 … R-14 unmapped).

## 5. Data flow discipline

- **Governed path:** SECURITY DEFINER RPCs and edge functions
  (`verify-and-submit`, complaint creation, registration, returns
  filing) that re-derive `auth.uid()` and check
  `has_permission(...)` before mutating.
- **Ungoverned path:** 472 direct browser `insert/update/delete` call
  sites against 184 public tables. These rely solely on RLS; they do not
  emit audit records or enforce workflow preconditions. This is the
  single largest structural risk to auditability.

## 6. Evidence and auditability

- `audit_logs` (155), `compliance_audit_logs` (430),
  `security_event_logs` (112).
- Versioned artefacts: filing versions, form versions, workflow
  versions, entity identity snapshots, change sets (15).
- AI outputs are designed for traceability — `ai_insights` carries
  `source_records`, `citations`, `input_fingerprint`, `provider`,
  `model`, `review_status`, `reviewer_id` — but the table is empty, so
  the traceability contract is unproven.

## 7. Test and certification posture

CERTIFICATION DATASET v1 is the permanent baseline: 20 entities
(E01–E20), 5 supporting organizations, 50 canonical persons, 27
applications, 23 licences, 112 filings, 0 integrity failures per
`cert_verify_dataset_v1()`. 113 pgTAP suites and 121 Vitest files run
against it.

The dataset covers identity, structure, obligations and returns
thoroughly, and covers downstream supervisory consequence thinly. See
the gap register for the specific extensions required before a demo can
show an end-to-end supervisory cycle.
