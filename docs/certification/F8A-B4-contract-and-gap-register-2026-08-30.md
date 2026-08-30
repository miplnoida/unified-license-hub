# F8A-B4 — Contract recovery and gap register

**2026-08-30** · Baseline HEAD `197531f5a7f3f5466fbd3da46c5517ae7be6f9a7` · branch `edit/edt-8b1ef74e-4124-43a2-866a-8f2c9f878323` · working tree clean · 1292 migrations

## 0. Certified B3 baseline carried forward

| Item | Value |
| --- | --- |
| `verify:f8a-b3` | 67/67 |
| `verify:f8a-b2` | 96/96 |
| `verify:f8a-b1` | 64/64 |
| Frontend | 1317/1317 |
| Breadcrumbs | 343 mapped / 0 missing |
| Executable `entity_structure.edit` | 0 |
| Unresolved `fp_individuals` | 35 / 35 — legitimate governed queue inventory |
| Typecheck | clean |
| RBAC / catalogue integrity | pass |

The 35 unresolved persons are **queue inventory, not defects**. B4 must not link them to reduce the count.

---

## 1. Precedence analysis — which document defines B4

| Source | Says about B4 | Weight |
| --- | --- | --- |
| `docs/certification/F8A-entity-network-discovery-2026-08-30.md` §19 | "Normalized address primitive, address usages, deterministic EXACT/NORMALIZED common-address intelligence, Address 360 (thin), intelligence search" — closing gaps `GAP-F8A-06`, `GAP-F8A-11` | **AUTHORITATIVE** — the only wave-decomposition document, produced by the discovery pass that also defined B1/B2/B3 exactly as they were executed |
| Same doc §6 / §6.1 / §12 | Canonical shape for `addresses` + `address_usages`; deterministic-only match classes; fuzzy never authoritative | **AUTHORITATIVE** (detail) |
| Same doc §21 | Address 360 at `/intelligence/addresses/:addressId`, intelligence search at `/intelligence/network`, permission named `relationship_intelligence:view` | Authoritative on **routes**; **superseded on the permission name** (see §5) |
| `docs/certification/F8A-B3-…md` §7 | Defers "normalized/common-address intelligence" to B4 | Consistent |
| Roadmaps / TODO / gap registers elsewhere | No competing F8A-B4 definition exists (repo-wide search) | — |

**No material disagreement.** One resolved conflict: §21 names a permission
`relationship_intelligence:view` that does **not** exist in the catalogue and was
never created. Rule 5 of this wave forbids inventing a permission where an
existing one is semantically correct, so B4 uses the catalogued
`entity_structure` module (§5). §21's *routes* are honoured verbatim.

### Discovery evidence corrected by re-analysis

Discovery §6 recorded `registrations.physical_address` / `mailing_address` as
**free text**. They are in fact **`jsonb`**, structured as
`{street, city, state, country, postCode}` where `city`/`state`/`country` are
**Master Data item UUIDs** (`master_data_items`, types `CITY` / `STATE` /
`COUNTRY`, hierarchy via `parent_item_id`). All six sampled UUIDs resolve.

Consequence: projection into the canonical primitive is **deterministic
structured mapping**, not free-text parsing — materially stronger than the
discovery assumed. The legacy `countries` / `states` tables are *not* the
resolver (per project memory); the sampled UUIDs do not resolve there.

---

## 2. F8A-B4 CONTRACT

**A. Business objective** — Give supervisors one canonical, deduplicated address
identity, and let them see which regulated subjects share an address.

**B. Regulatory objective** — Address commonality is a supervisory red flag
(shell entities, undisclosed connections, single-premises networks). Evidence
must be deterministic, reproducible and defensible; heuristics may never be
presented as legal fact.

**C. In-scope entities** — `addresses` (new canonical primitive),
`address_usages` (new link), subjects: ENTITY (`licensees`), PERSON
(`parties.party_kind='PERSON'`), ESTABLISHMENT (`regulated_establishments`).

**D. In-scope workflows** — canonical address capture/dedupe; propose an address
usage; approve/verify a usage; deterministic common-address match; projection of
existing structured sources; unresolved-projection queue; intelligence search.

**E. Required database objects** — `addresses`, `address_usages`;
`address_normalize_key`, `address_normalization_version`; integrity triggers
(subject existence, effective-date sanity, immutability of normalized key).

**F. Required governed RPCs** — `address_upsert_canonical`,
`address_usage_propose`, `address_usage_approve`, `address_usage_end`,
`address_common_matches`, `address_360_overview`,
`address_projection_queue`, `address_project_sources`,
`relationship_intelligence_search`.

**G. Required UI** — Address 360 (thin) and Relationship-intelligence search;
Person 360 addresses section.

**H. Required routes/navigation** — `/intelligence/addresses/:addressId`
(contextual) and `/intelligence/network` (single new menu item), governed via
`sec_routes` / `sec_navigation_items`, with breadcrumbs.

**I. Required permissions** — catalogued `entity_structure` actions only:
`view` (read/search), `propose` (create/propose usage), `approve`
(approve/verify/end), `apply` (administrative projection sweep). **No new
permission.** No bypass. Fail closed.

**J. Required audit evidence** — every mutation writes `audit_logs`
(`address.*`, `address_usage.*`) with actor, subject and before/after.

**K. Notifications** — none. Address intelligence is an analyst pull surface;
inventing alerts would create unreviewed supervisory obligations. Explicitly out.

**L. Reports/exports** — none in B4. Export/printability is a B5 UX concern; the
match RPC returns evidence-grade rows that B5 renders.

**M. Person 360 integration** — Person 360 gains an addresses/co-location
section fed **only** by B4 governed RPCs. Person 360 stays a projection.

**N. Identity-resolution-queue integration** — projecting a PERSON address
requires a canonical `parties` link. Where an `fp_individual` is unresolved,
projection **must refuse to invent a party**, must record the reason, and must
surface in `address_projection_queue`. The B3 person queue is unchanged.

**O. Acceptance criteria** — canonical dedupe by `(normalized_key,
normalization_version)`; normalization deterministic across case, punctuation,
diacritics, street-type abbreviation, unit prefix and postal spacing; match
classes limited to EXACT and NORMALIZED; no fuzzy path; every RPC fails closed
for anonymous/unprivileged callers; regulator scope enforced; all mutations
audited; routes/nav/breadcrumbs governed; `verify:f8a-b4` green sections A–N;
B1/B2/B3 regressions unchanged.

**P. Exclusions** — no graph library or visualisation; no AI/fuzzy matching; no
retirement of existing free-text address columns; no address editing of
`registrations` source data; no exports; no notifications.

**Q. Dependencies** — B1 party/relationship spine, B2 regulator-scoped traversal
and query-safety limits, B3 canonical person identity + Person 360 + identity
queue.

**R. Deferred** — B5 graph/UX and exports; B6 20-entity certification; F8
Prudential perimeter-vs-legal-group comparison; F9 F&P redesign.

---

## 3. Implementation re-analysis (evidence-based)

Live database and repository scan for any address object:

- `information_schema.tables` matching `%address%` → **0**
- `pg_proc` matching `%address%` → **0**
- Repository migrations containing `CREATE TABLE public.addresses`, `address_usages` or `normalized_key` → **0 files**
- Address-bearing columns that exist: `registrations.physical_address|mailing_address` (jsonb, structured), `fp_individuals.address` (text), `regulated_establishments.address_text|address`, complaint/conduct columns, plus `ip_address` audit columns (irrelevant)

| B4 requirement | Classification |
| --- | --- |
| Canonical `addresses` primitive | **MISSING** |
| `address_usages` link | **MISSING** |
| Deterministic normalization | **MISSING** |
| Common-address intelligence | **MISSING** |
| Address 360 | **MISSING** |
| Intelligence search | **MISSING** |
| Projection from existing sources | **MISSING** |
| Unresolved-projection queue | **MISSING** |
| `relationship_intelligence` permission | **MISSING — and deliberately not created** |
| Existing free-text address columns | **LEGACY/SHADOW PATH** — retained by contract (P), never authoritative |
| `entity_facts` REGISTERED_ADDRESS concept | **LEGACY/SHADOW PATH** — 0 rows; not promoted in B4 |
| `complaint_*` address columns | **OUT OF SCOPE** — conduct-declared, not entity structure |

B4 is greenfield. Nothing is PARTIAL, DUPLICATED or PRESENT-BUT-UNGOVERNED,
because nothing exists.

---

## 4. Authorization matrix

| Capability | Read | Create | Edit | Approve/Resolve | Administrative |
| --- | --- | --- | --- | --- | --- |
| Canonical address | `entity_structure.view` | `entity_structure.propose` | — (normalized key immutable) | — | — |
| Address usage | `entity_structure.view` | `entity_structure.propose` | `entity_structure.propose` | `entity_structure.approve` | — |
| End-date a usage | `entity_structure.view` | — | — | `entity_structure.approve` | — |
| Common-address match | `entity_structure.view` | — | — | — | — |
| Address 360 | `entity_structure.view` | — | — | — | — |
| Intelligence search | `entity_structure.view` | — | — | — | — |
| Projection queue | `entity_structure.view` | — | — | — | — |
| Projection sweep | — | — | — | — | `entity_structure.apply` |

Every action maps to an **existing catalogued** permission. Justification:
`entity_structure` already governs effective-dated, approval-bearing structural
facts about regulated subjects (`propose` → `review`/`approve` → `apply`), which
is precisely the address-usage lifecycle. B3 set the precedent by governing
Person 360 with `entity_structure.view`. Super-admin remains the single
break-glass path via `is_super_admin`; there is no other bypass.

---

## 5. F8A-B4 GAP REGISTER

Severity: **C** critical · **H** high · **M** medium.

### GAP-B4-01 — No canonical address identity · **C** · B4-BLOCKING
- **Requirement** E. **Current** none; addresses embedded in `registrations` jsonb, `fp_individuals.address`, establishment columns.
- **Evidence** 0 tables/functions matching `%address%` in live `public`.
- **Business** cannot answer "who else is at this address"; each source is an independent, undeduplicated string.
- **Regulatory** common-address red flags undetectable; no reproducible evidence.
- **Security** none directly (nothing exists to leak).
- **Remediation** create `addresses` with deterministic `normalized_key` + `normalization_version`, unique on the pair.
- **Affects** new migration; `public.addresses`.
- **Test** A-section schema/contract assertions; B-section canonical-source assertions.

### GAP-B4-02 — No address↔subject link · **C** · B4-BLOCKING
- **Requirement** E. **Current** none.
- **Evidence** as above.
- **Business** an address cannot be attributed to an entity, person or establishment, nor effective-dated.
- **Regulatory** no approval/verification trail on a supervisory fact.
- **Security** unlinked data cannot be regulator-scoped.
- **Remediation** `address_usages` with `subject_kind`/`subject_id`, `usage_type`, effective dates, `approval_status`, verification and source provenance; subject-existence trigger.
- **Affects** `public.address_usages`.
- **Test** A, E (state transitions), N.

### GAP-B4-03 — No deterministic normalization · **C** · B4-BLOCKING
- **Requirement** O. **Current** none.
- **Evidence** no normalization column or function anywhere.
- **Business** trivial formatting differences hide real co-location.
- **Regulatory** non-reproducible matching is inadmissible as evidence.
- **Security** none.
- **Remediation** `address_normalize_key` — IMMUTABLE, versioned; handles case, diacritics, punctuation, street-type abbreviations, unit prefixes, postal spacing, ISO country code.
- **Affects** `address_normalize_key`, `address_normalization_version`.
- **Test** A, plus the variant test-set required by GAP-F8A-06.

### GAP-B4-04 — No common-address intelligence · **C** · B4-BLOCKING
- **Requirement** F, O. **Current** none.
- **Business/Regulatory** the wave's core supervisory capability is absent.
- **Security** an ungoverned match RPC would leak cross-regulator subjects.
- **Remediation** `address_common_matches` returning only EXACT / NORMALIZED classes, regulator-scoped, permission-gated; no fuzzy branch.
- **Affects** `address_common_matches`.
- **Test** C, G, H, I.

### GAP-B4-05 — Existing structured sources never projected · **H** · B4-BLOCKING
- **Requirement** M of discovery §6 ("existing free-text sources project into it; none are retired").
- **Current** 3 populated registration addresses (of 4 rows; 1 is `{}`), 0 populated F&P addresses, 0 establishments.
- **Business** the canonical table would ship empty and unused.
- **Regulatory** supervisors would see no address intelligence despite data existing.
- **Security** none.
- **Remediation** deterministic projection resolving Master Data UUIDs → names/ISO code; `address_project_sources` sweep under `entity_structure.apply`; sources retained, never mutated.
- **Affects** `address_project_sources`, `address_project_registration`.
- **Test** B, D, E.

### GAP-B4-06 — Unresolved person identity has no defined projection behaviour · **H** · B4-BLOCKING
- **Requirement** N. **Current** 35/35 `fp_individuals` unresolved; no rule exists.
- **Business** a projection would either silently drop the address or invent a party link.
- **Regulatory** a fabricated party link corrupts the identity spine certified in B3.
- **Security** wrong-person attribution is a serious confidentiality failure.
- **Remediation** projection refuses to create a party; records `UNRESOLVED_PERSON_IDENTITY` and surfaces via `address_projection_queue`.
- **Affects** `address_project_sources`, `address_projection_queue`.
- **Test** **K** (mandatory), plus assertion that no `parties` row is created.

### GAP-B4-07 — No intelligence search · **H** · B4-BLOCKING
- **Requirement** F, closing `GAP-F8A-11`. **Current** entity search only.
- **Business** no way to pivot from a person name, identifier or address to connected objects.
- **Regulatory** investigators cannot traverse the network they are required to assess.
- **Security** unscoped search is a mass-disclosure risk.
- **Remediation** `relationship_intelligence_search` — bounded limit, regulator-scoped, `entity_structure.view`, no sensitive identity fields.
- **Affects** `relationship_intelligence_search`.
- **Test** C, G, H, I.

### GAP-B4-08 — No Address 360 / no governed routes or navigation · **H** · B4-BLOCKING
- **Requirement** G, H. **Current** neither route exists; `/intelligence/*` namespace unused.
- **Business** RPCs with no surface deliver nothing to a supervisor.
- **Regulatory** an ungoverned route bypasses the route registry contract.
- **Security** unregistered routes are unguarded by `sec_routes`.
- **Remediation** Address 360 + intelligence search pages, lazy routes, `ROUTE_MODULE_MAP` entry, `sec_routes` rows, one `sec_navigation_items` entry with an approved icon, breadcrumbs.
- **Affects** `src/pages/intelligence/*`, `src/hooks/useAddressIntelligence.ts`, `src/routes/dashboardRoutes.tsx`, `src/lib/permissionModules.ts`, breadcrumb registry, migration.
- **Test** L.

### GAP-B4-09 — Person 360 has no address section · **M** · B4-BLOCKING (contract M)
- **Remediation** add a governed addresses/co-location card reading only B4 RPCs.
- **Affects** `src/pages/persons/Person360Detail.tsx`, `src/hooks/usePerson360.ts`.
- **Test** J.

### GAP-B4-10 — `relationship_intelligence:view` named in §21 but uncatalogued · **M** · not blocking
- **Evidence** absent from `src/lib/rbac/catalog.json` and `sec_permissions`.
- **Remediation** do **not** create it; govern B4 with `entity_structure`. Record the supersession (this document, §1/§4).
- **Test** catalogue-integrity suite must stay green with zero new pairs.

### GAP-B4-11 — Discovery mis-states registration addresses as free text · **M** · not blocking
- **Remediation** correct the record (§1) and exploit the structured shape.
- **Test** B (projection resolves Master Data UUIDs deterministically).

**Initial gap count: 11 — Critical 4, High 4, Medium 3. B4-blocking: 9.**

---

## 6. Out of scope — not started

F8A-B5, F8A-B6, F8 Prudential remediation, F9 Fit & Proper redesign.
