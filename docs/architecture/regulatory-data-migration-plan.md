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

## Phase 2 — Party / entity / multi-licence foundation (not started)

1. `entities` compatibility layer over `licensees` (view first, rename later).
2. `entity_licenses` join table; migrate `licensees.license_id` into it and
   keep the column as a generated/compat field for one release.
3. `entity_identifiers` keyed by `entity_identifier_types`; uniqueness indexes
   built from `uniqueness_scope` (never a blanket global unique index).
4. `entity_id` + `identity_status_id` + `lifecycle_stage_id` on entities,
   restricted to `domain = 'entity'` stages.
5. Entity resolution service honouring `entity_resolution_policies` and
   `entity_registry_failure_policies`; duplicate candidates become resolution
   cases — never auto-merged.
6. `applications.form_version_id`: pin **prospectively** on submission only.
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
