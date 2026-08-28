# F5-B3 — Governed Post-Approval Effect Engine

Date: 2026-08-29 • Gate: `npm run verify:f5b3` • Verdict: **F5-B3 BLOCKERS REMAIN**

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

## 5. Service census (active definitions)

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

## 7. Open blockers (why the verdict is not CLOSED)

1. **PRODUCT_GAP still active** — New Branch and Branch Closure remain active
   services with no canonical establishment/branch register. Per the exit rule
   they cannot be closed or reclassified as BCR.
2. **F&P dependency** — F&P-required services correctly return
   `FP_DETERMINATION_REQUIRED` and are refused; linkage is F5-B4 scope.
3. **Frozen-scope gate failures** — `verify:f2b` (P-05) and
   `verify:coordination-lifecycle` (E2/E3) must be re-proven green before any
   freeze claim.

**F5-B3 BLOCKERS REMAIN** — F5-B4 not started.
