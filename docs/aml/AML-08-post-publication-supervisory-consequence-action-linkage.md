# AML-08 — Post-Publication Supervisory Consequence & Action Linkage

Date: 2026-09-10
Scope: connect an approved/published AML/CFT assessment and entity risk-of-record
to governed downstream supervisory action.

## 1. Architecture reuse

No downstream architecture was duplicated. AML-08 adds a single append-only
decision ledger, `public.supervisory_consequence_decision`, plus a
server-authoritative read model (`supervisory_consequence_view`) and two governed
operations (`supervisory_consequence_record`, `supervisory_consequence_withdraw`).
All record creation delegates to the existing canonical operations:

| Action | Canonical operation |
|--------|--------------------|
| `OPEN_SUPERVISORY_PLAN` | `supervisory_plan_open` |
| `REQUIRE_REASSESSMENT` | `supervisory_reassessment_require` |
| `OPEN_INTERVENTION` | `supervisory_intervention_open` |
| `OPEN_EXAMINATION` | `supervisory_examination_open` |
| `RAISE_FINDING` | `supervisory_finding_create` |
| `REFER_TO_ENFORCEMENT` | `enforcement_referral_create` |
| `RECORD_MONITORING` | ledger only (supervisor judgment) |
| `RECORD_DEFERRED` | ledger only (supervisor judgment) |

## 2. Server permissions and prerequisites

Every action names a canonical registered permission and is refused identically by
the contract view and the operation (ACTION-02, ACTION-06). Prerequisites are
server-owned: an intervention requires an approved/active plan; an examination
requires its own prerequisite; a finding requires an authoritative assessment
origin; enforcement requires a canonical finding — a risk rating is never a basis
(CREATE-05, CREATE-07, CREATE-08, CREATE-09). No rating-to-action mapping exists:
with a HIGH rating the server proposes nothing and a supervisor must decide
(ACTION-05).

## 3. Genuine product defects closed during certification

1. `licensees.regulator_id` referenced; canonical column is `lead_regulator_id`.
2. Audit logging passed `NULL::inet` where the applicable overload expects
   `text` — consequence and withdrawal audit rows now write correctly.
3. Consequence-created plans passed no objective and could not leave DRAFT; the
   objective now falls back to the supervisor's rationale, so the plan follows its
   normal submit → approve → activate lifecycle.
4. Examination engagement defaulted to `TARGETED_EXAMINATION` (an intervention
   type); corrected to canonical `TARGETED_ONSITE`, intervention default retained.
5. Enforcement referral could never succeed for a finding without corrective
   action; the supervisor's explicit `remediation_bypass_rationale` is now
   forwarded as `remediation_bypass_reason`. Nothing is synthesised — the
   canonical refusal stands when no rationale is stated.
6. Hardening: internal source/target resolvers and trigger guards revoked from
   `anon`/`authenticated`; the ledger revoked to read-only for signed-in users.
   Project advisories fell 1750 → 1746.

## 4. Duplicate, concurrency, withdrawal, immutability

A repeat by the same supervisor returns the existing decision as idempotent; a
different supervisor is told the linkage already exists — no duplicate row is
created (LINK-06, LINK-07, DUP-01…05). The operation serialises on the
risk-of-record with `FOR UPDATE`. Withdrawal is a governed, audited status change
that never deletes; source, actor, rationale and lineage are immutable (WITHDRAW,
IMMUT families).

## 5. Legacy and NOT_CALCULABLE behaviour

Legacy, override and calculated provenance are recorded separately; unavailable
or `NOT_CALCULABLE` risk does not block supervisor judgment and never implies an
action (LEGACY family). No calculation policy was invented.

## 6. Certification results

- SQL verifier `scripts/verify-aml-supervisory-consequence-linkage.sql`:
  **66 passed / 0 failed**, single transaction, `ON_ERROR_STOP`, final ROLLBACK.
  Families: SOURCE 8, ACTION 6, CREATE 11, LINK 8, DUP 5, WITHDRAW 5, IMMUT 6,
  LEGACY 6, SEC 9, ROLLBACK 2.
- Rollback: 15 in-transaction fixtures, **zero AML08CERT survivors** across
  decisions, links, withdrawals, plans, reassessments, examinations, findings,
  interventions, enforcement cases and audit rows; no AML07/06/05CERT or PLANCERT
  fixture survives.
- UI tests 25/25; frontend boundary 20/20.
- Action governance, RBAC parity and centralised authorisation green (the stale
  `supervisory_spine.review` disposition row was removed — the permission is now
  referenced).
- Typecheck green; production build OK.
- One full integration suite: 171 files, 1629 passed, 0 failed, 0 skipped, 318.8s.

## 7. Preservation

Canonical risk digest unchanged: `8385b6c8f7ba2b4102ab054c8f5ac686`.
28 assessments (22 approved / 2 draft / 1 submitted / 3 superseded), 984
responses, 22 risk states (21 AML/CFT), 25 movements, 3 ratings; methodology v1.0
ACTIVE and v1.1 DRAFT/MIPL_REFERENCE with 26 dimensions and 70 questions. Live
risk-of-record, historical assessments, calculation history, live calculation
policy, DEC-01…DEC-08 and LINK-11 records untouched.

## 8. Deferred

Three consecutive full-suite runs are deferred to the final AML module release
lock, per the governing accelerated instruction. Inherited platform advisories
(security-definer view/function exposure, mutable search paths, extensions in
public) remain outside AML-08 scope.
