# PCOMP-R2G — Risk history semantics and policy certification closeout

Baseline HEAD: `073849c293666478b94e0df572fe5cea91823fe5` (clean, confirmed before any change).
Final state: baseline plus one migration, one verifier script and this document.

## 1. Rebaseline confirmation

| Check | Result |
| --- | --- |
| `FSRA-AML-CFT-POLICY` v1.0 (`5dcc6999-7740-476a-b549-98537ad585c2`) | ACTIVE, REGULATOR_AUTHORED, FSRA-owned, 7 exact bindings |
| Retained assessment `SUP-AML_CFT-2026-00830` (`7e0a9271-8696-4242-a905-fd8cb66c938f`) | unchanged, status `approved` |
| Published operative AML/CFT rating for DEMO AML 22 | HIGH, unchanged |
| Policy Basis snapshot | unchanged, still pinned to v1.0 |
| AML-08 consequence decision and SLA obligation | unchanged, SLA `ON_TIME` |

## 2. Root cause of the duplicate risk movements

Two writers recorded an operative movement for a single governed publication:

1. **The legacy status trigger.** `supervisory_assessment_risk_movement`
   (`AFTER UPDATE OF status ON supervisory_assessment`) calls
   `supervisory_risk_movement_record()`, which inserted an
   `entity_risk_state_movement` row whenever the status became `approved`,
   deriving `trigger_kind` from the reassessment requirement or the assessment
   `trigger_type` (hence the `PERIODIC` row). This predates AML-07.
2. **The governed AML-07 publication writer.**
   `supervisory_assessment_publish_internal()` updates `entity_risk_state`,
   inserts the canonical movement with `trigger_kind = 'ASSESSMENT_APPROVAL'`,
   and writes the publication ledger row keyed by `approval_decision_id`.

`supervisory_assessment_approve` defaults to `_publish = true`, so a single
governed approval ran both writers and produced two equivalent HIGH movements.
Publication itself was already idempotent (advisory lock plus a
publication-ledger lookup on `approval_decision_id`); the duplicate never came
from a second publication.

## 3. The exact production fix (prospective only)

Migration: `supabase/migrations/20260912145136_36be3f5a-d388-4bb9-947e-675e3fd8174c.sql`.

1. `supervisory_risk_movement_record()` now establishes ownership explicitly.
   When the approval is governed (`NEW.approval_decision_id IS NOT NULL`) it
   records **no** movement — the canonical movement belongs exclusively to the
   publication event. It still fulfils the open reassessment requirement.
   Assessments approved **without** a governed approval decision keep the
   documented pre-AML-07 atomic approval-and-publication behaviour, so no
   legacy path loses its movement.
2. A structural backstop:
   `entity_risk_state_movement_publication_identity_uq` is unique on
   `(new_assessment_id, domain_code) WHERE trigger_kind = 'ASSESSMENT_APPROVAL'`.
   **Identity is the governed publication event for an assessment, never the
   rating text** — a genuinely distinct later assessment has a different
   `new_assessment_id` and may record the same rating again.
3. `supervisory_policy_profile_resolve` explanatory text corrected (section 6).

Publication remains governed, atomic, idempotent and concurrency safe: the
advisory lock plus the ledger lookup return the existing publication outcome,
and the new index is a hard backstop against any future second writer.

### Why the historical duplicates were preserved

The two HIGH movements on DEMO AML 22 are immutable regulatory ledger rows. They
were not updated, deleted, collapsed, re-timestamped or re-explained, and
`SUP-AML_CFT-2026-00830` history was not rewritten. The fix is prospective; the
record of what the system actually did remains auditable.

## 4. Approval versus publication ownership

`CALCULATED RESULT != APPROVED ASSESSMENT RESULT != PUBLISHED RISK-OF-RECORD`

* calculation registers a recommended rating on a pinned policy basis;
* approval binds the final assessment rating and writes the approval decision;
* **only** publication establishes or changes the entity's operative
  risk-of-record and its canonical movement — including when approval invokes
  publication atomically in the same call.

## 5. Certification — `scripts/verify-pcomp-r2g-risk-history.sql`

Rollback-only, real personas, `row_security = on`, no `service_role`. Two
genuinely distinct governed assessments were driven through the real
operational chain on DEMO AML 20 (programme resolution, answers, finding,
evidence link, independently approved evidence exception, calculation, judgement,
submission, independent approval, publication).

**13/13 gates PASS**

| Gate | Result |
| --- | --- |
| R2G-00 identity is the publication event, not the rating text | PASS |
| R2G-01 approval binds the result and creates 0 movements, 0 publications | PASS |
| R2G-02 publication creates exactly 1 movement (operative HIGH) | PASS |
| R2G-03 the movement is the publication event (`ASSESSMENT_APPROVAL`, MODERATE→HIGH) | PASS |
| R2G-04 repeat publication adds nothing, `already_published=true` | PASS |
| R2G-05 four retried/concurrent publications cannot duplicate | PASS |
| R2G-06 publication supersedes the previous operative risk correctly | PASS |
| R2G-07 response policy consumes the published risk of record | PASS |
| R2G-08 policy trace reads the published operative rating | PASS |
| R2G-09 a distinct later assessment publishes the SAME rating and records 1 new movement | PASS |
| R2G-10 the atomic approve-and-publish path also yields exactly 1 movement | PASS |
| R2G-11 the entity's earlier movement rows are unchanged, none collapsed | PASS |
| R2G-12 retained `SUP-AML_CFT-2026-00830` keeps its status and its two immutable movements | PASS |

**Preservation after rollback — 4/4 PASS**: movement count and digest (29 rows)
unchanged, every entity's operative risk unchanged, no assessment or publication
created/removed/restated, `FSRA-AML-CFT-POLICY` v1.0 still ACTIVE.

## 6. Stale policy resolver description

`supervisory_policy_profile_resolve` no longer claims the generic families are
"not yet runtime consumed". It now returns explicit
`runtime_consumed_components` — `EVIDENCE_POLICY`, `JUDGEMENT_POLICY`,
`RESPONSE_POLICY`, `SLA_POLICY` — and `configuration_only_components` —
`SECTOR_OVERLAY`, `FACT_CONFIG`, `SOURCE_BINDING`, `MATERIALITY_POLICY`,
`DASHBOARD_POLICY`, `NOTIFICATION_POLICY` — with matching note text. No runtime
behaviour was changed for the sake of the wording.

## 7. Regression and preservation results

| Check | Result |
| --- | --- |
| `scripts/verify-pcomp-r2f-live-governed-adoption.sql` | **20/20 PASS**, plus C1–C3 preservation PASS |
| `scripts/verify-pcomp-r2g-risk-history.sql` | **13/13 PASS**, plus 4/4 preservation PASS |
| `scripts/verify-pcomp-r1-effective-policy-spine.sql` | **BLOCKED** in this session (below) |
| `bunx tsgo --noEmit` | clean |
| Build | build OK |
| Full suite (`vitest`, 2 workers) | **179 files / 1752 tests passed** |
| RBAC action coverage | 2314/2314 protected (100.0%) |

**R1 verifier blocked, honestly reported.** It seeds synthetic methodology
fixtures with direct inserts; `authenticated` holds only `SELECT` on
`supervisory_methodology` under the inherited policy-table write lockdown, and
this session has no elevated role. Its recorded certification (51/51 with
preservation gates at R2E-C) stands as prior evidence and was not re-obtained.
The same limitation applies to the R2A–R2E verifier reruns. The R2F live-state
verifier does not seed policy content and therefore ran and passed.

## 8. Authenticated browser walkthrough

A preview session was minted for the requesting Lovable account and restored
into the browser. Observed, with **0 HTTP responses ≥ 400**:

| Route | Observed |
| --- | --- |
| `/admin/supervisory-policy-profiles` | register lists `FSRA-AML-CFT-POLICY` |
| `/admin/supervisory-policy-profiles/5dcc6999-…` | the live package with its methodology, calculation and runtime component bindings |
| `/admin/supervisory-policy-components` | Evidence, Judgement, Response and SLA components |
| `/supervision/aml/assessments` | register lists `SUP-AML_CFT-2026-00830` |
| `/supervision/aml/assessments/7e0a9271-…` | workspace with Policy Basis (`FSRA-AML-CFT-POLICY`), evidence/readiness, calculation, approval and SLA content |

Console output carried 385 messages, all inherited React `forwardRef` and
provider warnings, none originating in this wave's changes.

**Not observed on screen:** the Policy Trace panel did not appear in the
captured workspace text, and no mutating action was driven through the UI. The
Policy Trace server contract is verified by gate R2G-08. Browser certification
of the trace panel and of UI-driven approval/publication is therefore recorded as
**PENDING**, not claimed.

## 9. CI

GitHub Actions logs are not reachable from this environment, so CI is reported as
**NOT OBTAINED**, exactly as in R2F. Local equivalents (typecheck, build, full
suite) are green. No check was weakened, suppressed or skipped. The inherited
repository-wide `no-explicit-any` debt (~6,367 findings) was explicitly out of
scope and was not touched. The security linter reports 1797 pre-existing project
findings; this wave created no table, no RLS surface and no new SECURITY DEFINER
function — it replaced two existing SECURITY DEFINER functions in place.

## 10. Classification

**PASS** for risk-history semantics and the certification closeout, with the R1
verifier rerun blocked by session privileges, browser certification of the Policy
Trace panel PENDING, and CI NOT OBTAINED.

DEC-01…DEC-08 remain regulator decisions. The six remaining policy families
(Sector Overlay, Fact Config, Source Binding, Materiality, Dashboard,
Notification) remain configuration only and were not started.
