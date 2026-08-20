# Regulatory Data Migration Plan (RDM-ENTITY-001)

Additive, reversible, phased. Each phase ends with diagnostics proving the
invariants it claims.

## Phase 0 — Baseline & integrity discovery (delivered)

* Naming standard published (`regulatory-data-naming-standard.md`).
* Entity/registry target architecture published.
* Form → entity lineage mapped.
* Read-only diagnostics `rdm_integrity_report()` and
  `rdm_diag_duplicate_entities()` shipped and surfaced in the admin hub.
* Baseline: 23 entities / 23 licences (1:1), 43 FKs to `licensees`,
  122 applications with no pinned form version, 4 duplicate entity names,
  5 distinct `form_type` values across 55 templates.

## Phase 1 — Metadata & configuration foundation (delivered)

* 12 configuration tables with grants, RLS (`settings.view` to read,
  `settings.edit` to change) and automatic audit logging.
* Seeded defaults for classifications, lifecycle, identity statuses,
  relationship and role types, form purposes and triggers, data domains,
  identifier types, resolution and registry-failure policies.
* Admin surface: **Administration → Configuration → Regulatory Data Model**.
* Zero changes to existing business tables, workflows or policies.

## Phase 1.1 — Architecture alignment & metadata hardening (delivered)

* Party/organisation model restored in the naming standard; "licensed" is a
  state, not a type; non-regulated organisations are representable.
* Lifecycle vocabularies separated per domain (entity / licence / application).
* Identity authority default changed to `DEPLOYMENT_CONFIGURED`.
* Identifier uniqueness expressed as a scope, not a global boolean.
* Key immutability, system-record protection, no-cascade taxonomy FKs,
  single active default policies, policy consistency constraints.
* Relational relationship inverses; ownership explicitly out of scope for
  relationship types.
* Governed write RPCs and canonical `regulatory_data.metadata.*` audit keys.
* No business table, workflow, route or RLS policy for existing modules changed.

## Phase 1.2 — Final metadata governance hardening (delivered)

* Direct `INSERT`/`UPDATE`/`DELETE` on the 12 metadata tables revoked from
  `authenticated` and `anon`; `SELECT` retained. The only authenticated write
  path is `rdm_save_metadata` / `rdm_retire_metadata` / `rdm_delete_metadata`
  (permission re-check, key immutability, system-row protection, validation,
  audit).
* Exactly one active default policy for `entity_resolution_policies` and
  `entity_registry_failure_policies`, enforced by a partial unique index (no
  second default) **plus** a deferrable constraint trigger (never zero). An
  atomic swap inside one transaction is legal; retiring or deleting the current
  default requires promoting a replacement (`_promote_id`), otherwise the
  operation is rejected. No hidden default is ever fabricated.
* `scope_requires_jurisdiction` / `_issuer` / `_regulator` and the legacy
  `is_unique_global` flag are generated columns derived from
  `uniqueness_scope`, so inconsistent scope metadata is impossible.

Future identifier uniqueness keys (canonical contract):

| Scope | Uniqueness key |
|-------|----------------|
| `GLOBAL` | `(identifier_type_id, normalized_value)` |
| `JURISDICTION` | `(identifier_type_id, jurisdiction_id, normalized_value)` |
| `ISSUER` | `(identifier_type_id, issuer_key, normalized_value)` |
| `REGULATOR` | `(identifier_type_id, regulator_id, normalized_value)` |
| `NONE` | no uniqueness constraint |

## Phase 2A — Party / organization / regulated entity / multi-licence (delivered)

* `parties` (structural `party_kind`: `PERSON` | `ORGANIZATION`),
  `organizations`, `persons`. `party_kind` is an engine primitive, never
  regulator-configurable. `persons` is intentionally empty: consolidation of
  `fp_individuals` / `profiles` is unresolved and no person identity is cloned.
* `licensees.id` remains the transitional regulated-entity UUID (43+ FKs depend
  on it). `licensees.party_id` binds each entity to exactly one organization
  party; zero entity UUIDs changed. The physical rename to `regulated_entities`
  is not part of this phase.
* `licensees.lifecycle_stage_id` (restricted to `domain = 'entity'` by trigger)
  and `licensees.identity_status_id`. Backfill is deterministic only: active
  entity + active licence -> `authorised`, revoked + revoked ->
  `former_licensee`; ambiguous legacy states stay NULL. Identity status is the
  new `legacy_known` value — no external verification provenance is fabricated.
* `entity_licenses` (entity, licence, effective period, `is_primary`, source).
  `is_primary` is a UI/compatibility preference only, never entity identity.
  `licensees.license_id` is retained as compatibility-only.
* `entity_identifiers` with per-scope partial unique indexes implementing the
  contract above and a normalisation/scope-validation trigger. Legal name is
  not an identifier. Only licence numbers with a known regulator were
  backfilled (provenance recorded); licences without a regulator are reported.
* `applications.entity_id` (nullable) backfilled only via the deterministic
  path `licenses.application_id`; ambiguous rows stay NULL and are reported.
  No historical `form_version_id` was fabricated.
* RLS: read-only policies scoped through `can_read_licensee` /
  `licensee_management.view_all_entities`; no write grants for app users.
* Diagnostics: `rdm_entity_foundation_report()` and
  `rdm_diag_duplicate_organizations()` surfaced in the RDM Data Integrity tab.
  Duplicate organisations are reported only — never merged.

Phase 2A exit measurements: 23 parties / 23 organizations / 0 persons /
23 regulated entities, 0 entities without a party binding, 0 shared parties,
23 `entity_licenses` rows reconciling exactly with 23 legacy licence links,
0 lost legacy links, 0 licences without a relationship, 0 entities with >1
licence, 19 identifiers backfilled (4 licences have no regulator), 23
applications deterministically mapped and 99 left NULL, 0 form versions
fabricated.

## Phase 2B — external registry schema foundation (not started)

1. `entity_registry_bindings`, `entity_external_references`,
   `entity_data_authority_rules`, `entity_identity_snapshots` — schema only,
   reusing the existing Integration Manager, no provider adapters.
2. Entity resolution service honouring `entity_resolution_policies` and
   `entity_registry_failure_policies`; duplicate candidates become resolution
   cases — never auto-merged.
3. `applications.form_version_id`: pin **prospectively** on submission only.
   Historical rows are NOT back-filled with a current version — that would
   fabricate submission provenance. Legacy rows stay NULL and are reported as
   "version unknown"; the column therefore stays nullable, with a NOT NULL
   constraint considered only for rows created after the cutover date.

Exit criteria: an entity can hold two licences in different sectors; every
**new** application pins its form version at submission; legacy submissions are
labelled version-unknown rather than rewritten; no duplicate entity is silently
merged.


## Phase 3 — Vocabulary adoption

* `entity_relationships.relationship_type` → FK to `relationship_types`.
* `fp_individual_roles` → FK to `role_types`.
* `form_templates.form_type` → FK to `form_purposes` (+ trigger type),
  legacy column derived.

## Phase 4 — Registry integration go-live

* Activate the `government_registry` connector per deployment.
* Store verified projections with verification timestamps and staleness
  monitoring; surface discrepancies to supervisors.

## Rollback posture

Phases 0 and 1 are pure additions: dropping the `rdm_*` functions and the 12
metadata tables restores the previous state exactly. Phase 2 onwards ships
each destructive step behind a compatibility view plus a reversible migration.
