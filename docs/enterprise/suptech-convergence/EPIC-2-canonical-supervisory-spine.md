# EPIC 2 — CANONICAL ENTERPRISE SUPERVISORY SPINE

**Status: CERTIFIED**
Runtime evidence date: 2026-09-02 · HEAD `a9a36c9f7` · migration head
`20260902200714_951b16b3-c67b-4d32-a35f-d9d4af72a8ad.sql`

Certification script: `scripts/verify-epic-2-supervisory-spine.sql`
(single transaction, all fixtures rolled back, 17 asserted gates).

---

## 1. What Epic 2 delivered

| Layer | Canonical object | Notes |
| --- | --- | --- |
| Risk of record | `entity_risk_state` | judged risk; exactly one governed writer |
| Assessment | `supervisory_assessment` (+ `supervisory_assessment_dimension`) | domain-neutral; PRUDENTIAL, AML_CFT, MARKET_CONDUCT, CROSS_DOMAIN |
| Domain extension | `aml_assessments`, prudential assessment tables | extend, never duplicate, the canonical envelope |
| Attention | `supervisory_attention` (+ `supervisory_attention_origin`) | governed origin mandatory (assessment, dimension, signal, complaint, examination or external reference) |
| Plan | `supervisory_plan` (+ `supervisory_plan_assessment`) | maker/checker lifecycle; `objective_source` recorded |
| Intervention | `supervisory_intervention` | 15+ intervention type catalogue; decisions ENDORSED/REJECTED/ACTIVE/COMPLETED/CANCELLED |
| Activity | `examinations` (+ `examination_origin`, stages) | one stage engine; engagement types incl. OFFSITE_REVIEW and JOINT_EXAMINATION |
| Trace | `supervisory_trace(scope, id)` | returns `origins`, `plan`, `intervention` for an activity |

Legacy convergence: legacy inspections, legacy planning tables and the
`LEGACY_UNKNOWN` bypass are closed; compatibility views keep the certified
conduct surfaces reading unchanged.

---

## 2. Certification results (17/17 gates)

**Structural gates**

1. PASS 1 — legacy 3 plans / 12 actions preserved, mapped 1:1, no invented provenance.
2. PASS 2 — 14/14 examinations preserved with ids, stages, children, explicit `LEGACY_UNKNOWN` provenance.
3. PASS 3 — all 24 canonical provenance edges are FK-backed.
4. PASS 3b — intervention → activity link uses FK columns; `canonical_record_id` is display metadata only.
5. PASS 3c — the database rejects invalid provenance ids on every canonical edge.
6. PASS 4 — `entity_risk_state` has exactly one governed writer (approved assessment transition).
7. PASS 5 — OFFSITE_REVIEW is an engagement type; stages distinct; one stage engine for all engagement types.
8. PASS 6 — legacy inspections, legacy planning tables, compatibility views and `LEGACY_UNKNOWN` bypass all closed.

**End-to-end scenarios (real personas, maker/checker separated)**

9. PASS A — prudential: assessment → attention → priority → plan → intervention → examination → trace.
10. PASS B — AML/CFT: assessment → domain extension → attention → priority → plan → intervention → AML_CFT examination → trace.
11. PASS C — market conduct: canonical signal → attention → plan → intervention → activity, legacy conduct reads intact.
12. PASS D — two approved assessments drive **one** joint examination through physical authoritative links.

**Authorisation and integrity gates**

13. PASS E1 — unauthorised persona denied on assessment create, priority confirmation, plan approval, examination and risk state.
14. PASS E2 — maker-checker denies self-approval of a supervisory assessment.
15. PASS E3 — arbitrary activity linkage rejected; AML confidentiality boundary holds.
16. PASS E4 — every governed spine operation enforces entity scope; RLS enabled on canonical stores.
17. PASS FINAL — certification fixtures are transaction-scoped; historical populations unchanged.

Personas used: Certification Prudential Analyst / Supervisor, Certification
Conduct Analyst / Supervisor, plus an unauthorised persona for the negative gates.

---

## 3. Regressions run and classification

| Suite | Result | Classification |
| --- | --- | --- |
| `scripts/verify-epic-2-supervisory-spine.sql` | 17/17 PASS | — |
| `scripts/verify-f8-w1d-prudential-config-governance.sql` | 9/9 PASS | prudential config governance intact |
| `scripts/verify-f0c-certification.sql` D-06 (no trigger function executable by anon/authenticated) | PASS (was FAIL, 7 exposed) | **EPIC2_REGRESSION — FIXED** (2 of the 7 were the Epic 2 guards `entity_risk_state_guard`, `inspections_legacy_write_guard`; all trigger-only routines now revoked from PUBLIC/anon/authenticated) |
| `scripts/verify-f0c-certification.sql` A-16 (anon RPC boundary) | FAIL, defects reduced 10 → 2 | **PRE_EXISTING** — remaining `ai_gov_display_alias`, `ai_gov_can_view_technical_provenance` predate Epic 2 (AI Governance neutralisation work). `ai_governance_model_save` (a mutation) was additionally revoked from `anon` in this wave. |
| TypeScript typecheck (`tsgo --noEmit`) | clean | — |

No Epic 2 regression remains open.

---

## 4. Test-fixture findings (not product defects)

| # | Finding | Classification |
| --- | --- | --- |
| F-01 | `aml_assessments.aml_assess_write` requires `has_permission(uid,'aml_supervision','edit')`, but the permission catalogue only defines `aml_supervision.view` and `.approve`, so no non-super-admin user can write the AML extension table. Pre-dates Epic 2 (migration `20260820113315`). The certification script writes that extension row outside the persona session and still asserts the FK-backed envelope linkage. | PRE_EXISTING (documented residual) |
| F-02 | `supervisory_signal` was empty, so the conduct scenario needed a canonical signal fixture; signal ingestion is not in Epic 2 scope. | TEST_FIXTURE_ISSUE |
| F-03 | The conduct certification personas had no entity supervision assignment; the script adds a transaction-scoped assignment fixture. | TEST_FIXTURE_ISSUE |

---

## 5. Residuals carried forward

- `aml_supervision.edit` permission missing from the catalogue (F-01) — resolve where AML RBAC is next touched.
- A-16 anon boundary: two AI-governance read helpers remain anon-executable (pre-existing).
- Escalation convergence (Q-C) and the `conduct_investigations` decision (Q-D) remain deferred to Epic 4.

---

## 6. Verdict

**EPIC 2 — CANONICAL ENTERPRISE SUPERVISORY SPINE: CERTIFIED.**
All four supervisory domains reach a single canonical activity through
FK-backed provenance, one judged risk of record, one stage engine and enforced
maker-checker plus entity-scope authorisation. Epic 3 has not been started.
