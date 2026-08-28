# F5-B3P — Canonical Establishment (Branch) Register

Date: 2026-08-29 • Gates: `npm run verify:f5b3-establishments`, `npm run verify:f5b3`

## 1. Discovery

No canonical establishment/branch/location/office/premises register existed in the
live schema (only unrelated `work_allocation_policies` matched the name search).
Registered-address history (`entity_facts` / `ENTITY.REGISTERED_ADDRESS`) is not a
branch register and was deliberately not repurposed. `PLS_NEW_BRANCH` and
`PLS_BRANCH_CLOSURE` were therefore genuine `PRODUCT_GAP`s.

## 2. Establishment architecture

- `public.regulated_establishments` — entity, source licence, `establishment_type`
  (`BRANCH`), immutable internal `establishment_reference` (`EST-YYYY-NNNNNN`, no
  external branch number invented), name, `status` (`ACTIVE`/`CLOSED`),
  `address_text` + structured `address` jsonb, `opened_on`, `closed_on`,
  source/closure application and effect provenance, audit metadata.
- `public.regulated_establishment_events` — append-only `OPENED` / `CLOSED`
  lifecycle evidence with effective date, application, effect, actor and payload;
  unique per (establishment, event_type).
- Canonical data concepts (domain `establishments`, `CAPTURE_ONLY` so they never
  leak into the entity-change projection): `ESTABLISHMENT.NAME`,
  `ESTABLISHMENT.ADDRESS`, `ESTABLISHMENT.OPENING_DATE`,
  `ESTABLISHMENT.CLOSURE_DATE`, `ESTABLISHMENT.TARGET_ID`.

## 3. Security model

RLS on both tables; read-only for staff holding `license_management.view` and for
approved members of the owning entity; no `anon` grant; no `INSERT/UPDATE/DELETE`
grant for any browser role; `DELETE` forbidden by trigger for everyone; writes
require `app.workflow_mutation_context = 'trusted'`; establishment identity and
opening history cannot be rewritten; events accept only the one-time stamping of
the effect ledger reference. Helper functions
(`post_license_establishment_input`, `next_establishment_reference`, both guards)
are revoked from `anon`/`authenticated`. Dormant `coordination_flags` anon grants
remain separate security debt, untouched by this pass.

## 4. Effects

- `PLS_NEW_BRANCH` → `ESTABLISHMENT_OPEN` (handler `establishment_open`): one
  branch + one `OPENED` event + one effect ledger row, atomically with approval.
  Data is derived only from normalized submitted concepts; nothing is fabricated.
- `PLS_BRANCH_CLOSURE` → `ESTABLISHMENT_CLOSE` (handler `establishment_close`):
  binds a specific establishment id (protected `data.protected_establishment`
  context, then submitted `ESTABLISHMENT.TARGET_ID`), re-resolves ownership
  server-side, closes it, appends a `CLOSED` event, preserves all opening history.
- Intake: `set_application_establishment_target(uuid,uuid)` is the only
  authenticated write path for the target; it validates entity/licence ownership
  and open status. A trigger on `applications` restores
  `data.protected_establishment` on any untrusted edit, so arbitrary application
  JSON cannot overwrite protected context.
- Plan states: `READY`, `ESTABLISHMENT_TARGET_REQUIRED`,
  `ESTABLISHMENT_NOT_APPLICABLE`, `ESTABLISHMENT_ALREADY_CLOSED`,
  `ESTABLISHMENT_DATA_REQUIRED`. Final approval still requires `READY`, so every
  other state refuses the decision with the governed blocked envelope.

## 5. Effect-map census

| Class | Count |
|-------|-------|
| Active F5 service definitions mapped | 136 (0 unmapped) |
| Supported effect entries | 14 |
| PRODUCT_GAP | **0** |
| BUSINESS_CONFIGURATION_REQUIRED | 1 (Deregistration/surrender) |

F&P-required services remain fail-closed with `FP_DETERMINATION_REQUIRED`
pending F5-B4.

## 6. Gate results

| Gate | Result |
|------|--------|
| verify:f5b3-establishments ×2 | 33/33, 33/33 |
| verify:f5b3 | **53 PASS / 0 FAIL** (new C-05: zero PRODUCT_GAP; section H now uses the BCR surrender service as the unsupported fixture) |

`verify:f5b3-establishments` covers: fail-closed missing branch data, READY open
plan, one active branch created, internal reference and canonical data, append-only
opening event, ledger reference, open idempotency, missing target, foreign entity,
already-closed, other-licence scope, READY close plan, exact branch closed,
opening history preserved, close idempotency, before/after evidence, browser
create/update/delete/history denial, F4 non-regression, zero residue.

Note: `B-11` (other-licence branch) reports `not-applicable-fixture` when the
probe entity holds only one licence; the assertion is enforced whenever a second
licence exists for the same holder.

## 7. Outstanding

Remaining full regression battery (f5b2, f5b1, certify:f4c, coordination, f2b,
F3/F1/F0, contract gates, frontend/typecheck/build) has **not** yet been re-run in
this pass.

**Verdict: F5-B3 BLOCKERS REMAIN** — the branch/establishment PRODUCT_GAP is
closed and proven, but the full frozen-scope regression battery must be re-proven
green before F5-B3 can be declared closed. F5-B4 not started.
