# F8A — Entity Network / Relationship Graph / UBO / Director / Common-Address Intelligence
## READ-ONLY DISCOVERY REPORT

- Discovery date: 2026-08-30 (UTC)
- Repository HEAD at discovery: `38a742b1188db1837f0a0ca39399117ea60e5f05`
- F7 protected frozen production/code baseline: `fecb806f992136341ce67a8205a3c0116761235d`
- F7 status: **F7 REGULATORY RETURNS CERTIFIED AND FROZEN**
- Wave position: F7 frozen → **F8A (this wave)** → F8 Prudential → F9 Fit & Proper
- Mode: **DISCOVERY ONLY**. No migration, schema change, seed, DML, package install, RPC/RLS/route/navigation change, UI or AI development was performed. The only file written by this pass is this document.

Evidence sources: live PostgreSQL catalogue introspection (`information_schema`, `pg_catalog`, `pg_policies`, `pg_indexes`, `pg_proc`), live row census over the operational database, and static inspection of `src/**`, `scripts/**`, `docs/**`, `package.json`.

---

## 1. Scope and boundary

F8A must eventually deliver a temporal, deterministic relationship-intelligence layer answering:

1. Entity → ownership (direct, indirect, effective economic, voting/control, UBO, ownership paths).
2. Person → entities (ownership, beneficial ownership, directorships, key-function roles, F&P contexts, historical connections).
3. Entity → directors / key persons.
4. Group relationships (parent, subsidiary, affiliate, holding, sister, branch/establishment, group member, controlled entity, related party).
5. Common-address intelligence (**intelligence link only**, never an implied ownership/control/wrongdoing finding).
6. Visual network intelligence with an equivalent tabular/register view.

Out of scope for F8A: prudential consolidation policy (F8), fit-and-proper suitability determination (F9), AML case handling, enforcement action.

---

## 2. Current architecture — identity model (proved, not assumed)

### 2.1 Canonical party spine

| Object | Rows | Shape | Role |
|---|---|---|---|
| `parties` | **92** | `id uuid PK, party_kind text, display_name text, created_at, updated_at` | **Canonical party identity** for both natural persons and organizations. Distribution: `PERSON = 38`, `ORGANIZATION = 54`. |
| `persons` | **38** | `party_party_id`→ actually `party_id uuid PK, full_name, given_name, family_name` | Natural-person projection of `parties` (1:1, PK = `party_id`). **Canonical natural-person identity = `parties.id` where `party_kind='PERSON'`, detailed by `persons.party_id`.** |
| `licensees` | **54** | 22 cols incl. `id`, `party_id`, `merged_into_entity_id`, `structure_version`, `identity_status_id`, `lifecycle_stage_id`, `public_slug` | **Canonical regulated legal-entity identity = `licensees.id`** (the "entity_id" used by every canonical structural table). All 54 rows carry `party_id`, i.e. every regulated entity is also a party. |
| `organization_names` | **0** | `party_id, name_type, name, normalized_name, effective_from/to, is_current, source_*` | Effective-dated legal/trading name store keyed on party. Structure exists, **no data**. |
| `entity_identifiers` | **75** | `entity_id, identifier_type_id, identifier_value, normalized_value, uniqueness_scope, jurisdiction_id, regulator_id, issuer_key, verification_status, is_primary, effective_from/to` | Canonical external identifier store with scoped unique indexes (GLOBAL / JURISDICTION / REGULATOR / ISSUER). |
| `entity_facts` | **0** | concept-typed EAV with `valid_from/valid_to`, `approval_status`, `verified_by/at`, `source_*` | Canonical effective-dated attribute store (incl. `ENTITY.REGISTERED_ADDRESS` concept). **No data.** |
| `entity_user_memberships` | 26 | portal access | Portal access, **not** a legal relationship. Must never become a graph edge. |
| `fp_individuals` | **35** | `full_name, date_of_birth, nationality, national_id, passport_number, email, phone, address, user_id, regulator_id, status` | Fit & Proper person record — a **second person representation**. |
| `fp_individual_party_links` | **0** | `fp_individual_id, person_party_id, match_method, match_confidence, linked_by, linked_at` | The intended F&P↔party bridge. **Empty**, although `public.fp_link_persons_deterministic()` exists. |

**Architecture answers (section 40 D/E/F/G):**

- **D. Authoritative natural-person identity** = `parties.id` (`party_kind='PERSON'`) with `persons` detail. `fp_individuals` is a **parallel person representation** that is currently *unlinked* (bridge table empty).
- **E. Authoritative legal-entity identity** = `licensees.id`, with `licensees.party_id` giving the party-graph handle.
- **F. Non-regulated legal entities** *can* exist today as `parties` rows with `party_kind='ORGANIZATION'` and no `licensees` row (54 organizations vs 54 licensees — currently 1:1, so **no non-regulated organization party exists in live data**). The model permits it; nothing writes it.
- **G. Trusts / foundations / partnerships**: `parties.party_kind` is free `text` with only `PERSON`/`ORGANIZATION` observed and no catalogue table governing the domain. Trust/foundation/partnership are **not first-class party kinds today**. Trust-flavoured semantics exist only as `ownership_types.TRUST_INTEREST` and `relationship_types` categories — insufficient to model settlor/trustee/beneficiary.

### 2.2 Structural governance / write path

- Governed structural mutation RPCs present: `entity_change_set_create`, `entity_change_set_transition`, `apply_entity_change_set`, `regulatory_request_start`, `regulatory_request_transition`, `regulatory_request_available_types`, `post_license_change_items`.
- `entity_change_sets` = **0 rows**, `entity_change_items` = **0 rows** → the maker-checker structural pipeline is **BUILT, NOT PROVEN**.
- No table-level `SELECT/INSERT/UPDATE/DELETE` grant to `anon` or `authenticated` exists on any canonical structural table (`ownership_interests`, `party_relationships`, `entity_appointments`, `persons`, `organization_names`, `entity_facts`, `entity_identifiers`, `fp_individual*`, `financial_group*`, `entity_relationships`, `regulated_establishments`). Access is RPC-mediated only. RLS is enabled on all of them.

---

## 3. Canonical structural targets — current truth

### 3.1 `ownership_interests` (F5 canonical ownership target)

- Rows: **0**. RLS: enabled, 1 policy. Browser grants: none. Governed mutation RPC: **none dedicated** (only the generic change-set applier).
- Columns (28): `id`, `owner_party_id`, `owned_entity_id`, `ownership_type_id`, `share_class_id`, `shares_held`, `total_shares`, `economic_interest_percentage`, `voting_rights_percentage`, `beneficial_interest_percentage`, `is_direct`, `is_controller`, `is_ubo`, `control_determination`, `effective_from`, `effective_to`, `approval_status`, `approved_by`, `approved_at`, `verified_by`, `verified_at`, `source_submission_id`, `source_form_version_id`, `source_change_set_id`, `recorded_at`, `superseded_at`, `created_at`, `updated_at`.
- Direction: `owner_party_id` (party) **owns** `owned_entity_id` (licensee). Person→entity **and** entity→entity are both expressible because the owner side is a party.
- Indexes: `(owned_entity_id, effective_to)`, `(owner_party_id)`, PK.
- Consumers: `entity360_section('ownership')` (joins `parties`), `useEntityOwnership` in `src/hooks/useWaveB.ts` (direct table read), Entity Structure Hub (`src/pages/entities/EntityStructureHub.tsx`).

| Capability | Supported today? |
|---|---|
| person → entity ownership | YES (party owner) |
| entity → entity ownership | YES (party owner) |
| economic % / voting % / beneficial % | YES (three separate columns — **must not be collapsed**) |
| ownership class/type | YES (`ownership_type_id` → `ownership_types`, 5 rows: DIRECT_SHAREHOLDING, INDIRECT_SHAREHOLDING, BENEFICIAL_INTEREST, VOTING_CONTROL, TRUST_INTEREST) |
| share class | Column present; `share_classes` catalogue not populated |
| beneficial-owner flag / controller flag | YES (`is_ubo`, `is_controller`, `control_determination` free text) |
| controller without ownership | Partially — a row with `is_controller=true` and null percentages is expressible, but no controller-test taxonomy exists |
| nominee / trustee ownership | NO first-class modelling (only `TRUST_INTEREST` type) |
| indirect ownership | Storable as a declared row (`is_direct=false`) but **not computed anywhere**; no derived/effective store |
| effective dating / history | YES (`effective_from/to`, `superseded_at`, `recorded_at`) |
| source filing / approval / verification | YES (`source_submission_id`, `source_form_version_id`, `source_change_set_id`, `approval_status`, `approved_*`, `verified_*`) |

**Verdict:** schema is *canonically sufficient* for direct ownership edges; **PARTIAL** for control tests, nominee/trustee, and computed indirect ownership. **Zero live rows** — nothing writes it.

**Answer 40.A:** Yes — `ownership_interests` is the authoritative ownership edge store. No competing ownership store may be created; the competing representations in §3.4 and §4 must be bridged or retired.

### 3.2 `entity_appointments` (canonical organization-role store)

- Rows: **38**. RLS enabled, 1 policy, no browser grants.
- Columns (18): `id`, `entity_id`, `person_party_id`, `role_type_id`, `appointment_date`, `effective_from`, `effective_to`, `is_executive`, `status`, `regulatory_approval_status`, `fp_individual_id`, `source_submission_id`, `source_form_version_id`, `source_change_set_id`, `recorded_at`, `superseded_at`, `created_at`, `updated_at`.
- Indexes: `(entity_id, effective_to)`, `(person_party_id)`, PK.
- `role_types` catalogue supports: `director`, `independent_director`, `chairperson`, `chief_executive_officer`, `chief_financial_officer`, `chief_risk_officer`, `company_secretary`, `compliance_officer`, `money_laundering_reporting_officer`, `internal_auditor`, `authorised_contact`. **No** external-auditor, trustee, partner or generic "key function holder" role type.
- Live role usage: `chief_executive_officer = 19`, `compliance_officer = 19`. Directors: **0 live director appointments**.
- Person linkage: 38/38 resolve to a `persons` row (0 orphans). **F&P linkage: 38/38 have `fp_individual_id IS NULL`.**
- Cross-entity reach: **0** persons hold appointments at more than one entity → a "common director" network cannot be demonstrated on live data today.
- Governed write path: `person_upsert_for_appointment(_full_name, _fp_individual_id)` exists (person minting for appointments); no dedicated appointment mutation RPC beyond the change-set pipeline.

**Answer 40.B:** Yes — `entity_appointments` is the authoritative organization-role store. `fp_individual_roles` is a competing role store (§4).

### 3.3 `party_relationships` (canonical non-ownership relationship store)

- Rows: **0**. RLS enabled, 1 policy, no browser grants.
- Columns (16): `id`, `source_party_id`, `target_party_id`, `relationship_type_id`, `entity_id`, `effective_from`, `effective_to`, `status`, `notes`, `source_submission_id`, `source_form_version_id`, `source_change_set_id`, `recorded_at`, `superseded_at`, `created_at`, `updated_at`.
- Indexes: PK, `(source_party_id)`, `(entity_id)`. **No index on `target_party_id`** — reverse traversal is unindexed.
- `relationship_types` (10 rows, seeded) with an explicit inverse model (`inverse_key` + `inverse_relationship_type_id`):

| key | category | is_ownership | is_group | inverse |
|---|---|---|---|---|
| `parent_of` | group | f | t | `subsidiary_of` |
| `subsidiary_of` | group | f | t | `parent_of` |
| `affiliate_of` | group | f | t | self-inverse |
| `shareholder_of` | ownership | t | f | `shares_held_by` |
| `shares_held_by` | ownership | t | f | `shareholder_of` |
| `controller_of` | control | t | f | none |
| `ultimate_beneficial_owner_of` | control | t | f | none |
| `branch_of` | structure | f | t | none |
| `service_provider_to` | commercial | f | f | none |
| `external_auditor_of` | commercial | f | f | none |

**Direction semantics (§9, unambiguous):** the row reads *source → type → target*, i.e. `source_party_id parent_of target_party_id` means the **source is the parent**. Seed descriptions explicitly state the ownership/control-flavoured types are **typed relationships only, NOT an ownership ledger** — percentages remain authoritative in `ownership_interests`. With 0 rows, duplicate-inverse rows, contradictions and undated relationships cannot yet occur, but nothing prevents them: there is **no uniqueness constraint, no inverse-consistency trigger and no cycle guard**.

**Answer 40.C:** Yes — `party_relationships` is the authoritative non-ownership relationship store, subject to inverse/duplicate governance being added in F8A-B1.

### 3.4 `entity_relationships` — LEGACY DUPLICATE (critical finding)

- Rows: **0**. Columns: `id, entity_id, related_entity_id, related_entity_name (free text), relationship_type (free text), ownership_percentage, effective_date, status, notes`.
- **No party FK on the counterparty**, free-text relationship type, single `effective_date` (no `effective_to`), no provenance, no approval, no superseding.
- Live consumers:
  - `entity360_section('relationships')` reads **`entity_relationships`**, not `party_relationships` — so the certified Entity 360 "Group relationships" section is wired to the legacy store.
  - `src/components/entity-detail/OwnershipTab.tsx` reads `entity_relationships` and renders an ownership tree from `ownership_percentage` — a **second, unsanctioned ownership representation** in the UI.
  - `src/components/entity-detail/RelationshipsTab.tsx` performs client-side create/edit/delete against `entity_relationships` with a hard-coded type list (`Parent, Subsidiary, Associate, Affiliate, Joint Venture, Branch, Other`) that does not match `relationship_types`. Those writes are currently **blocked by absent browser grants**, i.e. the surface is dead/misleading rather than a privilege hole.

This is the single largest structural conflict in F8A scope.

### 3.5 `regulated_establishments`

- Rows: **0**. Columns include `entity_id`, `license_id`, `establishment_type`, `establishment_reference` (unique), `name`, `status`, `address_text`, `address jsonb`, `opened_on`, `closed_on`, `source_application_id`, `source_effect_id`, `closure_application_id`, `closure_effect_id`.
- Governed by F5 write guard (`regulated_establishment_write_guard`) and `set_application_establishment_target` / `post_license_establishment_input` / `next_establishment_reference`. Frozen F5 contract — F8A consumes, never mutates.

---

## 4. Person / individual relationship model and duplication risk

Two person representations exist:

| Store | Rows | Keyed by | Address? | Linked to party? |
|---|---|---|---|---|
| `parties` + `persons` | 38 | `parties.id` | no | canonical |
| `fp_individuals` | 35 | own `id` | free-text `address` (0 populated) | via `fp_individual_party_links` — **0 rows** |

- `fp_individual_roles` (**9 rows**: `director = 5`, `ceo = 4`) carries `individual_id`, `licensee_id`, `license_id`, `role_type text` (free text, **not** `role_types`), `effective_from/to`, `is_current`, and — critically — **`ownership_pct numeric`**. It is therefore simultaneously a *third* role store and a *second* ownership store.
- Duplicate-identity exposure: 0 duplicate names in `persons`; **1 duplicate full-name group in `fp_individuals`**. Matching signals available: `national_id`, `passport_number`, `email`, `phone`, `date_of_birth` — all nullable and unconstrained; no unique index on any of them. Deterministic linkage helper `fp_link_persons_deterministic()` exists but has produced no links.
- Consequence: the same natural person **cannot currently be recognised across ownership, appointments and F&P** — the primary person-network requirement is unmet at the data layer despite the schema being present.
- Appointment ↔ F&P separation is respected conceptually (`entity_appointments.fp_individual_id` is the correct bridge column) but is null on 100% of rows. These must remain distinct concepts: appointment = legal/organizational role; F&P = suitability assessment of a person in a role context.

---

## 5. Financial groups vs the legal ownership graph

- `financial_groups` (**1 row**): `group_code`, `name`, `holding_entity_id`, `sector_id`, `supervisory_lead_id`, `status`, `created_by`. Access governed by `can_read_financial_group(user, group_id)` / `can_manage_financial_group(user)`.
- `financial_group_members` (**2 rows**): `group_id`, `licensee_id`, `parent_member_id` (self-referencing tree), `member_role`, `ownership_percentage`, `consolidation_treatment`, `effective_date`, `end_date`. Members are **licensees only** — a non-regulated holding company cannot be a member.
- UI: `src/components/prudential/GroupStructureTree.tsx` + `src/lib/groupConsolidation.ts` + `src/pages/prudential/FinancialGroupProfile.tsx`.

**Determination:** `financial_groups` is a **manually curated supervisory / prudential consolidation perimeter** (it carries `consolidation_treatment` and a supervisory lead), *not* a derived legal corporate group. It legitimately may differ from the ownership graph (e.g. exclusion of an insurance subsidiary from banking consolidation).

**F8A must not merge the two.** Target architecture: F8A owns the **legal/ownership graph** derived from `ownership_interests` + `party_relationships`; F8 keeps the **supervisory consolidation perimeter**. F8A supplies a *comparison* capability (perimeter vs legal group difference report), not a replacement. `financial_group_members.ownership_percentage` is a third ownership percentage copy and should become display-only, sourced from the legal graph where a matching edge exists.

---

## 6. Address model — HIGH PRIORITY

Every address-bearing column in `public` (catalogue-wide scan):

| Location | Column(s) | Shape | Effective-dated | Authoritative | Live data |
|---|---|---|---|---|---|
| `registrations` | `physical_address`, `mailing_address` | free text | no | submitted-only | onboarding data |
| `fp_individuals` | `address` | free text | no | submitted-only | **0 populated** |
| `regulated_establishments` | `address_text`, `address jsonb` | free text + unstructured JSON | via `opened_on/closed_on` | F5-governed | 0 rows |
| `complaint_contact_preferences` | `postal_address_line1/2`, `city`, `postal_code`, `country` | structured | no | complainant-declared | conduct scope |
| `complaint_respondents` | `address`, `country` | free text | no | declared | conduct scope |
| `entity_facts` | `ENTITY.REGISTERED_ADDRESS` concept | single `value_text` | **yes** (`valid_from/valid_to`, `approval_status`, `verified_*`) | canonical-capable | **0 rows** |
| `states` | `country_id` | reference | — | master data | reference only |

**Answer 40.H:** There is **no canonical address identity** today — no `addresses` table, no address party/node, no normalization column, no country/postal/locality decomposition on any entity-facing address, and the one effective-dated canonical path (`entity_facts` registered-address concept) is a single free-text value with zero rows.

**Answer 40.I:** Yes — a normalized address primitive is required. Minimum viable canonical shape for F8A-B4: `addresses(id, country_id, admin_area, locality, postal_code, street_line1, street_line2, unit, raw_text, normalized_key, normalization_version, created_at)` plus a link table `address_usages(address_id, subject_kind {ENTITY|PERSON|ESTABLISHMENT}, subject_id, usage_type {REGISTERED|PRINCIPAL|CORRESPONDENCE|OPERATING}, effective_from, effective_to, source_*, approval_status, verified_*)`. Existing free-text sources project into it; none are retired.

### 6.1 Common-address intelligence readiness (§12)

Current data **cannot** support reliable common-address detection: free text, no normalization, no postal/country decomposition, and effectively no populated entity addresses. Normalization risks to design for: case, punctuation, diacritics, street-type abbreviations (St/Street, Ave/Avenue), unit/apartment/suite prefixes, postal-code spacing/format, locality variants, country naming vs ISO code, PO Box forms, transliteration and spelling variance.

Required future classification, deterministic only:
- **EXACT / NORMALIZED MATCH** — identical `normalized_key` under a recorded `normalization_version`. Deterministic, reproducible, exportable as evidence.
- **POTENTIAL MATCH** — heuristic (token overlap, postal-code + street-number agreement). **Intelligence lead only**, never presented as a legal or ownership relationship.
- Fuzzy/AI matching is **never** authoritative.

---

## 7. Other shared-attribute intelligence (§13)

| Signal | Available today | Classification |
|---|---|---|
| same phone | `fp_individuals.phone` only | INTELLIGENCE LINK (weak; unpopulated) |
| same email / email domain | `fp_individuals.email`, portal users | INTELLIGENCE LINK |
| same registered agent | not modelled | MISSING |
| same authorized representative | `role_types.authorised_contact` via appointments | INTELLIGENCE LINK (0 live rows) |
| same auditor | `relationship_types.external_auditor_of` (0 rows) | INTELLIGENCE LINK |
| same company secretary | `role_types.company_secretary` (0 live rows) | INTELLIGENCE LINK |
| same beneficial owner | `ownership_interests.is_ubo` (0 rows) | LEGAL (once populated) |
| same director | `entity_appointments` (0 cross-entity) | LEGAL |
| same controller | `is_controller` / `controller_of` | LEGAL |

Rule to carry into F8A-B: a shared attribute never creates a legal edge. Shared-attribute edges are typed `SHARES_*` and rendered visually distinct from authoritative edges.

---

## 8. Entity 360 current surfaces

Entity 360 (`src/pages/entities/Entity360Detail.tsx`, `src/hooks/useEntity360.ts`, `src/components/entity-detail/*`) is the canonical supervisory profile: RPCs `entity360_overview`, `entity360_section`, `entity360_timeline`, `entity360_as_of`, all `SECURITY DEFINER`, internal-staff gated via `is_internal_staff()` and per-section gated via `e360_section_allowed()`.

Sections relevant to F8A, grouped under **"Ownership & control"** in `sectionCatalogue.tsx`:

| Section | Backing source (proved) | Usability | Missing for F8A |
|---|---|---|---|
| `ownership` | `ownership_interests` ⨝ `parties` | correct canonical wiring; 0 rows | indirect/effective %, UBO paths, graph |
| `governance` | `entity_appointments` ⨝ `parties` ⨝ `role_types` | correct; 38 rows | F&P linkage column is null; no person cross-entity view |
| `relationships` | **`entity_relationships` (legacy)** | **mis-wired** | must move to `party_relationships` |
| `fit_and_proper` | F&P stores | present | no person-network entry point |
| `business_profile` | `entity_facts` | present; 0 rows | address/registered-address unusable |
| timeline / as-of | `entity360_timeline`, `entity360_as_of` | present | relationship domains not represented |

Permission gate for `ownership|relationships|governance` = `entity_structure:view` OR `licensee_management:view` (super admin bypass).

A second, older surface exists — `src/components/entity-detail/OwnershipTab.tsx` and `RelationshipsTab.tsx` on the admin licensee detail view — reading/writing legacy `entity_relationships`. **F8A must integrate into Entity 360 and must not build a third entity profile.**

`EntityStructureHub` (`/entities/:entityId`, RDM Wave B) already reads `ownership_interests`, `entity_appointments` and `party_relationships` directly from the browser via `useWaveB.ts` — correct canonical sources, but table-direct rather than through a governed relationship API.

---

## 9. Person 360 / Address 360 / global search readiness

- **Person 360: does not exist.** No route, page, hook or RPC keyed on a person/party. Required (TRACK A) to answer person→entities, ownership, appointments, F&P history and network. Proposed canonical route `/persons/:partyId` (contextual entry from Entity 360 governance/ownership rows, F&P records and network search), permission `entity_structure:view` for the structural view and `fit_and_proper:view` gating F&P content, breadcrumb `Entities → Person → {name}`.
- **Address 360: TRACK A (thin), after normalization.** Value is real (address → entities, persons, establishments, with *reason* and *source* for every link), but it depends entirely on the normalized address primitive. Proposed `/intelligence/addresses/:addressId`, contextual-only until data exists.
- **Global search:** existing functions are `entity_registry_search`, `search_licensees`, `public_entity_register_search`, `search_notifications`, `rule_inventory_search` — **entity-only**. No person search, no identifier-agnostic search, no address search. F8A needs one dedicated intelligence search RPC (entity | person | identifier | address) rather than extending five separate ones.

---

## 10. Live data census (read-only, 2026-08-30)

| Store | Rows |
|---|---|
| `licensees` (regulated entities) | 54 |
| `parties` | 92 (PERSON 38 / ORGANIZATION 54) |
| `persons` | 38 |
| `ownership_interests` | **0** |
| `entity_appointments` | 38 |
| `party_relationships` | **0** |
| `entity_relationships` (legacy) | 0 |
| `fp_individuals` | 35 |
| `fp_individual_roles` | 9 |
| `fp_individual_party_links` | **0** |
| `financial_groups` | 1 |
| `financial_group_members` | 2 |
| `entity_facts` | **0** |
| `entity_identifiers` | 75 |
| `organization_names` | **0** |
| `regulated_establishments` | **0** |
| `entity_user_memberships` | 26 |
| `entity_change_sets` / `entity_change_items` | 0 / 0 |
| `post_license_fp_subject_links` | 0 |
| `relationship_types` / `ownership_types` / `role_types` | 10 / 5 / 11 |
| `regulators` | 3 |

### Data-quality measures

| Measure | Result |
|---|---|
| ownership rows missing source/target | n/a — 0 ownership rows |
| ownership rows without percentage | n/a |
| active ownership without effective date | n/a |
| appointments without person linkage | **0 / 38** (clean) |
| appointments without F&P linkage | **38 / 38** |
| appointment role coverage | only CEO (19) and compliance officer (19); **0 directors** |
| duplicate person identities (`persons`, name) | 0 |
| duplicate F&P identities (`fp_individuals`, name) | **1 group** |
| relationships with unknown type | n/a — 0 rows |
| circular ownership already present | none (no ownership data) |
| addresses usable for normalized matching | **0** |
| entities with no ownership data | **54 / 54** |
| entities with no appointments | **35 / 54** |
| persons connected to >1 entity | **0** |

**Conclusion:** the canonical relationship schema is largely present and correctly shaped, but the relationship *estate is empty*. F8A cannot be certified on live data alone; a synthetic certification dataset (§15) is mandatory.

---

## 11. UBO readiness and proposed deterministic architecture

### 11.1 Readiness

Deterministic UBO computation is **not possible today**: zero ownership edges, no non-regulated organization parties, no trust/nominee modelling, no threshold configuration, no traversal function. The *schema* supports the required inputs (owner party, three percentage dimensions, direct flag, effective dating, approval/provenance), so the gap is data + engine + configuration, not a fundamental identity redesign.

### 11.2 Proposed engine (DESIGN ONLY — not implemented)

Following repository RPC conventions (`entity360_*`, `_entity_id`, `_as_of`, SECURITY DEFINER, internal-staff gate, per-section permission gate):

```
public.entity_ownership_network(_entity_id uuid, _as_of timestamptz, _max_depth int, _direction text, _options jsonb) -> jsonb
public.entity_ubo_resolve(_entity_id uuid, _as_of timestamptz, _regulator_id uuid, _options jsonb) -> jsonb
public.person_relationship_network(_party_id uuid, _as_of timestamptz, _max_depth int) -> jsonb
public.address_network(_address_id uuid, _as_of timestamptz) -> jsonb
```

Algorithm requirements:

1. **Recursive traversal** — `WITH RECURSIVE` over `ownership_interests` filtered by `_as_of` (`effective_from <= as_of AND (effective_to IS NULL OR effective_to > as_of) AND (superseded_at IS NULL OR superseded_at > as_of)`), owner-party → owned-entity, hopping via `licensees.party_id` to continue up a chain.
2. **Path accumulation** — carry an ordered `path[]` of party ids and a running product of economic and voting fractions **separately**; never collapse economic and voting into one number.
3. **Multi-path aggregation** — effective ownership = **sum over distinct paths** of the per-path product. Duplicate counting is prevented by keying each contribution on the full ordered path, and by rejecting a path that revisits a party already in `path[]`.
4. **Cycle detection** — a candidate edge whose target already appears in `path[]` terminates that branch and sets `cycle_detected = true` with the offending path emitted; traversal never loops.
5. **Depth protection** — default `_max_depth = 10`, hard cap 25. When a branch stops at the cap, output must set `truncated = true` and list the frontier nodes. Silent truncation is forbidden.
6. **Termination at natural persons** — a path is `COMPLETE` only when it terminates at `parties.party_kind='PERSON'`. Termination at an organization with no upstream ownership, an unidentified/foreign entity, a trust, or a nominee yields `UBO INCOMPLETE / UNVERIFIED` with an explicit `termination_reason` (`NO_UPSTREAM_DATA`, `FOREIGN_UNIDENTIFIED`, `TRUST_STRUCTURE`, `NOMINEE`, `DEPTH_LIMIT`, `CYCLE`). The engine must never synthesise a person.
7. **Control tests** — beneficial-ownership status is the union of: effective economic ≥ ownership threshold, effective voting ≥ voting threshold, or an explicit control determination (`is_controller`, `controller_of`, `ultimate_beneficial_owner_of`). Each qualifying reason is reported individually.
8. **Provenance** — every edge on every returned path carries `approval_status`, `source_submission_id`/`source_change_set_id`, `verified_at`, so output can be classified AUTHORITATIVE / DECLARED / INTELLIGENCE.
9. **Determinism** — stable ordering (effective % desc, then party id), no randomness, no AI. Identical inputs must yield byte-identical output — this is the basis of the F8A certification gate.

### 11.3 Threshold configuration (§6, no hard-coded 25%)

Reuse the existing configuration governance primitives (`config_governed_tables`, `config_change_log`, effective-dated + approval-versioned pattern already used by `entity_currency_profiles` and `prudential_thresholds`). Proposed `ubo_threshold_profiles(regulator_id, jurisdiction_id, entity_type/classification, ownership_threshold_pct, voting_threshold_pct, control_test_enabled, effective_from, effective_to, approval_status, approved_by/at)` with resolution precedence entity-type → regulator → jurisdiction → platform default. **All threshold values are BCR, never code constants.**

### 11.4 Worked scenarios (design targets)

| # | Structure | Expected engine output |
|---|---|---|
| 1 | P owns 60% of E | P effective 60%, direct, COMPLETE, UBO if ≥ threshold |
| 2 | P →80% H →60% E | P effective 48% economic via 1 path; H shown as intermediate node |
| 3 | P →50% H1 →80% H2 →75% E | P effective 30%; depth 3; COMPLETE |
| 4 | P →40% H1 →50% E and P →30% H2 →40% E | 20% + 12% = **32% aggregated**, two paths listed, no double counting |
| 5 | P owns 10% but holds `controller_of` / appointment rights | Not a threshold UBO; flagged **CONTROL** with reason `CONTROL_DETERMINATION`; reported as beneficial owner on the control test |
| 6 | A →B →C →A cross-holding | cycle_detected=true, offending path emitted, finite result, no infinite loop |
| 7 | Chain ends at unidentified foreign company | status `UBO INCOMPLETE / UNVERIFIED`, `termination_reason=FOREIGN_UNIDENTIFIED`, partial paths still shown |
| 8 | Trust/foundation | **Unsupported today** — returns `TRUST_STRUCTURE` incomplete until trust party kinds and settlor/trustee/beneficiary edges exist (Track-A dependency) |
| 9 | Ownership transferred mid-year | `_as_of = 2024-12-31` returns the then-current holder; `_as_of = now()` returns the new holder; both reproducible |
| 10 | Two regulators, different thresholds | Same underlying percentages; `_regulator_id` selects the threshold profile, so UBO flags differ while the graph is identical |

---

## 12. Graph node and edge taxonomy

### Nodes (only where a source of truth exists)

| Node | Source of truth | Available today |
|---|---|---|
| `REGULATED_ENTITY` | `licensees` | YES (54) |
| `NON_REGULATED_ENTITY` | `parties` kind ORGANIZATION without licensee | schema yes, data no |
| `PERSON` | `parties` kind PERSON + `persons` | YES (38) |
| `TRUST` / `FOUNDATION` / `PARTNERSHIP` | none | **NO — Track A** |
| `BRANCH / ESTABLISHMENT` | `regulated_establishments` | schema yes (F5), 0 rows |
| `ADDRESS` | none | **NO — Track A** |
| `PRUDENTIAL_GROUP` | `financial_groups` | YES (1) |

### Edges

| Edge | Source | Direction | Effective dated | Class |
|---|---|---|---|---|
| `SHAREHOLDER_OF` | `ownership_interests` | owner_party → owned_entity | yes | LEGAL (approval_status) |
| `BENEFICIAL_OWNER_OF` | `ownership_interests.is_ubo` / derived | owner_party → entity | yes | LEGAL declared / DERIVED |
| `CONTROLS` | `ownership_interests.is_controller`, `controller_of` | party → entity | yes | LEGAL |
| `PARENT_OF` / `SUBSIDIARY_OF` / `AFFILIATE_OF` | `party_relationships` | source → target | yes | LEGAL |
| `DIRECTOR_OF`, `CHAIR_OF`, `CEO_OF`, `CFO_OF`, `KEY_FUNCTION_HOLDER_OF` | `entity_appointments` + `role_types` | person → entity | yes | LEGAL |
| `AUTHORIZED_REP_OF` | `role_types.authorised_contact` | person → entity | yes | LEGAL |
| `EXTERNAL_AUDITOR_OF`, `SERVICE_PROVIDER_TO` | `party_relationships` | source → target | yes | LEGAL |
| `TRUSTEE_OF`, `SETTLOR_OF`, `BENEFICIARY_OF`, `PARTNER_OF` | none | — | — | **MISSING — Track A** |
| `GROUP_MEMBER_OF` | `financial_group_members` | member → group | `effective_date/end_date` | SUPERVISORY (F8-owned) |
| `RELATED_PARTY_OF` | `party_relationships` | source → target | yes | LEGAL |
| `REGISTERED_AT` / `OPERATES_AT` | future `address_usages` | subject → address | yes | LEGAL (declared) |
| `SHARES_ADDRESS_WITH` | derived normalized match | undirected | as-of via usage dates | **INTELLIGENCE / INFERRED** |

**Answer 40.J:** Edges are **computed dynamically from canonical source tables** via SECURITY DEFINER RPCs. No graph edge table is created. At 54 entities / 92 parties this is trivially performant; materialization is deferred until a proven measurement demands it, and only ever as a derived cache with its own recompute provenance.

**Answer 40.K (temporal):** all four canonical sources are effective-dated (`ownership_interests`, `entity_appointments`, `party_relationships` all have `effective_from/effective_to/superseded_at`; establishments use `opened_on/closed_on`; `entity_facts` uses `valid_from/valid_to`). The `_as_of` filter used by `entity360_section` is directly reusable, so "what did the network look like on 31 December 2024?" is answerable **once data exists**. The two temporal gaps are: `fp_individual_roles` (date-only, plus an `is_current` flag that can contradict the dates) and **addresses (no dating at all)**.

**Answer 40.L (Person 360):** new contextual route reading a new `person_relationship_network` RPC plus existing appointment/ownership/F&P sources — no new person store.

**Answer 40.M (F8 consumption):** F8 Prudential consumes F8A read-only via `entity_ownership_network` / `entity_ubo_resolve` for ultimate parent, regulated group members, related entities, and a perimeter-vs-legal-group difference report. F8 keeps `financial_groups` as the supervisory perimeter of record.

---

## 13. Security, confidentiality and graph query safety

Existing architecture to reuse (no new sprawl of permission keys):

- Gate every relationship RPC with `is_internal_staff()` + `has_permission()`, exactly as `e360_section_allowed()` does.
- Reuse `entity_structure:view` for entity relationship/ownership/governance reads; `fit_and_proper:view` / `fit_and_proper:view_confidential` for F&P-derived person content; `entity_structure:export` (existing `export` action) for network export.
- Only **two** new permissions are justified: `relationship_intelligence:view` (cross-entity/global network, person and address intelligence — deliberately broader than single-entity structure) and `relationship_intelligence:export`.
- **External/entity-portal users:** no intelligence network. At most, a portal user may see *their own entity's declared structure* (already available through governed structural surfaces). Cross-entity traversal, person networks and address intelligence are internal-only. This preserves the external-user RLS invariant.

Graph query security (§27) to design into the RPC contract:
- server-enforced `max_depth` (default 10, hard cap 25) and `max_nodes` (default 300, hard cap 1000), with explicit `truncated` output;
- regulator scope applied to the seed node and to every expansion using the established entity→regulator-body resolution from F7-B;
- sensitive-person attributes (DOB, national ID, passport) never returned by network RPCs — identity only, detail behind the F&P confidential permission;
- export permission checked server-side and written to `audit_logs`;
- UI discoverability is never the control — every restriction is enforced in the RPC.

---

## 14. Performance, indexes and visualization technology

Current scale (54 entities / 92 parties / 38 appointments) makes recursive traversal negligible. Missing structures that will matter as the estate grows (**not created in this pass**):

- `party_relationships (target_party_id)` — reverse traversal currently unindexed;
- `ownership_interests (owner_party_id, effective_to)` — person→entities direction;
- name-search index on `parties.display_name` / `organization_names.normalized_name` (a `normalized_name` btree exists; trigram/FTS does not);
- future `addresses (normalized_key)` unique/btree;
- `fp_individual_roles (licensee_id, is_current)` exists; `entity_appointments (person_party_id)` exists.

**Visualization (§29):** dependency scan shows **no graph/network library** in `package.json`. Present and reusable: `recharts` (charts, not networks), `jspdf` + `jspdf-autotable` (export/print), Radix/shadcn, TanStack Query. Recommendation for F8A-B5, subject to approval and **not installed here**: `@xyflow/react` (React Flow) — React-native, MIT, custom node/edge components, directed edges with labels, zoom/pan/fit-view, controlled expand/collapse, works with an external layout pass (`dagre`/`elkjs`) for hierarchical ownership trees, small enough to maintain. Alternatives considered: Cytoscape.js (powerful layouts, non-React imperative core, heavier), vis-network (aging, weaker React story), raw D3 (maximum control, maximum maintenance). Every graph view must ship with an equivalent accessible **table/relationship register**.

---

## 15. Twenty-entity future certification dataset (DESIGN ONLY — not created)

| # | Structure | Expected graph / UBO result |
|---|---|---|
| 1 | Owner-managed company: P1 → 100% E1 | 1 UBO at 100%, COMPLETE |
| 2 | Two shareholders: P2 60% / P3 40% of E2 | 2 owners; UBO set depends on threshold |
| 3 | Corporate shareholder: O1 (non-regulated) → 80% E3 | intermediate org node; chain continues or terminates |
| 4 | Two-level: P4 → 100% H1 → 70% E4 | P4 effective 70% |
| 5 | Three-level: P5 → 80% H2 → 60% H3 → 75% E5 | P5 effective 36% |
| 6 | Multi-path: P6 via H4 (40%×50%) and H5 (30%×40%) into E6 | 20% + 12% = 32%, 2 paths |
| 7 | Shared UBO: P7 controls E7 and E8 | one person node, two regulated entities |
| 8 | Common director: P8 director of E9 and E10 | shared-director edge pair |
| 9 | Director across 5+ entities: P9 on E9–E13 | high-degree person node, concentration flag |
| 10 | Common registered address: E14 and E15 at address A1 | `SHARES_ADDRESS_WITH`, EXACT/NORMALIZED, intelligence-only |
| 11 | Holding with subsidiaries: H6 → E16, E17, E18 | 3-child hierarchy |
| 12 | Cross-holding: E19 20% of E20 and E20 15% of E19 | both edges, no cycle abort (not a loop) |
| 13 | Circular: O2 → O3 → O4 → O2 | cycle_detected=true, finite |
| 14 | Controller without majority: P10 10% + `controller_of` E16 | CONTROL reason, not threshold |
| 15 | Historical transfer: P11 → E17 until 2024-06-30, P12 after | as-of dependent results |
| 16 | Historical director change on E18 | as-of dependent governance |
| 17 | Trust/foundation over E19 | `TRUST_STRUCTURE` incomplete until trust modelling lands |
| 18 | Incomplete foreign chain: O5 (foreign, unidentified) → E20 | `UBO INCOMPLETE / UNVERIFIED` |
| 19 | Multi-regulator group spanning two regulator bodies | different thresholds → different UBO flags, same graph |
| 20 | Prudential group ≠ legal ownership perimeter | perimeter-vs-legal difference report shows included/excluded members |

---

## 16. Industry / supervisory comparison

- **FATF beneficial-ownership transparency:** requires identification of the ultimate natural person, the ownership/control chain, and adequate/accurate/up-to-date records. The design satisfies this only with: three-dimensional percentages, control tests beyond shareholding, explicit UNVERIFIED outcomes, and provenance per edge. Threshold values (commonly 10–25% across jurisdictions) are **BCR, never code**.
- **Basel consolidated / group supervision:** requires a group perimeter that may differ from legal ownership — hence the explicit separation of `financial_groups` (supervisory) from the F8A legal graph, plus a difference report.
- **IAIS group-wide supervision:** needs head-of-group identification and cross-border group structure — supported by ultimate-parent resolution once non-regulated and foreign parties are modelled.
- **Fit-and-proper / key-person supervision:** requires person→all-roles history across entities — currently blocked by the empty `fp_individual_party_links` bridge.
- **Connected/related-party intelligence:** requires common director, common UBO, common address and related-party edges with an authoritative-vs-inferred distinction.

No jurisdiction-specific legal threshold is asserted anywhere in this document.

---

## 17. Classification matrix

| Capability | Classification |
|---|---|
| Canonical party/person/entity identity spine | BUILT + PROVEN (schema), data thin |
| `ownership_interests` as ownership edge store | BUILT, NOT PROVEN (0 rows, no writer) |
| `entity_appointments` as role store | BUILT + PROVEN (38 rows) |
| `party_relationships` as relationship store | BUILT, NOT PROVEN (0 rows) |
| Governed structural change-set pipeline | BUILT, NOT PROVEN (0 change sets) |
| Legacy `entity_relationships` + admin tabs | PARTIAL / duplicate — MISSING (Track A) consolidation |
| F&P ↔ party person linkage | PARTIAL (bridge exists, 0 links) — Track A |
| Director role coverage in live data | DATA REMEDIATION REQUIRED |
| Non-regulated organization parties | PARTIAL (modelled, unused) |
| Trust / foundation / partnership parties | MISSING — Track A |
| Canonical address identity + normalization | MISSING — Track A |
| Common-address intelligence | MISSING — Track A (depends on address primitive) |
| Indirect / effective ownership computation | MISSING — Track A |
| UBO resolver | MISSING — Track A |
| UBO threshold configuration | MISSING — Track A (values = BCR) |
| Person 360 | MISSING — Track A |
| Address 360 | MISSING — Track A (thin) |
| Relationship intelligence search | MISSING — Track A |
| Graph visualization | MISSING — Track A (no library present) |
| Prudential perimeter vs legal group comparison | MISSING — DOWNSTREAM/F8 contract |
| Graph export (PDF/CSV/image) with provenance | TRACK B |
| Shared phone/email/agent intelligence | TRACK B |
| AI network explanation | TRACK B (non-authoritative only) |
| Registry/external UBO ingestion | TRACK B |
| Materialized edge cache | TRACK B (only on proven need) |
| Production seeding of real ownership/directors | F20 COMMISSIONING |

---

## 18. GAP-F8A register

Severity: C = Critical, H = High, M = Medium, L = Low.

| Gap | Sev | Finding / regulatory effect | Evidence | Root cause | Canonical target | Dependency | Remediation | Class | Required test |
|---|---|---|---|---|---|---|---|---|---|
| GAP-F8A-01 | C | Entity 360 "Group relationships" reads legacy `entity_relationships` (free-text counterparty, no provenance) instead of `party_relationships`; regulators see a non-canonical relationship view | `entity360_section` source; `entity_relationships` DDL | legacy surface never re-pointed after RDM Wave B | `party_relationships` | none | Re-point section to `party_relationships` ⨝ `relationship_types` ⨝ `parties`; retire legacy read | Track A | section returns canonical rows; legacy table not referenced by any live RPC |
| GAP-F8A-02 | C | `OwnershipTab.tsx` / `RelationshipsTab.tsx` present a second ownership/relationship model with hard-coded types and client-side CRUD against `entity_relationships` | `src/components/entity-detail/*` | pre-canonical admin UI | Entity 360 canonical sections | GAP-F8A-01 | Retire both tabs; route users to canonical Entity 360 / Structure Hub | Track A | no source reference to `entity_relationships` outside generated types; route/nav check |
| GAP-F8A-03 | C | No indirect/effective ownership computation anywhere; supervisors cannot see who ultimately owns an entity | no `pg_proc` match for ownership traversal | never built | new `entity_ownership_network` RPC | GAP-F8A-05 | Deterministic recursive traversal per §11.2 | Track A | 20-entity behavioural gate incl. multi-path, cycle, depth, as-of |
| GAP-F8A-04 | C | No UBO resolver; FATF ultimate-beneficial-owner identification impossible | no UBO function | never built | `entity_ubo_resolve` | GAP-F8A-03, -06 | Implement with explicit INCOMPLETE/UNVERIFIED outcomes | Track A | scenarios 1–10 produce exact expected output |
| GAP-F8A-05 | C | Zero ownership edges exist (`ownership_interests` 0 rows); no writer path is proven (0 change sets) | live census | intake never projects ownership | `ownership_interests` via change sets | F5 effect engine | Prove a governed ownership write path end-to-end | Track A | maker-checker create→approve→apply→read, with provenance |
| GAP-F8A-06 | C | No canonical address identity or normalization; common-address intelligence impossible; registered address unusable | catalogue-wide address scan | addresses embedded as free text in registrations/F&P/establishments | new `addresses` + `address_usages` | none | Add normalized address primitive; project existing sources | Track A | deterministic EXACT/NORMALIZED match test set incl. punctuation/case/unit/postal variants |
| GAP-F8A-07 | H | F&P persons are not linked to canonical parties (`fp_individual_party_links` = 0 of 35); the same person cannot be recognised across ownership, appointments and F&P | live census; `fp_link_persons_deterministic` unused | linkage never executed/enforced | `parties`/`persons` | none | Run deterministic linkage, enforce link-on-create, surface unresolved queue | Track A | every F&P individual either linked or in an explicit unresolved register |
| GAP-F8A-08 | H | 38/38 appointments have `fp_individual_id IS NULL`; appointment↔F&P context is broken for F9 | live census | bridge column never populated | `entity_appointments.fp_individual_id` | GAP-F8A-07 | Populate on write; expose in governance section | Track A | governance rows show F&P linkage; F9 person history query returns roles |
| GAP-F8A-09 | H | `fp_individual_roles.ownership_pct` and `financial_group_members.ownership_percentage` are competing ownership representations | DDL | historical | `ownership_interests` | GAP-F8A-05 | Declare canonical; make the others display-only/derived; document bridge | Track A | no surface presents a non-canonical ownership percentage as authoritative |
| GAP-F8A-10 | H | No Person 360; person→entities/ownership/directorships/F&P unanswerable | no route/page/RPC | never built | `/persons/:partyId` + `person_relationship_network` | GAP-F8A-07 | Build contextual Person 360 | Track A | person with roles at ≥2 entities renders full network + register |
| GAP-F8A-11 | H | No relationship-intelligence search (person / identifier / address); only entity search exists | `pg_proc` search inventory | never built | single intelligence search RPC | GAP-F8A-06 | Add scoped, permission-gated search | Track A | search by person name, identifier and normalized address returns connected objects |
| GAP-F8A-12 | H | `party_relationships` has no uniqueness/inverse-consistency/cycle governance; duplicate inverse and contradictory rows are possible | DDL, no triggers | store never populated or governed | `party_relationships` | none | Add constraints/trigger for duplicate + inverse consistency + self-relationship | Track A | insert of duplicate/inverse/self relationship rejected |
| GAP-F8A-13 | H | No trust / foundation / partnership party representation; such chains cannot terminate correctly | `parties.party_kind` values | model gap | `parties` kind catalogue + role edges | none | Add governed party-kind catalogue and trustee/settlor/beneficiary/partner edges | Track A | scenario 8 yields structured trust output rather than a silent dead end |
| GAP-F8A-14 | H | No graph query safety contract (depth/node caps, regulator scope, sensitive-attribute filtering, export audit) | no relationship RPCs exist | never built | new RPC contract | GAP-F8A-03 | Enforce server-side limits and scope per §13 | Track A | deep/wide traversal returns bounded, `truncated=true` result; cross-regulator leakage blocked |
| GAP-F8A-15 | M | No graph visualization capability or library; regulators must read tables | `package.json` scan | never built | Entity 360 / Person 360 graph views | GAP-F8A-03 | Add one approved React graph library + accessible table equivalent | Track A | four graph modes render with table equivalents |
| GAP-F8A-16 | M | Reverse traversal unindexed (`party_relationships.target_party_id`); no name-search index for parties | `pg_indexes` | never needed | index set | GAP-F8A-03 | Add indexes with the traversal wave | Track A | traversal plan uses indexes at seeded scale |
| GAP-F8A-17 | M | Prudential perimeter vs legal ownership group cannot be compared; risk of the two being conflated | `financial_group*` vs canonical stores | separate lineages | comparison report | GAP-F8A-03 | Read-only difference report; no merge | Downstream (F8 contract) | perimeter-vs-legal difference correct for scenario 20 |
| GAP-F8A-18 | M | `role_types` lacks external auditor, trustee, partner and generic key-function-holder | catalogue | seed scope | `role_types` | none | Extend catalogue (config, versioned) | BCR + Track A (catalogue) | governance section renders extended roles |
| GAP-F8A-19 | M | UBO thresholds have nowhere to live; hard-coding 25% would be non-compliant | no threshold table | never built | `ubo_threshold_profiles` | GAP-F8A-04 | Effective-dated, approval-versioned, regulator/jurisdiction/entity-type scoped | Track A (primitive) + BCR (values) | scenario 10: two regulators, different UBO flags, identical graph |
| GAP-F8A-20 | M | Live estate has 0 directors, 35/54 entities with no appointments, 54/54 with no ownership; F8A cannot be certified on live data | live census | onboarding never projected structure | certification dataset | GAP-F8A-05 | Build the 20-entity synthetic dataset (rollback-safe) | Track A (gate) + Data remediation (live) | deterministic 20-entity gate passes twice |
| GAP-F8A-21 | L | 1 duplicate full-name group in `fp_individuals`; no unique constraint on national ID/passport | live census | free-text person capture | `fp_individuals` + party bridge | GAP-F8A-07 | Investigate and merge or distinguish; add identity-signal constraints | Data remediation | duplicate register empty or explicitly justified |
| GAP-F8A-22 | L | No network export (PDF/CSV/image) with as-at, filter context, provenance and authoritative-vs-inferred disclaimer | none exists | never built | export service | GAP-F8A-15 | Reuse `jspdf`/CSV export patterns with mandatory disclosure block | Track B | export contains as-at, filters, generated-at, provenance disclaimer |

**Counts — Track-A product gaps: 18** (01–16, 19, 20). **Downstream: 1** (17). **Data remediation: 2** (20 live-data portion, 21). **Track-B: 1** (22). GAP-F8A-18 and GAP-F8A-19 additionally generate BCR items below.

### BCR register (business configuration required)

| # | Configuration item | Owning module | Safe behaviour if unconfigured | Blocks F8A runtime? |
|---|---|---|---|---|
| BCR-F8A-01 | UBO ownership threshold % per regulator/jurisdiction/entity type | F8A config (values by regulator) | UBO flags suppressed; percentages still shown with "threshold not configured" | No (degrades) |
| BCR-F8A-02 | UBO voting/control threshold % | F8A config | control test not applied | No |
| BCR-F8A-03 | Control-test definitions accepted as beneficial ownership | F8A config | only explicit `is_controller` respected | No |
| BCR-F8A-04 | Maximum traversal depth / node budget policy | F8A config | platform defaults (10 / 300) | No |
| BCR-F8A-05 | Address normalization ruleset per country (abbreviations, postal format) | F8A / master data | exact-text match only; fewer matches, no false positives | No |
| BCR-F8A-06 | Extended `role_types` (external auditor, trustee, partner, key function holder) | F1 master data | those roles cannot be recorded | Partially (role coverage) |
| BCR-F8A-07 | Party-kind catalogue (trust, foundation, partnership) | F1/F2 master data | trust chains report INCOMPLETE | Partially |
| BCR-F8A-08 | Relationship-type activation per jurisdiction | F1 master data | all seeded types active | No |
| BCR-F8A-09 | Which relationship classes are visible to entity-portal users | F8A security config | internal-only (fail closed) | No |
| BCR-F8A-10 | Ownership declaration obligation / refresh cadence | F5 post-licensing | no periodic refresh; data ages | No |

**BCR count = 10.**

### Data-remediation register

| Item | Owner | Status |
|---|---|---|
| 54/54 entities with no ownership edges; 35/54 with no appointments; 0 directors recorded | F8A / F20 commissioning | DATA_REMEDIATION_REQUIRED |
| 35 F&P individuals unlinked to canonical parties; 38 appointments without F&P linkage | F8A (mechanism) + operations (execution) | DATA_REMEDIATION_REQUIRED |
| 1 duplicate `fp_individuals` full-name group | F9 / operations | DATA_REMEDIATION_REQUIRED |
| Historical regulator-scoped entity identifier — 1 ambiguous row | F2 (upstream, carried) | DATA_REMEDIATION_REQUIRED |
| Historical F6 receipt `RCT-2026-000038` | F6 (upstream, carried) | DATA_REMEDIATION_REQUIRED |

**Outstanding data-remediation count = 5** (F8A-owned 3; upstream/shared 2).

### Track-B register

| Item |
|---|
| Network export pack (PDF/image/CSV with provenance disclaimer) |
| Shared phone / email-domain / registered-agent intelligence |
| External registry or public UBO-register ingestion |
| AI network explanation and concentration commentary (never authoritative) |
| Materialized graph edge cache (only on proven performance need) |

**Track-B count = 5.**

---

## 19. Proposed F8A-B waves (DESIGN ONLY — none executed)

| Wave | Scope | Closes |
|---|---|---|
| **F8A-B1** | Canonical relationship consolidation: re-point Entity 360 `relationships` to `party_relationships`, retire legacy `entity_relationships` surfaces, add relationship governance constraints (duplicate/inverse/self), prove the governed ownership write path, declare canonical ownership and demote competing percentage copies, extend role/party-kind catalogues | 01, 02, 05, 09, 12, 13, 18 |
| **F8A-B2** | Deterministic ownership traversal + UBO resolver + configurable thresholds + graph query safety contract + traversal indexes | 03, 04, 14, 16, 19 |
| **F8A-B3** | Person identity linkage, appointment↔F&P bridge, Person 360 and person relationship network | 07, 08, 10 |
| **F8A-B4** | Normalized address primitive, address usages, deterministic EXACT/NORMALIZED common-address intelligence, Address 360 (thin), intelligence search | 06, 11 |
| **F8A-B5** | Graph/query API surfacing + Entity 360 / Person 360 / Address intelligence UX with mandatory table equivalents; approved graph library | 15 |
| **F8A-B6** | 20-entity behavioural certification gate (`verify:f8a` / `certify:f8a-c`), rollback-safe, run twice; F8→F8A consumption contract | 17, 20 |

---

## 20. Frozen-contract impact map

| Frozen module | Anticipated F8A touch | Regression gates required when touched |
|---|---|---|
| F1 master/config | role types, party kinds, relationship types, threshold primitive | `verify:f1c`, `verify:permission-refs` |
| F2 entity identity | party/person linkage, identifiers, address projection | `verify:f2b`, `verify:f0c` |
| F4 licensing / F&P data | F&P person linkage, appointment bridge | `certify:f4c`, `verify:f4b` |
| F5 post-licensing structural effects | ownership/appointment/relationship write path, establishments | `verify:f5b1`–`verify:f5b5x`, `certify:f5c` |
| F6 / F6-X currency & regulator identity | regulator-scoped traversal reuse only (no monetary change expected) | `verify:f6b`, `certify:f6c`, `verify:f6x-currency`, `verify:enforcement-currency` |
| F7 Entity 360 / navigation / returns | Entity 360 section re-point, new contextual routes and breadcrumbs | `verify:f7b`, `certify:f7c` (incl. route-retirement check), `verify:breadcrumbs` |
| Shared security | new RPCs, permissions, RLS | `verify:hardening`, `verify:anon-execute`, `verify:definer-guards`, `verify:audit-contract`, `verify:write-contract`, `verify:service-completeness` |

No frozen artefact was modified by this discovery pass.

---

## 21. Navigation / discoverability plan (documented, not implemented)

| Future surface | Route | Entry | Permission | Breadcrumb |
|---|---|---|---|---|
| Relationship intelligence (ownership/UBO/network) | Entity 360 section, no new route | contextual within Entity 360 "Ownership & control" | `entity_structure:view` | Entities → {entity} → Ownership & control |
| Person 360 | `/persons/:partyId` | contextual from governance/ownership rows, F&P records, search | `entity_structure:view` (+ `fit_and_proper:view` for F&P content) | Entities → Person → {name} |
| Address 360 | `/intelligence/addresses/:addressId` | contextual from address usages and matches | `relationship_intelligence:view` | Intelligence → Address → {address} |
| Global relationship intelligence search | `/intelligence/network` | **MENU-LINKED** internal supervisory surface (single new menu item) | `relationship_intelligence:view` | Intelligence → Network search |

---

## FINAL VERDICT

**F8A DISCOVERY COMPLETE — READY FOR CONSOLIDATED REMEDIATION DESIGN**

- Current HEAD: `38a742b1188db1837f0a0ca39399117ea60e5f05`
- F7 protected frozen code baseline: `fecb806f992136341ce67a8205a3c0116761235d` (unchanged)
- Canonical entity identity: `licensees.id` (party handle `licensees.party_id` → `parties`)
- Canonical person identity: `parties.id` where `party_kind='PERSON'`, detailed by `persons.party_id`
- Canonical ownership store: `ownership_interests`
- Canonical appointment store: `entity_appointments`
- Canonical relationship store: `party_relationships` (legacy `entity_relationships` to be retired)
- Canonical address model: **none exists** — normalized address primitive required
- Live relationship counts: entities 54 · parties 92 (38 person / 54 organization) · ownership interests 0 · appointments 38 · party relationships 0 · F&P individuals 35 · F&P roles 9 · F&P↔party links 0 · financial groups 1 / members 2 · identifiers 75 · entity facts 0 · establishments 0
- Track-A gap count: **18**
- BCR count: **10**
- Outstanding data-remediation count: **5** (F8A-owned 3, upstream/shared 2)
- Track-B count: **5**
- Recommended waves: **F8A-B1 … F8A-B6** as specified in §19

STOP. No implementation, migration, graph UI, F8 or F9 work was performed.
