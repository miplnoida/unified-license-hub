---
name: Regulatory Data Model (RDM-ENTITY-001)
description: Entity-first regulatory architecture programme — Phase 0 baseline, Phase 1 configurable metadata tables, Phase 1.1 hardening rules, admin hub, and phase boundaries
type: feature
---
Programme RDM-ENTITY-001 evolves the platform to a party/entity-first regulatory model.

Delivered (Phase 0, Phase 1, Phase 1.1 only — do NOT implement Phase 2+ without explicit instruction):
- Docs in `docs/architecture/`: naming standard, entity-registry architecture, form→entity data flow, migration plan.
- 12 configuration tables: classification_schemes, classification_values, lifecycle_stages, entity_identity_statuses, relationship_types, role_types, form_purposes, form_trigger_types, data_domains, entity_identifier_types, entity_resolution_policies, entity_registry_failure_policies. All have key/label/sort_order/is_active/is_system, RLS via `rdm_can_read()` (settings.view) and `rdm_can_write()` (settings.edit), and audit triggers into `audit_logs`.
- Read-only diagnostics: `rdm_integrity_report()`, `rdm_diag_duplicate_entities()`.
- Admin hub: `/admin/regulatory-data-model` (Administration > Configuration), generated from `src/lib/rdm/rdmSchema.ts` via `MetadataTablePanel`. Renders WITHOUT `DashboardLayout` (AppShell owns chrome).

Rules:
- PARTY > ORGANIZATION > ENTITY. "Licensed" is a state (licences held), never an entity type. Non-regulated organisations (auditors, agents, group parents) must be representable without a licence.
- Three lifecycle vocabularies keyed by `lifecycle_stages.domain`: entity / license / application. Never merged; withdrawal, refusal, restriction and suspension are application or licence facts, not entity states. `is_terminal` is terminal within its own domain only.
- Business vocabulary is configuration, never enums or hardcoded strings.
- Identifier uniqueness is a scope (`uniqueness_scope`: GLOBAL/JURISDICTION/ISSUER/REGULATOR/NONE), not a boolean. Company registration and taxpayer numbers are jurisdiction-scoped; `is_unique_global` is a legacy derived flag.
- `data_domains.entity_identity.default_authority = DEPLOYMENT_CONFIGURED`; no external registry is required. Regulatory status is always SUPTECH-owned.
- Machine `key` is immutable after insert; `is_system` rows are retireable, never deletable, never re-flagged; referenced configuration cannot be deleted; taxonomy FKs are ON DELETE RESTRICT.
- All configuration writes go through `rdm_save_metadata` / `rdm_retire_metadata` / `rdm_delete_metadata` (server-side settings.edit re-check). Audit actions: `regulatory_data.metadata.created|updated|retired|reinstated|deleted`.
- Exactly one active default resolution policy and one active default registry-failure policy.
- Relationship types are typed edges only; quantitative ownership (percentages, voting rights, effective control, history) is a separate Phase 2+ model.
- Duplicate entities are never auto-merged; they become resolution cases (Phase 2).
- Phase 2 must pin `applications.form_version_id` prospectively at submission only — never back-fill historical rows with a current version.
- RBAC: read = settings.view, write = settings.edit (held only by super_admin, system_administrator, legacy_admin). A dedicated module permission is deferred until the model has runtime effect.

Phase 0 baseline facts: 23 entities / 23 licences (1:1 via `licensees.license_id`), 43 FKs referencing `licensees`, 122/122 applications with NULL `form_version_id`, 4 duplicate entity names, 5 distinct `form_type` values across 55 templates.
