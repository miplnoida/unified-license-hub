# F8A-B4 — Common / Normalized Address Intelligence — Certification Record

Date: 2026-08-30
Scope: F8A-B4 only. B1, B2, B3 were not reopened (B4 produced two concrete
regression findings that were remediated in place; see §12). B5, B6, F8
Prudential and F9 were not started.

---

## 1. Authoritative contract

Recovered from `docs/certification/F8A-entity-network-discovery-2026-08-30.md`:

- one canonical address primitive (`addresses`) with a deterministic
  normalization key, and one effective-dated usage relation (`address_usages`);
- deterministic EXACT / NORMALIZED common-address intelligence — no fuzzy,
  probabilistic or AI matching;
- a thin Address 360 read surface (address + occupants, no dossier);
- governed relationship-intelligence search and a projection queue;
- routes `/intelligence/addresses/:addressId` and `/intelligence/network`;
- authorization reuses the existing `entity_structure.view / propose /
  approve / apply` vocabulary. **No** `relationship_intelligence:view`
  permission and no new module were introduced.

## 2. Baseline

| Item | Value |
| --- | --- |
| Baseline HEAD (start of B4) | `197531f5a7f3f5466fbd3da46c5517ae7be6f9a7` |
| Closure-pass HEAD (start) | `b41c46e6f30daece2916d2d2d5763160abe4ff22` |
| Final HEAD | `baf213290fc537661063163352b823e3b789e21f` |
| Branch | `edit/edt-eaae0b46-8fb8-4593-b997-7421c941ff2c` |
| Migration count (start / final) | 1,292 → 1,296 |
| B1 / B2 / B3 at baseline | 64/64, 96/96, 67/67 |
| Frontend / breadcrumbs at baseline | 1,317/1,317, 343/343 |

## 3. Original 11-gap register — final disposition

| Gap | Severity | Problem | Remediation | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| B4-01 | Critical | No canonical address primitive existed | `addresses` with generated `normalized_key`, uniqueness, indexes | gate A/B, runtime §1–2 | CLOSED |
| B4-02 | Critical | No effective-dated usage relation | `address_usages` with approval + effective range, subject guard | gate C/D | CLOSED |
| B4-03 | Critical | Address writes would be browser-reachable | RLS on both tables, `authenticated` = SELECT only, all writes via governed RPCs | gate F/G, runtime §2, §7 | CLOSED |
| B4-04 | Critical | No deterministic normalization (`St Kitts` vs `Street Kitts` risk) | `address_norm_street` / `address_normalize_key`, versioned | gate B (incl. `St Kitts` ≠ `Street Kitts`) | CLOSED |
| B4-05 | High | No governed read/mutation RPC surface | 10 governed RPCs + 4 internal helpers | runtime §1 (14/14 contracts) | CLOSED |
| B4-06 | High | Authorization vocabulary risk (new permission) | reuses `entity_structure.*`; permission-reference gate passes | gate N, `verify:permission-refs` | CLOSED |
| B4-07 | High | Person 360 / Entity 360 would each grow their own address code | single `SubjectAddressPanel` on the same canonical relation | runtime §3e/3f | CLOSED |
| B4-08 | High | Unresolved F&P identities could be silently "resolved" by address data | projection refuses to create a party/entity; unresolved stay queued | gate L, projection §5 (`unresolved: 0` projected, 35 still unresolved) | CLOSED |
| B4-09 | Medium | No projection queue visibility | `address_projection_queue()` + UI panel | runtime §3d | CLOSED |
| B4-10 | Medium | No audit trail on address decisions | every governed mutation writes `audit_logs` | gate K | CLOSED |
| B4-11 | Medium | No routes/nav/breadcrumb registration | migration `20260830153753`, breadcrumbs 345/345 | gate N, runtime §5 | CLOSED |

No original blocker is undisposed.

## 4. Architecture

- **Normalization** — `address_norm_text` (case/diacritic/punctuation/whitespace)
  and `address_norm_street` (token-safe abbreviation expansion; `St` expands
  only in a street-suffix position, so `St Kitts` never becomes
  `Street Kitts`). `normalized_key` is generated, versioned by
  `address_normalization_version()`, and unique.
- **Canonical model** — one row per normalized address; `raw_text` retains the
  source string; Master Data ids retained where the source supplied them.
- **Usage model** — `(subject_kind, subject_id)` ∈ {ENTITY, PERSON,
  ESTABLISHMENT}, `usage_type`, `approval_status` (PROPOSED → APPROVED /
  REJECTED), `effective_from` / `effective_to`, `source_kind` /
  `source_id` / `source_detail` provenance. A subject guard rejects a usage
  whose subject does not exist.
- **Governed RPC inventory** — `address_upsert_canonical`,
  `address_usage_propose`, `address_usage_approve`, `address_usage_end`,
  `address_common_matches`, `address_360_overview`,
  `relationship_intelligence_search`, `address_projection_queue`,
  `address_project_sources`, `person_address_intelligence`; internal helpers
  `address_require`, `address_usage_visible`, `address_normalize_key`,
  `address_norm_street`, `address_norm_text`,
  `address_normalization_version`, `address_master_data_iso2`,
  `address_master_data_label`, plus the trigger routines.

## 5. Authorization matrix

| Operation | Required | Anonymous | View-only persona | Out-of-scope user |
| --- | --- | --- | --- | --- |
| Address 360 / common matches / search / queue / Person-360 addresses | `entity_structure.view` | `ADDRESS_AUTH_REQUIRED` | allowed | `ADDRESS_PERMISSION_DENIED` |
| `address_upsert_canonical`, `address_usage_propose` | `entity_structure.propose` | denied | **denied** | denied |
| `address_usage_approve` | `entity_structure.approve` | denied | **denied** | denied |
| `address_usage_end`, `address_project_sources` | `entity_structure.apply` | denied | **denied** | denied |
| direct table INSERT/UPDATE/DELETE | — | denied | denied (no grant) | denied |

Positive and negative RBAC evidence is asserted in-gate. The previously
skipped I-01..I-03 assertions are now proven with a **rollback-scoped
certification role** (`cert_b4_view_only`) granted `entity_structure.view`
only; no production role was weakened and no bypass logic was added. The
gate now fails rather than pass-counting when a persona cannot be built —
there are no environmental skips left.

## 6. Gate results

- `bun run verify:f8a-b4` — **88 PASS / 0 FAIL / 0 SKIP**, all fixtures rolled back.
- `bun run verify:f8a-b4-runtime` — **28 PASS / 0 FAIL** live contracts.

Runtime smoke classifies failures distinctly (`MISSING_FUNCTION`,
`SIGNATURE_MISMATCH`, `MISSING_RELATION`, `MISSING_COLUMN`, `SCHEMA_CACHE`,
`AUTHORIZATION`, `SHAPE_MISMATCH`, `BACKEND_ERROR`) and never treats an
authorization failure as a schema failure. An empty result counts as PASS
only when the RPC itself executed; where no canonical address existed, the
clean `ADDRESS_NOT_FOUND` path is what proves execution. Screens covered:
Address 360, common matches, Relationship Intelligence Search (incl. the
short-query guard), projection queue, Person 360 address panel, Entity 360
address panel, plus live route/nav registration.

## 7. Source projection

**Before projection** — candidates classified without projecting:

| Source | Count | Classification |
| --- | --- | --- |
| Registrations with a physical address | 3 | deterministically projectable (all bound to an entity) |
| Registrations without a usable street | 1 | invalid/unsupported source |
| Establishments with an address | 0 | none exist |
| F&P individuals with an address | 0 | none carry an address |
| F&P individuals without a canonical party link | 35 | unresolved person identity — never projected |
| `address_projection_queue()` rows | 0 | nothing unattributable and addressable |

**Projection result** (governed `address_project_sources()` only):
`{"addresses_touched": 3, "usages_touched": 3, "unresolved": 0}` — 3 attempted,
3 projected, 0 rejected, 0 errors.

**Second run (idempotence)**: identical result; live totals stayed at 3
addresses / 3 usages, so no duplicate canonical address and no duplicate
active usage was created.

**After projection**: queue 0 rows; unresolved F&P identities unchanged at
**35**. No person link was fabricated and no artificial production-like
record was inserted. Synthetic gate fixtures remain transaction-scoped and
rolled back, so they never enter the census.

## 8. Live census

Canonical addresses: total **3**, distinct normalized keys **3**, duplicate
normalized keys **0**, source-derived **3**, zero-usage **0**,
multi-subject **0**.

Usages: total **3**, proposed **3**, approved/current **0**, historical/ended
**0**, invalid effective ranges **0**, prohibited overlaps **0**, nonexistent
subjects **0**, missing provenance **0**. "Unapproved active" is 3 by design:
projection only ever *proposes*; approval is a separate governed act.

Subjects: ENTITY **3**, PERSON **0**, ESTABLISHMENT **0**, invalid **0**.

Intelligence: addresses used by more than one subject **0**; person↔person,
person↔entity and entity↔entity common-address matches **0**; no
high-degree address. Common-address results are relationship/intelligence
leads only — they are **not** evidence of wrongdoing, beneficial ownership,
control or related-party status.

Identity exceptions: **35** F&P individuals remain unresolved to a canonical
person. These are reported explicitly here and are not folded into a generic
projection-failure count.

## 9. Migration review

| Timestamp | File | Purpose | DB-required | Reproducible |
| --- | --- | --- | --- | --- |
| 20260830151912 | `20260830151912_50ee33c0-…sql` | canonical address schema, RLS, 19 routines, grants | yes | yes |
| 20260830153753 | `20260830153753_12233474-…sql` | route + navigation registration for the two B4 screens (guarded by permission `e024eb66-0279-4ed7-b20c-43849fd0f4e9`, icons `Network` / `MapPin`) — configuration only | yes | yes |
| 20260830175520 | `20260830175520_fe6e2f83-…sql` | remediation: revoke anon EXECUTE on B4 helpers; `authenticated` reduced to SELECT on both tables | yes | yes |
| 20260830175618 | `20260830175618_b8a03f91-…sql` | remediation: revoke API-role EXECUTE on address + B3 trigger routines | yes | yes |

Confirmed: no live-only DB modification (the live `address*` routine set
matches the migration-defined set exactly, 19/19); no stale permission
vocabulary; no `relationship_intelligence:view`; no uncatalogued permission;
no duplicate address primitive; no direct browser-write path.

## 10. Linter delta

| Rule | Before B4 | After B4 (pre-remediation) | Final | B4 disposition |
| --- | --- | --- | --- | --- |
| 0010 Security Definer View | 3 | 3 | 3 | PRE-EXISTING |
| 0011 Function Search Path Mutable | 12 | 12 | 12 | PRE-EXISTING (0 B4 routines — every B4 routine sets `search_path`) |
| 0014 Extension in Public | 3 | 3 | 3 | UNRELATED |
| 0028 anon can execute SECURITY DEFINER | 7 | 15 | **7** | 4 B4-INTRODUCED + 4 B3-TOUCHED, all remediated |
| 0029 signed-in can execute SECURITY DEFINER | 1,477 | 1,481 | 1,477 | B4 governed RPCs are intentionally authenticated-callable and fail closed via `address_require`; remaining count is platform-wide RELEASE-DEBT |
| **Total** | — | 1,514 | **1,502** | net effect of B4: −12 |

B4-specific SQL review: every B4 SECURITY DEFINER routine sets
`search_path = public`; anon EXECUTE revoked on all of them; no table DML
grant to `anon`/`authenticated` beyond SELECT; RLS enabled with one policy per
table (no duplicate/overlapping policies); no broad grants; ownership
unchanged.

## 11. Regression battery

| Gate | Result |
| --- | --- |
| F8A-B1 | 64/64 PASS |
| F8A-B2 | 96/96 PASS |
| F8A-B3 | 67/67 PASS |
| F8A-B4 | 88 PASS / 0 FAIL / 0 SKIP |
| F8A-B4 runtime smoke | 28 PASS / 0 FAIL |
| Frontend (vitest) | 1,317/1,317 PASS (144 files) |
| Typecheck (`tsgo`) | PASS |
| `verify:anon-execute` | PASS |
| `verify:definer-guards` | PASS |
| `verify:hardening` | PASS |
| `verify:permission-refs` | PASS |
| RBAC parity / centralized authz / edge authz | PASS |
| Breadcrumbs | 345/345, 0 uncovered |
| Navigation icons | 217 items, all approved |

## 12. Regressions found and fixed during B4

1. `GAP-F0-08` / `F0-B7`: four B4 address helper/trigger routines **and four
   B3 person-linking trigger routines** were directly executable by API
   roles. Remediated in migration `20260830175618`; both guard gates now
   pass. This is the only place B3 was touched, and it was driven by concrete
   regression evidence.
2. RBAC action-coverage floor: the address history toggle was an unguarded
   action site — now carries `data-rbac="entity_structure.view_history"`.
3. Navigation icon catalogue: `MapPin` was live but not in
   `NAV_ICON_MAP`; added to the approved catalogue.

No expected test count was relaxed to make a changed result green.

## 13. Known unresolved data and release debt

- 35 F&P individuals remain unresolved to a canonical person (intended B3
  behaviour; no deterministic evidence exists to link them).
- 3 projected address usages await supervisory approval (by design).
- Historical migration-chain drift is **still present**: baseline replay
  reports `APPLIED=747 FAILED=200`, unchanged by B4. Retained as explicit
  release debt; not remediated here because B4 neither caused nor requires it.
- Platform-wide lint 0029 volume (1,477) remains release debt.

## 14. Deferred to B5 / B6

Cross-subject relationship graph expansion, shared-contact (phone/email)
intelligence, temporal co-location scoring, and supervisory case creation from
intelligence leads are out of B4 scope and untouched.

## 15. Verdict

**F8A-B4 CERTIFIED.**
