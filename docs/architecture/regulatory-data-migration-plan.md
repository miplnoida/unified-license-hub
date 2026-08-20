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

## Phase 2A.1 — corrective migration (delivered)

Additive corrections to Phase 2A semantics. No previous migration was rewritten
and no entity UUID changed.

1. **Licence number is not entity identity.** A licence number identifies an
   authorisation, not the legal person holding it, and one entity may hold many
   licences. The 19 `entity_identifiers` rows generated by the Phase 2A
   `licenses.license_number` backfill were removed (identified by their recorded
   provenance, `source_reference = 'licenses.license_number:<id>'`), and the
   `license_number` identifier type was **retired** (`is_active = false`), not
   deleted. `licenses.license_number` remains untouched and authoritative;
   0 licence records changed. Entity identifiers now mean company registration
   number, taxpayer registration number, LEI, regulatory entity number or
   foreign registry identifier. A licence number may later participate in entity
   resolution as a *lookup signal* through `entity_licenses` — never as canonical
   entity identity. If identifier types must one day span several subjects
   (entity, licence, person), that requires its own subject-typed registry;
   `entity_identifiers` is deliberately not overloaded.
2. **Controlled normalisation.** The free-text `normalization_rule` column was
   replaced by `normalization_strategy`, a closed vocabulary of executable engine
   algorithms: `UPPER_TRIM`, `UPPER_ALPHANUMERIC`, `DIGITS_ONLY`, `TRIM_ONLY`,
   `CASE_SENSITIVE_TRIM`. `public.normalize_entity_identifier(type_id, raw)` is
   the single canonical service; `entity_identifier_normalize()` delegates to it,
   and external-registry matching must use the same function. Administrators
   select a strategy — no administrator-supplied SQL, JavaScript, regex or
   expression is ever executed during matching.
3. **Entity delete semantics.** `entity_licenses.entity_id`,
   `entity_identifiers.entity_id` and `applications.entity_id` are now
   `ON DELETE RESTRICT`. A regulated entity is historically durable: the intended
   lifecycle is close / retire / merge, never physical delete. No destructive
   deletion UI exists.
4. **Temporal integrity.** All 23 backfilled `entity_licenses` rows already had a
   known `effective_from`, so the column is now `NOT NULL`. No date was ever
   substituted with `now()`. `effective_to >= effective_from`, one current owner
   per licence and one current primary licence per entity remain enforced;
   `is_primary` stays presentation/compatibility only.
5. **Person data stays deferred.** `persons` remains empty by design.

### Future controlled entity merge (design note, not implemented)

Because lineage FKs now restrict deletion, consolidating duplicate entities will
require an explicit, audited merge operation: choose a surviving entity, record a
merge case with actor and rationale, re-point `entity_licenses`,
`entity_identifiers`, `applications` and supervisory records to the survivor,
retain the absorbed entity as a permanently closed record carrying a
`merged_into_entity_id` pointer, and snapshot both identities before and after.
Merge is never an inline UI delete and is out of scope until Phase 3.

### Person consolidation — hard gate

No `persons` row may be created until the architecture defines canonical person
identity, cross-entity person identity, F&P confidentiality, person-level RLS,
person merge, historical aliases and external screening identity. Cloning
`profiles`, `auth.users` or `fp_individuals` into `persons` is prohibited.

## Phase 2B — external registry schema foundation (delivered)

Schema, security and diagnostics only. No provider adapter, no gateway runtime,
no external HTTP call, and no change to registration, licensing, returns or
Entity 360 behaviour.

1. `entity_registry_bindings` — which existing Integration Manager connection
   supplies registry capability for a deployment or regulator, under an authority
   mode of `LOCAL_AUTHORITATIVE`, `EXTERNAL_AUTHORITATIVE` or
   `HYBRID_AUTHORITY`, with a resolution policy and failure policy. Base URL,
   auth configuration, secrets and retry behaviour stay entirely in Integration
   Manager; only `integration_connection_id` is referenced. One current primary
   binding per scope.
2. `entity_external_references` — maps the permanent local entity UUID to one or
   more external registry identities, with verification and synchronisation
   stamps. The external id never replaces `entity_id` in applications, licences,
   returns or supervisory records, so replacing a provider never rewrites an FK.
3. `entity_data_authority_rules` — authority per `data_domain`
   (`SUPTECH`, `EXTERNAL_REGISTRY`, `DEPLOYMENT_CONFIGURED`), with
   `allow_local_override` and `requires_reconciliation`. `data_concept_id` is
   deliberately absent until a concept registry exists — no placeholder table was
   created to satisfy a future FK.
4. `entity_identity_snapshots` — append-only record of exactly what identity data
   the regulator knew at a material point in time, with capture reason and source
   provenance. Enforced append-only by trigger; nothing is captured automatically
   in this phase.
5. `entity_registry_sync_states` — domain-level synchronisation status only. Raw
   HTTP/provider logging remains in `integration_logs`.
6. `entity_sync_conflicts` — records local vs external discrepancies without
   overwriting either side. There is no automatic resolution engine and no
   last-write-wins.
7. Diagnostics: `rdm_entity_registry_report()` surfaces bindings, references,
   authority rules, snapshots, sync state and open conflicts under
   Regulatory Data Model → Data Integrity. With no integration configured the
   valid answer is all zeros and the platform continues to operate locally.

Exit facts: 6 tables, 0 bindings, 0 external references, 0 authority rules,
0 snapshots, 0 sync states, 0 conflicts, 0 registry connection tables duplicated,
0 credential columns created, 0 external HTTP calls, 0 workflow changes.

## Phase 3 — Entity resolution & memberships (not started)

* Entity resolution service honouring `entity_resolution_policies` and
  `entity_registry_failure_policies`; duplicate candidates become resolution
  cases — never auto-merged.
* Entity Registry Gateway runtime, provider adapters, `searchEntities` /
  `resolveEntity`, `EXACT_MATCH` / `POSSIBLE_MATCH` / `NO_MATCH` handling.
* User-to-entity memberships and registration / onboarding integration.
* Controlled entity merge.

## Phase 4 — Form semantics & version integrity (not started)

* `form_templates.form_type` → FK to `form_purposes` (+ trigger type), legacy
  column derived; `entity_relationships.relationship_type` → `relationship_types`;
  `fp_individual_roles` → `role_types`.
* Stable field identity across form versions.
* `applications.form_version_id`: pin **prospectively** on submission only.
  Historical rows are NOT back-filled with a current version — that would
  fabricate submission provenance. Legacy rows stay NULL and are reported as
  "version unknown"; the column stays nullable, with NOT NULL considered only for
  rows created after the cutover date.

## Phase 5 — Ownership & governance (not started)

* Ownership and control structures, party relationships, governance roles and
  pre-licence packages.
* Effective-dated `organization_names` history (see the entity registry
  architecture doc); `organizations.legal_name` remains the current projection.

## Rollback posture

Phases 0 and 1 are pure additions: dropping the `rdm_*` functions and the 12
metadata tables restores the previous state exactly. Phase 2A/2A.1/2B are
additive: the six registry tables can be dropped without touching business data.
Later destructive steps ship behind a compatibility view plus a reversible
migration.
