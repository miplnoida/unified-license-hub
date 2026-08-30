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

## 7. Gate — `verify:f8a-b2`

`scripts/verify-f8a-b2.sql`, rollback-safe, run twice with identical results:

```
F8A-B2 gate: 64 passed, 0 failed
F8A-B2 gate: PASS (64 assertions, all fixtures rolled back)
```

Scenarios proven behaviourally: direct person owner; non-regulated
`P → H → E`; three ownership levels through two non-regulated holdings; two
independent paths from the same person aggregated once each; economic 60% vs
voting 24% from the same structure; controller at 1% qualifying only on the
control test; circular ownership detected without looping; unapproved and
derived rows excluded; historical as-of ownership; two policy versions producing
different UBO outcomes from one structure; another regulator's policy not
leaking; depth and node truncation reported; unauthenticated, external and
out-of-scope denials; deterministic repeated output; zero residue.

## 8. Regressions

| Gate | Result |
|------|--------|
| `verify:f8a-b2` (×2) | 64 / 64 PASS, zero residue |
| `verify:f8a-b1` | 64 / 64 PASS |

Remaining required regressions for closure (not yet executed at the time of
writing): `verify:f2b`, `verify:f5b3`, `certify:f5c`, `verify:f1c`,
`verify:anon-execute`, `verify:definer-guards`,
`verify:permission-references`, `verify:audit-contract`,
`verify:write-contract`, typecheck/build.

## 9. Known gaps

- `parties.party_kind` is still constrained to `PERSON` / `ORGANIZATION`, so
  trusts/foundations/partnerships cannot yet be stored as first-class parties;
  the resolver's `TRUST_LEGAL_ARRANGEMENT` branch is therefore contract-proven
  rather than fixture-proven. Widening the party-kind constraint belongs to a
  later wave.
- No UI surface for the network or UBO output (B5 scope).
- Only one regulator currently owns licensees, so cross-regulator UBO divergence
  is proven through two policy versions plus policy isolation.

## 10. Status

Ownership traversal and UBO calculation are implemented, gated and green;
closure verdict is pending the full regression battery in §8.
