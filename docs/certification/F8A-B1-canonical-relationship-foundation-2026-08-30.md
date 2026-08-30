# F8A-B1 — Canonical Relationship Foundation / Legacy Consolidation / Governed Structural Write & Read Contract

Date: 2026-08-30
Wave: F8A-B1 (Entity Network / Relationship Intelligence, wave 1 of 6)
HEAD at closure: `741dfb5611870650570400ba23c8f7eaa12a633c`
Entry HEAD: `4a22335eaa70713b19908eabf11fd2da375e8adb`
F7 protected frozen code baseline: `fecb806f992136341ce67a8205a3c0116761235d` (unchanged)

## 1. Scope delivered

1. **Canonical stores confirmed** — `licensees`, `parties`, `persons`,
   `ownership_interests`, `entity_appointments`, `party_relationships`, with
   catalogue tables `party_kinds`, `relationship_types`, `role_types`,
   `ownership_types`.
2. **Legacy retirement** — legacy `entity_relationships` surface and its RPCs
   retired; browser DML and legacy RPC EXECUTE revoked; `entity360_section`
   repointed at the canonical spine. Historical migration files retain legacy
   references by design (immutable history).
3. **Governed write contract** — all structural mutation flows through
   `entity_change_sets` / `entity_change_items` via
   `entity_change_set_create` → `submit` → (`review`) → `approve` → `apply`,
   with validation triggers on ownership and relationships, provenance
   (`source_change_set_id`), approval attribution and idempotent apply.
4. **Maker-checker** — human-proposed structural changes require an independent
   checker; the maker can neither approve nor reject their own change.
   Change sets carried by a governed application or regulatory-request decision
   are exempt at this layer because that approval workflow already enforces
   its own maker-checker (see §3).
5. **Scoped read contract** — `entity_structure_*` read RPCs replace direct
   client reads of sensitive canonical tables (`useWaveB.ts`).
6. **UI repairs** — Entity 360 / Entity Structure Hub read the canonical spine,
   legacy Ownership/Relationships tabs removed, ownership and relationship
   catalogue columns separated, and stored `is_ubo` is labelled
   "recorded UBO" (no derived UBO claim in B1).
7. **Change-set status vocabulary** — `WITHDRAWN` added to the governed status
   set so the existing withdraw action is real rather than nominal.

## 2. Permanent gate — `verify:f8a-b1`

`scripts/verify-f8a-b1.sql`, registered as `npm run verify:f8a-b1`.

Section G is a rollback-safe **behavioural governed ownership lifecycle** using
real maker/checker identities (`request.jwt.claims`) and the existing approval
engine — no direct positive ownership insert remains in the gate:

- maker proposes a canonical `OWNERSHIP` change set (`UPSERT`), status `DRAFT`;
- no ownership row exists before approval;
- submit records the maker;
- maker self-approval is refused (`42501`) and does not mutate status;
- independent checker approves and applies;
- applied `ownership_interests` row carries canonical owner party, canonical
  owned entity, distinct economic/voting/beneficial percentages (41 / 57 / 33),
  ownership type, direct/controller flags, `source_change_set_id`,
  `approval_status='APPROVED'`, `approved_by`, `approved_at`, `recorded_at`;
- replay of `apply` is idempotent (`applied=0`, `idempotent=true`, rows=1);
- audit carries maker (created), checker (approved), applier (applied) with
  maker/checker attribution on the apply record;
- rejected and withdrawn change sets produce no ownership mutation and refuse
  `apply`;
- zero residue — all fixtures rolled back.

Result, run twice, identical:

```
F8A-B1 gate: 64 passed, 0 failed
F8A-B1 gate: PASS (64 assertions, all fixtures rolled back)
```

## 3. Regression battery (all executed at closure HEAD)

| Gate | Result |
|------|--------|
| `verify:f8a-b1` (×2) | 64 / 64 PASS, 0 fail, 0 residue |
| `verify:f1c` | 96 TESTED_PASS / 0 FAIL / 0 N-A |
| `verify:f2b` | 63 TESTED_PASS / 0 FAIL / 0 N-A |
| `verify:f5b3` (effect engine) | 53 PASS / 0 FAIL |
| `certify:f5c` | 73 / 73 PASS |
| `verify:f7b` | PASS (105 assertions) |
| `certify:f7c` | PASS (120 assertions) |
| `verify:anon-execute` | PASS |
| `verify:definer-guards` | PASS |
| `verify:permission-refs` | PASS |
| `verify:audit-contract` | PASS (0 stale audit writers) |
| `verify:write-contract` | PASS |
| `verify:breadcrumbs` | PASS |
| Frontend suite | 143 files / 1312 tests passed |
| `tsgo --noEmit -p tsconfig.app.json` | clean |
| `npm run build` | success |

### Genuine regression found and repaired

`verify:f5b3` (E-99) and `certify:f5c` (B-99) initially failed with
`42501: Maker-checker violation: the proposer of a structural change cannot
approve it`. Root cause: the frozen post-licensing effect engine
(`apply_post_license_effect`, `ENTITY_CHANGE` handler) creates, submits,
approves and applies a change set inside the already-approved F5 decision
transaction, so creator and approver are necessarily the same officer.

Repair (minimal, B1-scoped): the second-person rule in
`entity_change_set_transition` now applies only when the change set has no
`application_id` and no `regulatory_request_id` — i.e. the human proposal path.
Application/regulatory-request-borne change sets remain maker-checked by the
governed approval workflow that authorised them. Both gates returned to full
PASS with the B1 human-path self-approval assertions still enforced (G-04, G-05).

## 4. Live census at closure

legacy relationship rows 0 · ownership interests 0 (production; gate fixtures
rolled back) · entity appointments 38 · party relationships 0 · parties 92 ·
relationship types 10 · role types 11 · change sets 0.

## 5. Security / linter boundary

Supabase linter reports 1,493 findings: 3 SECURITY DEFINER views,
27 mutable-search-path functions (all pgTAP extension routines — zero
project-owned SECURITY DEFINER function lacks a pinned `search_path`,
verified directly), 3 public extensions, 7 anon-executable and 1,453
authenticated-executable SECURITY DEFINER functions. These are the pre-existing
baseline governed-RPC surface and extension debt; B1 introduced no new class of
finding, and `verify:anon-execute` / `verify:definer-guards` both PASS.

## 6. Out of scope (explicitly not started)

F8A-B2 ownership traversal / UBO resolver · B3 Person 360 / F&P identity
linkage · B4 normalized address intelligence · B5 graph visualisation ·
B6 20-entity certification · F8 Prudential · F9 Fit & Proper. No graph library,
graph database, UBO calculation, common-address engine or AI was added.

## 7. Verdict

**F8A-B1 CANONICAL RELATIONSHIP FOUNDATION CLOSED — READY FOR F8A-B2**
