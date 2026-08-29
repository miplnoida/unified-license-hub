# F5-B3 — Governed Post-Approval Effect Engine

Date: 2026-08-29 • Gates: `npm run verify:f5b3`, `npm run verify:f5b3-establishments` • Verdict (F5-B3C, 2026-08-29): **F5-B3 CLOSED — READY FOR F5-B4**

## 1. Starting position

- Entering state: `verify:f5b3` = **40 PASS / 3 FAIL**.
- Defects carried in:
  - **E-99** (HARNESS): gate queried a non-existent `post_license_effects.result`
    column (and `organization_names.entity_id`).
  - **G-02** (PRODUCT): an F&P-blocked plan still produced a successful-looking
    final approval result.
  - **H-02** (PRODUCT): a `PRODUCT_GAP` plan still produced a successful-looking
    final approval result.

## 2. Product fix — fail-closed final approval

`public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid)` (SECURITY
DEFINER, `search_path=public`) now, for a genuine F5 filing (canonical
classification via `post_license_effect_plan` — never `data.type`):

1. locks the application and the active workflow instance;
2. evaluates the canonical effect plan **before** any status transition;
3. refuses unless `state = 'READY'` — `BLOCKED`, `PRODUCT_GAP`,
   `BUSINESS_CONFIGURATION_REQUIRED`, `FAIL_CLOSED`,
   `EFFECT_MAPPING_MISSING` and every other state are rejected;
4. on refusal returns a stable governed blocked envelope —
   `success:false`, `blocked:true`, `http:422`, `application_id`, `plan_state`,
   `plan_code`, `code`, `blockers[]`, `effect_plan`, `readiness` — plus a
   `post_license.effect.blocked` audit row, and performs **no** mutation;
5. on READY: sets the application approved, completes the workflow, calls
   `apply_post_license_effect` in the **same transaction**, requires
   `success = true`, then asserts exactly one `APPLIED` ledger row
   (`POST_LICENSE_EFFECT_LEDGER_INVALID` otherwise) — any failure aborts the
   whole decision (status, workflow completion, decision evidence,
   renewal/term mutation, change set, acknowledgement and ledger).

F4 initial licensing keeps the frozen provisioning path
(`provision_application_entity` + `assert_license_term_integrity`) untouched,
and F5 never enters it.

Migration: `20260828_f5_b3_fail_closed_final_approval` (applied).

## 3. Harness fix (E-99, no production schema change)

`scripts/verify-f5b3-effects.sql` now reads the real ledger schema:
`result_ref`, `evidence_before`, `evidence_after`, `provenance`, `handler`,
`canonical_target`, and asserts canonical name state through
`organization_names.source_change_set_id` / `regulated_entities.legal_name`.

## 4. Permanent gate — `npm run verify:f5b3`

Registered in `package.json` (artifact: `artifacts/verify-f5b3-latest.log`).
Rollback-safe; all probe fixtures are discarded.

| Run | Result |
|-----|--------|
| 1 | **52 PASS / 0 FAIL** |
| 2 | **52 PASS / 0 FAIL** |

Coverage: surface/definer/search_path contract, browser lockdown (executor not
executable, ledger/map not writable, append-only + RLS), effect-map
completeness, renewal end-to-end (one new current `renewal` term, prior term
superseded, validity advanced, linked `license_renewals`, provenance) and
idempotency, entity-change through the canonical change-set model with
before/after evidence, notification-only acknowledgement with untouched licence
state, F&P blocked refusal (G-02/G-03/G-04), product-gap refusal
(H-02/H-02b/H-02c), unknown/rejected fail-closed, browser tamper attempts,
F4 non-regression, zero residue.

## 5. Fresh service / effect census (recalculated in F5-B3C)

Active F5 service definitions (`services.status='active'` and
`lifecycle_stage` in `post_license_service_stages()`): **136**, of which
**0** have no effect key and **0** are unmapped.

| Effect family | Handler | Canonical target | Supported | Definitions |
|---------------|---------|------------------|-----------|-------------|
| ENTITY_CHANGE | `entity_change_set` | `entity_change_sets` → organization_names / entity_facts / ownership_interests / entity_appointments / party_relationships | yes | 80 |
| NOTIFICATION_ACK | `notification_acknowledgement` | `post_license_acknowledgements` | yes | 24 |
| ESTABLISHMENT_OPEN | `establishment_open` | `regulated_establishments` + `regulated_establishment_events` | yes | 8 |
| ESTABLISHMENT_CLOSE | `establishment_close` | `regulated_establishments` + `regulated_establishment_events` | yes | 8 |
| RENEWAL | `license_lifecycle_step` | `license_renewals` + `license_terms` | yes | 8 |
| UNSUPPORTED | — | — | no — `BUSINESS_CONFIGURATION_REQUIRED` | 8 (Deregistration / surrender) |

- unmapped: **0**
- active `PRODUCT_GAP`: **0** (New Branch and Branch Closure now supported)
- unsupported without an explicit blocker class: **0**
- F&P-dependent services remain explicitly refused at plan time with
  `FP_DETERMINATION_REQUIRED` (proven by `verify:f5b3` G-02…G-04); linkage is
  F5-B4 scope.

## 6. Establishment (branch) closure

See `F5-B3P-establishment-register-2026-08-29.md`. The cross-licence negative
case is now non-vacuous: `verify:f5b3-establishments` always proves that a branch
scoped to licence A cannot be the Branch Closure target of licence B for the same
entity, recording a real `ESTABLISHMENT_NOT_APPLICABLE` refusal, using a
rollback-safe synthetic second licence issued through the certified path when the
fixture holder owns only one licence.

## 7. F5-B3C regression battery (runtime HEAD 722f5670)

| Gate | Result |
|------|--------|
| verify:f5b3-establishments ×2 | 34/34, 34/34 |
| verify:f5b3 ×2 | 53/53, 53/53 (C-05 = 0 PRODUCT_GAP) |
| verify:f5b2 ×2 | 44/44, 44/44 |
| verify:f5b1 | 51/51 |
| F5 discovery census | PASS |
| certify:f4c | 87 PASS / 0 FAIL |
| verify:f4b | PASS |
| verify:license-terms | PASS |
| verify:coordination-lifecycle | 26/26 (×2, interleaved) |
| verify:outbox-delivery | 28/28 |
| verify:audit-contract | PASS |
| verify:write-contract | PASS |
| certify:f3c | PASS |
| verify:f3b | 38/38 |
| verify:f2b | 63/63 (×2, interleaved) |
| verify:f1c | 96/96 |
| verify:f0c | 34/34 |
| verify:hardening | 31/31 + F5-B1 block 4/4 |
| verify:permission-refs, anon-execute, definer-guards | PASS |
| edge authz (`scripts/verify-edge-authz.mjs`) | PASS — user=47 worker=28 webhook=1 machine=1 public=7 |
| verify:breadcrumbs, verify:service-completeness | PASS |
| frontend suite | 141 files / 1293 tests PASS |
| typecheck (`tsgo -p tsconfig.app.json`) | clean |
| build | PASS |

Session-isolation order (hardening → F2B → coordination → F4-C → F2B →
coordination) was executed deliberately; both later repetitions stayed green, so
the F5-B3R `row_security` isolation fix holds.

F4 initial licensing re-proven: `is_post_license=false`, no establishment effect
and no F5 effect ledger row (`verify:f5b3-establishments` B-20, `verify:f5b3` F4
non-regression), issuance still exclusively through the frozen F4 path
(`certify:f4c`, `verify:license-terms`).

Zero synthetic residue in every gate (residue sections all 0).

## 8. F5 gap status after B3

- **CLOSED in F5-B1** — GAP-F5-08/09/10 (post-licensing privilege and governed
  configuration lockdown).
- **CLOSED in F5-B2 (+ delta)** — GAP-F5-01/02/15 (intake authority, canonical
  licence/service binding, delegation restricted to genuine F5, duplicate
  protection, service↔licence applicability).
- **CLOSED in F5-B3 / B3P / B3C** — GAP-F5-03 (approved post-licence
  applications now produce governed, atomic, idempotent regulatory effects) plus
  the New Branch / Branch Closure PRODUCT_GAP.
- **Deliberately remaining for F5-B4 or later** — F&P determination linkage
  (F&P-dependent services remain fail-closed), Deregistration / surrender
  `BUSINESS_CONFIGURATION_REQUIRED` pending regulator semantics, and the dormant
  `coordination_flags` anon grants which stay recorded as separate security debt
  (no frozen gate classifies them as a failing regression in this pass).

F5-B3 closure means the effect-engine remediation wave is closed. **F5 itself is
not certified or frozen.**

## 9. Verdict

**F5-B3 CLOSED — READY FOR F5-B4.** F5-B4 not started.

## Appendix — original B3 service census (superseded by §5)

### Service census (as at 2026-08-29, pre-establishment) (active definitions)

| Class | Count |
|-------|-------|
| Active F5 service definitions | 136 |
| Mapped to a governed effect entry | 136 (0 unmapped) |
| Supported effect families | 13 |
| BUSINESS_CONFIGURATION_REQUIRED | 1 (Deregistration/surrender) |
| PRODUCT_GAP | 2 (New Branch, Branch Closure) |

Effect families: `RENEWAL` → `license_renewals` + `license_terms` via
`license_lifecycle_step`; `ENTITY_CHANGE` → `entity_change_sets` /
`entity_change_items` / `apply_entity_change_set` (legal name, address,
ownership/control, director/KFH, relationships, external auditor);
`NOTIFICATION_ACK` → immutable acknowledgement register only.

## 6. Regression battery

| Gate | Result |
|------|--------|
| verify:f5b3 ×2 | 52/52, 52/52 |
| verify:f5b2 ×2 | 44/44, 44/44 |
| verify:f5b1 | 51/51 |
| certify:f4c | PASS |
| verify:f4b, verify:f3b, verify:f1c, verify:f0c | PASS |
| verify:permission-refs, license-terms, audit-contract, write-contract | PASS |
| verify:service-completeness, anon-execute, definer-guards, hardening | PASS |
| typecheck (`tsgo -p tsconfig.app.json`) | clean |
| **verify:f2b** | **FAIL — 62 PASS / 1 FAIL** |
| **verify:coordination-lifecycle (F4-B3)** | **FAIL — 24/26** |

Both failures are outside the F5-B3 change surface (this pass replaced only
`perform_final_workflow_approval`) and are pre-existing environment/policy
drift, not F5 regressions:

- `F2-B S1 P-05` — anonymous allow-listed read of
  `registration_journey_types` fails with `42501: query would be affected by
  row-level security policy`. Grants and `rjt_public_read` still exist; the
  probe path itself is broken.
- `F4-B3 E2/E3` — canonical coordination flag resolve/withdraw leaves the
  latest audit row at `coordination.flag.raised`, i.e. the participant UPDATE is
  not landing under the fixture's authority (`Participants can update flags`).

### Open blockers as recorded at the first B3 pass (all now closed — historical)

1. PRODUCT_GAP (New Branch / Branch Closure) — closed in F5-B3P.
2. Frozen-scope gate failures (`verify:f2b` P-05, coordination E2/E3) — closed in
   F5-B3R and re-proven in F5-B3C.
3. F&P dependency — deliberately deferred to F5-B4 (services remain fail-closed).

Current verdict is in §9: **F5-B3 CLOSED — READY FOR F5-B4**.
