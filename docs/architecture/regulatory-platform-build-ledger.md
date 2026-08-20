# Regulatory Platform Build Ledger — RDM-ENTITY-001

Single running record of what has been delivered for the Regulatory Data Model /
Entity programme, in delivery order. Each entry states the outcome and the
authoritative artefacts, so a later wave never has to re-derive intent.

## Phase 0 — Architecture discovery
- Catalogued existing identity surfaces (`licensees`, `applications`, `profiles`,
  `pre_license_users`) and their overlapping notions of "entity".
- Naming standard: `docs/architecture/regulatory-data-naming-standard.md`.
- Migration approach: `docs/architecture/regulatory-data-migration-plan.md`.

## Phase 1 — Metadata foundation
- 12 metadata tables (data domains, classification schemes/values, lifecycle
  stages, identity statuses, identifier types, authority rules).
- Writes are RPC-only (`rdm_save_metadata` family, `SECURITY DEFINER`); key
  immutability and scope declarations are enforced server-side.

## Phase 1.1 — Governance hardening & diagnostics
- `rdm_integrity_report()` plus 18 pgTAP assertions.
- Admin surface: `DataIntegrityPanel.tsx`.

## Phase 1.2 / 2A — Canonical party & multi-licence model
- `parties` + `organizations` as the canonical identity spine.
- `entity_licenses` links an entity to many licences over time.
- **Transitional rule (still in force):** `licensees.id` IS the local
  regulatory Entity UUID. Never introduce a second entity key.
- Backfill mapped every licensee to an organization and every legacy licence to
  `entity_licenses`.

## Phase 2A.1 — Semantic corrections
- A licence number is NOT an entity identifier; those rows were removed.
- Normalization is engine-led via `public.normalize_entity_identifier()` driven
  by `entity_identifier_types.normalization_strategy`.
- Entity deletes are `RESTRICT`; `entity_licenses.effective_from` is `NOT NULL`.

## Phase 2B — External registry foundation
- Pluggable registry: bindings, snapshots, sync states, sync conflicts,
  failure policies, external references.
- Provider-agnostic reads: `entity_registry_search`,
  `entity_registry_entity_dto` (local provider today).

## Wave A — Entity operations, resolution, membership, canonical security
1. **Canonical security** — authorization stays on the `sec_*` tables;
   `sec_get_user_context()` is the single source for roles, permissions,
   scopes, the route registry and the navigation tree.
2. **Role templates as configuration** — `sec_role_templates` /
   `sec_role_template_permissions`; the static list in `RoleManagement.tsx` is
   an offline fallback only.
3. **Roles** — 23 standard internal roles seeded, reusing existing roles where
   semantically identical.
4. **New modules** — `entity_resolution`, `entity_membership`,
   `regulatory_data_model`, `integration_management` with their permissions.
5. **Membership** — `entity_user_memberships`, lifecycle
   `REQUESTED → VERIFIED → APPROVED → REVOKED` via governed RPCs
   (`entity_membership_request/verify/approve/reject/revoke`). Approved
   membership is what grants an external user access to an entity's data.
6. **Resolution engine** — `entity_resolve_identity` returns
   `EXACT_MATCH | POSSIBLE_MATCH | NO_MATCH | PROVIDER_UNAVAILABLE`;
   `entity_resolution_decide` records officer decisions;
   `entity_merge_preview` / `entity_merge_execute` perform controlled merges
   that preserve lineage via `merged_into_entity_id`.
7. **UX**
   - `/entities` — Regulated Entity Directory (`EntityDirectory.tsx`).
   - `/licensing/entity-resolution` (+ `/:caseId`) — resolution workspace.
   - `/admin/entity-memberships` — membership review queue.
   - All reads go through `src/services/entityRegistry.ts`; the frontend never
     queries `licensees` / `entity_*` directly for identity work.
8. **Cutover (entity-id-first)**
   - `create_application_draft` binds each new draft to the caller's canonical
     entity (approved membership → profile entity → owned entity).
   - `provision_application_entity` resolves or creates the entity *before* the
     licence is attached, reuses an existing entity on exact normalized legal
     name, follows merge pointers, and links the licence through
     `entity_link_license` (renewals included).
   - `entity_membership_directory(text)` lets an external user find their
     organization by name/identifier (name only — no supervisory data) in order
     to request membership.

## Invariants for future waves
- One entity key: `licensees.id`.
- Licence ≠ identity. Identifiers are typed, normalized and scoped.
- Every identity state change is an RPC with audit + provenance; no direct
  table writes from the client.
- Menu visibility is discoverability only — RLS, RPC checks and route guards
  are the enforcement layer.
