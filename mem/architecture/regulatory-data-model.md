---
name: Regulatory Data Model (RDM-ENTITY-001)
description: Entity-first regulatory architecture programme — Phase 0 baseline and Phase 1 configurable metadata tables, admin hub, and phase boundaries
type: feature
---
Programme RDM-ENTITY-001 evolves the platform to an entity-first regulatory model.

Delivered (Phase 0 + Phase 1 only — do NOT implement Phase 2+ without explicit instruction):
- Docs in `docs/architecture/`: naming standard, entity-registry architecture, form→entity data flow, migration plan.
- 12 configuration tables: classification_schemes, classification_values, lifecycle_stages, entity_identity_statuses, relationship_types, role_types, form_purposes, form_trigger_types, data_domains, entity_identifier_types, entity_resolution_policies, entity_registry_failure_policies. All have key/label/sort_order/is_active/is_system, RLS via `rdm_can_read()` (settings.view) and `rdm_can_write()` (settings.edit), and audit triggers into `audit_logs`.
- Read-only diagnostics: `rdm_integrity_report()`, `rdm_diag_duplicate_entities()`.
- Admin hub: `/admin/regulatory-data-model` (Administration > Configuration), generated from `src/lib/rdm/rdmSchema.ts` via `MetadataTablePanel`.

Rules:
- Business vocabulary is configuration, never enums or hardcoded strings.
- "Entity" is the standard term (currently `public.licensees`); avoid "licensee" for an unlicensed organisation.
- Legal identity vs regulatory status have separate authoritative owners (`data_domains.default_authority`); regulatory status is always owned by this platform.
- Duplicate entities are never auto-merged; they become resolution cases (Phase 2).

Phase 0 baseline facts: 23 entities / 23 licences (1:1 via `licensees.license_id`), 43 FKs referencing `licensees`, 122/122 applications with NULL `form_version_id`, 4 duplicate entity names, 5 distinct `form_type` values across 55 templates.
