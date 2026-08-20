---
name: Regulatory Data Model (RDM-ENTITY-001)
description: Entity-first regulatory architecture programme — Phase 0 baseline, Phase 1/1.1/1.2 metadata governance, Phase 2A party/organization/regulated-entity/multi-licence foundation, Phase 2A.1 corrections, Phase 2B external registry schema, admin hub, and phase boundaries
type: feature
---
Programme RDM-ENTITY-001 evolves the platform to a party/entity-first regulatory model.

Delivered (Phase 0, 1, 1.1, 1.2, 2A, 2A.1 and 2B only — do NOT implement Phase 3+ without explicit instruction).

## Metadata foundation (Phase 1 / 1.1 / 1.2)
- Docs in `docs/architecture/`: naming standard, entity-registry architecture, form→entity data flow, migration plan.
- 12 configuration tables: classification_schemes, classification_values, lifecycle_stages, entity_identity_statuses, relationship_types, role_types, form_purposes, form_trigger_types, data_domains, entity_identifier_types, entity_resolution_policies, entity_registry_failure_policies. All have key/label/sort_order/is_active/is_system and audit triggers into `audit_logs`.
- Writes: `authenticated` has SELECT only. The ONLY authenticated write path is `rdm_save_metadata` / `rdm_retire_metadata(_table,_id,_promote_id)` / `rdm_delete_metadata(_table,_id,_promote_id)` — permission re-check (settings.edit), key immutability, system-row protection, validation, audit.
- Exactly one active default for `entity_resolution_policies` and `entity_registry_failure_policies`: partial unique index blocks a second default, a DEFERRABLE constraint trigger blocks zero. Atomic swap in one transaction is legal; retiring/deleting the default requires promoting a replacement (`_promote_id`). Never fabricate a hidden default.
- `scope_requires_jurisdiction|_issuer|_regulator` and legacy `is_unique_global` are GENERATED columns derived from `uniqueness_scope` — mark them `derived: true` in `rdmSchema.ts` (rendered read-only, never submitted).
- Identifier uniqueness contract: GLOBAL `(type, normalized)`, JURISDICTION `(type, jurisdiction_id, normalized)`, ISSUER `(type, issuer_key, normalized)`, REGULATOR `(type, regulator_id, normalized)`, NONE none.
- Admin hub: `/admin/regulatory-data-model` (Administration > Configuration), generated from `src/lib/rdm/rdmSchema.ts` via `MetadataTablePanel`. Renders WITHOUT `DashboardLayout` (AppShell owns chrome).
- Diagnostics: `rdm_integrity_report()`, `rdm_diag_duplicate_entities()`, `rdm_entity_foundation_report()`, `rdm_diag_duplicate_organizations()`.

## Party / regulated-entity foundation (Phase 2A)
- Canonical model: PARTY > (PERSON | ORGANIZATION) > regulated entity > applications/licences. `parties.party_kind` is a structural engine primitive (PERSON/ORGANIZATION) and must never become regulator-configurable, nor carry sector/licence/relationship semantics.
- `licensees.id` IS the transitional regulated-entity UUID (43+ FKs). `licensees.party_id` → `organizations.party_id`, unique, one party per entity. NEVER regenerate entity UUIDs; the physical rename to `regulated_entities` is a later phase.
- `persons` exists but is intentionally EMPTY — consolidation with `fp_individuals` / `profiles` is unresolved; never clone profiles into persons.
- `licensees.lifecycle_stage_id` must reference `lifecycle_stages.domain = 'entity'` (trigger-enforced). `identity_status_id` uses `legacy_known` for migrated rows — never claim external VERIFIED provenance without evidence.
- `entity_licenses` is the canonical entity↔licence relationship (multi-licence capable). `licensees.license_id` is compatibility-only. `is_primary` is a UI preference, never entity identity; one current primary per entity.
- `entity_identifiers` enforces uniqueness per configured scope via partial unique indexes; a trigger normalises the value (upper, alphanumeric only), mirrors the scope and requires jurisdiction/issuer/regulator when the scope demands it. Legal name is NOT an identifier. Only deterministic identifiers with recorded provenance are backfilled.
- `applications.entity_id` is nullable and backfilled only via `licenses.application_id`; ambiguous rows stay NULL by design. Never back-fill historical `applications.form_version_id`.
- Duplicate entities/organisations are NEVER auto-merged — they are reported as resolution candidates for a later phase.
- New Phase 2A tables are read-only for app users: RLS scoped through `can_read_licensee` / `licensee_management.view_all_entities`; no INSERT/UPDATE/DELETE grants to `authenticated`.

## Phase 2A.1 corrections
- A licence number is NEVER entity identity: it identifies an authorisation. The 19 Phase 2A `licenses.license_number` identifiers were removed by provenance and the `license_number` identifier type retired (`is_active=false`, never deleted). `licenses.license_number` stays authoritative; it may later be a resolution lookup signal via `entity_licenses` only. `entity_identifiers` = company reg no, taxpayer no, LEI, regulatory entity no, foreign registry id. Never overload it with licence/person subjects.
- `entity_identifier_types.normalization_strategy` is a CLOSED engine vocabulary (UPPER_TRIM, UPPER_ALPHANUMERIC, DIGITS_ONLY, TRIM_ONLY, CASE_SENSITIVE_TRIM); `public.normalize_entity_identifier(type_id, raw)` is the single service and `entity_identifier_normalize()` delegates to it. Registry matching must reuse it. Never execute admin-supplied SQL/JS/regex in matching.
- `entity_licenses.entity_id`, `entity_identifiers.entity_id`, `applications.entity_id` are ON DELETE RESTRICT. Entities are closed/retired/merged, never deleted; no destructive delete UI. Controlled merge is designed (merge case + re-point lineage + `merged_into_entity_id` + snapshots) but NOT implemented.
- `entity_licenses.effective_from` is NOT NULL — every backfilled row had a real date; never substitute now().

## Phase 2B external registry (SCHEMA ONLY)
- 6 tables: entity_registry_bindings, entity_external_references, entity_data_authority_rules, entity_identity_snapshots (append-only trigger), entity_registry_sync_states, entity_sync_conflicts. Diagnostics: `rdm_entity_registry_report()`.
- Bindings reference `integration_connections.id`; NEVER duplicate base URL/auth/secrets/retry or create registry credential tables. Authority modes LOCAL_AUTHORITATIVE / EXTERNAL_AUTHORITATIVE / HYBRID_AUTHORITY; one current primary binding per scope.
- External ids only map to the permanent local entity UUID — they never replace `entity_id` anywhere. Conflicts are recorded, never auto-resolved (no last-write-wins). No `data_concepts` placeholder table.
- Registry config/sync/conflicts = internal staff only; external portal users have no read. No provider adapters, gateway runtime or HTTP calls yet.
- pgTAP: `supabase/tests/rdm/04_phase_2a1_corrections.sql`, `05_phase_2b_registry_foundation.sql`. Suites 02/03 fail in the sandbox psql role with 42501 (needs UPDATE privileges) — pre-existing environmental, not a regression.

## Remaining phases (do not start unsolicited)
3 entity resolution + gateway runtime/adapters + entity-user memberships + registration integration + entity merge, 4 form semantics/stable field identity/prospective form-version pinning, 5 ownership/governance/party relationships + effective-dated `organization_names` history.

Baseline/exit facts: 23 regulated entities, 23 organisation parties, 0 persons, 23 `entity_licenses` rows (0 legacy links lost, 0 licences unrelated), 19 identifiers backfilled (4 licences have no regulator), 23 applications deterministically mapped / 99 NULL, 122 applications with NULL `form_version_id`, 4 duplicate entity names reported only.
