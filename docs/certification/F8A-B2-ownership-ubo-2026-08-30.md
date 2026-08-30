# F8A-B2 — Deterministic Ownership Traversal + Configurable UBO

Date: 2026-08-30
Protected B1 code baseline: `741dfb5611870650570400ba23c8f7eaa12a633c`
Entry HEAD: `d2405cfd1950d5df4ca43a600005cad46c45a8d9`

## 1. Ownership-target limitation — confirmed and repaired

Confirmed before any traversal work: `ownership_interests.owned_entity_id` was
`NOT NULL REFERENCES licensees(id)`, so `Person → non-regulated Holding →
regulated Entity` was unrepresentable.

Repair, on the **same single ledger** (no second ownership table):

- added `owned_party_id uuid REFERENCES parties(id)`;
- backfilled every existing row from `licensees.party_id`;
- `owned_entity_id` made nullable, with invariant
  `owned_party_id IS NOT NULL OR owned_entity_id IS NOT NULL`;
- `ownership_interests_validate()` now resolves both directions — a regulated
  owned party also resolves to `licensees.id`, and a non-regulated
  organization/trust/partnership requires no fake licensee;
- old F5/B1 writers unchanged in behaviour: `apply_entity_change_set` still
  targets the change-set entity by default and additionally accepts an explicit
  `owned_party_id`;
- self-ownership still refused.

## 2. Traversal — `entity_ownership_network(entity, as_of, max_depth, max_nodes)`

Single set-based recursive walk over APPROVED, effective, `is_direct` edges only
(stored derived/indirect rows are never structural edges). Economic and voting
percentages multiply independently; distinct paths aggregate without duplicate
counting; cycles are detected and terminated, never looped. Defaults depth 10 /
300 nodes, hard caps 25 / 1000, unsafe requests rejected (`INVALID_DEPTH_LIMIT`,
`INVALID_NODE_LIMIT`). Output is deterministic and carries `truncated`,
`truncation_reasons`, `cycles`, `frontier`, per-edge provenance
(`approval_status`, `approved_by`, `source_change_set_id`, `recorded_at`).
No AI, no materialized duplicate graph, no identity attributes (no DOB,
passport, national ID, TIN) in the contract.

## 3. UBO policy — governed and effective-dated

`public.ubo_policies`: regulator scope, ownership threshold, voting threshold,
control-test switch, effective dates, version, approval provenance. Registered
in `config_governed_tables`; no direct DML for signed-in users; writes only via
audited `admin_upsert_ubo_policy` (permission-gated, logs `config_change_log`
and the audit trail, supersedes the prior version). **Ships empty** — no
threshold is invented; `ubo_policy_resolve` returns `CONFIGURATION_REQUIRED`
when nothing applies, and superseded versions still answer historical as-of
questions.

## 4. `entity_ubo_resolve(...)`

Qualification reasons: `ECONOMIC_THRESHOLD`, `VOTING_THRESHOLD`,
`CONTROL_DETERMINATION`, `NATURAL_PERSON_TERMINATION`. Explicit unresolved
states: `NO_UPSTREAM_DATA`, `FOREIGN_UNIDENTIFIED`, `TRUST_LEGAL_ARRANGEMENT`,
`CYCLE`, `DEPTH_LIMIT`, `NODE_LIMIT`. Stored `is_ubo` is surfaced only as
`recorded_ubo_declared` provenance and never substitutes for the recursive
calculation. No natural person is ever invented.

## 5. Security

Internal only: `is_super_admin` or `entity_structure.view`, then
`regulatory_scope_allows(...)` against the canonical regulator body from
`entity_reporting_regulator`. Anonymous execution refused; the unauthorized
traversal core is `service_role`-only; the UBO policy register is not
anon-readable and not browser-writable.

## 6. Indexes

`idx_ownership_owned_party_effective` (owned side) and
`idx_ownership_owner_party_effective` (reverse/owner side), both partial to
`superseded_at IS NULL AND is_direct` — the exact edge set the walk reads.

## 7. Certification repairs applied after the first gate pass

1. **A natural person is not automatically a UBO.** `NATURAL_PERSON_TERMINATION`
   is now descriptive `path_metadata` describing chain completeness. Membership
   of `ubos[]` requires a governed criterion only: effective economic ownership
   at or above the policy threshold, effective voting ownership at or above the
   policy threshold, or an explicit control determination while the control test
   is enabled.
2. **UBO policy history is immutable.** `ACTIVE`/`SUPERSEDED` rows cannot be
   rewritten or deleted in place (`UBO_POLICY_IMMUTABLE`, enforced additionally
   by `ubo_policies_history_immutable`). A change creates a new effective-dated
   version and supersedes the prior period; overlapping active periods are
   rejected. Only `DRAFT` may be edited in place.
3. **`max_nodes` bounds the traversal work itself.** Expansion is a
   deterministic level-by-level walk that admits candidates against the node
   budget *before* expanding them; there is no full walk trimmed by
   `LIMIT _max_nodes`. Default 300, hard cap 1000, with `NODE_LIMIT`,
   `truncated=true` and explicit frontier/boundary information.
4. **Regulator scope is enforced on every regulated expansion.** Each connected
   party that resolves to another regulated entity is checked against the
   caller's scope. Super-admin authority traverses; otherwise the branch is
   neither admitted nor expanded and is surfaced as
   `REGULATOR_SCOPE_RESTRICTED`, with nothing behind it disclosed.
5. **Legal-arrangement party kinds really work.** The legacy
   `parties_party_kind_check` (PERSON/ORGANIZATION only) is removed; the B1
   catalogue (`parties_party_kind_catalogue_fk`) is authoritative. `TRUST`,
   `FOUNDATION` and `PARTNERSHIP` parties are creatable without any person or
   organization projection, and the resolver reports them behaviourally as
   `TRUST_LEGAL_ARRANGEMENT`.
6. **Privilege residue closed.** `MAINTAIN` on `ubo_policies` was revoked from
   signed-in users, and `party_kinds` browser DML was revoked (read-only for
   `anon`/`authenticated`, governed writes only).

## 8. Gate — `verify:f8a-b2`

`scripts/verify-f8a-b2.sql`, rollback-safe, run twice with identical results:

```
F8A-B2 gate: 96 passed, 0 failed
F8A-B2 gate: PASS (96 assertions, all fixtures rolled back)
```

All 64 original assertions are retained. Added behavioural coverage: real
`TRUST`/`FOUNDATION`/`PARTNERSHIP` parties with no person/organization
projection and catalogue-only governance; a terminal natural person at 1%
economic / 1% voting with no control determination that is discovered as a
complete terminal owner but is **not** a UBO; no UBO listed without a governed
qualification reason; policy A governing T1 while policy B supersedes from T2,
with in-place mutation rejected, historical results unchanged and
`version`/`approved_by`/`approved_at`/provenance preserved; overlapping active
periods rejected; a wide synthetic network proving bounded expansion,
`NODE_LIMIT` boundary reporting, determinism and full expansion under a
sufficient budget, plus a static check that the core does not trim a full walk;
and a second ACTIVE regulator body with its own licensee upstream of the seed,
where a scoped internal reviewer (built in-transaction, since no live
non-super-admin holds `entity_structure.view`) is stopped at that branch with an
explicit restricted boundary while super-admin authority traverses it.

## 9. Regressions

| Gate | Result |
|------|--------|
| `verify:f8a-b2` (×2) | 96 / 96 PASS, zero residue |
| `verify:f8a-b1` | 64 / 64 PASS |
| `verify:f1c` | 96 TESTED_PASS / 0 FAIL (after the `ubo_policies` privilege repair) |
| `verify:f2b` | 63 TESTED_PASS / 0 FAIL (re-run after the party-kind identity change) |
| `verify:f5b3` | 53 PASS / 0 FAIL |
| `certify:f5c` | 73 / 73 PASS |
| `verify:anon-execute` | PASS — 0 defects |
| `verify:definer-guards` | PASS |
| `verify:permission-refs` | PASS |
| `verify:audit-contract` | PASS — 0 stale audit writers |
| `verify:write-contract` | OK — 0 stale write column references |
| typecheck (`tsgo --noEmit`) | PASS |
| `npm run build` | PASS |

## 10. Known gaps

- No UI surface for the network or UBO output (later wave).
- Only one ACTIVE regulator body owns live licensees; cross-regulator scope and
  policy divergence are therefore proven with rollback-safe fixtures.
- Baseline Supabase linter findings (SECURITY DEFINER breadth, extensions in
  public) remain as previously recorded; none were introduced here.

## 11. Status

F8A-B2 OWNERSHIP TRAVERSAL & UBO CLOSED — READY FOR F8A-B3

