# Complete Central DMS Foundation — Phase 3 & 4 Gap Closure

Verified current state (from repository and database reads):

- Canonical DMS exists: `document_groups` (55 columns incl. `primary_entity_id`, `source_module`, classification/verification/acceptance/publication columns), `document_versions`, `document_action_logs`, categories/types/relationships/retention/holds, plus 17 governed `dms_*` RPCs and `src/services/dms.ts`.
- `dms_search_documents` already resolves entity scope through `primary_entity_id` **or** an `entity` row in `document_relationships`, and gates every row through `dms_can_view_document`. It has no type / source-module / classification / verification / acceptance filters yet.
- `uploadVersionedDocument` accepts an optional `dmsContext`, but **no caller passes one** — registration, FormRenderer and the versioned uploader all upload without DMS context, and a context failure is only `console.warn`ed.
- Data: 17 document groups, all `entity_type = 'application'`, `source_module` set on all 17, and `primary_entity_id` NULL on all 17 — so no row currently violates a foreign key to `licensees(id)`.
- Routes: `/documents/registry` (canonical register, `document_management` module guard), `/documents/registry/:id` (detail), `/documents` (legacy `DocumentStore`, guarded by the **external portal** guard with licensing capabilities). Internal navigation exposes only "Document Register".
- `LicenseeDetail.tsx` has no Documents tab.

## What will be built

### 1. Entity → Documents workspace
- New reusable `src/components/documents/EntityDocuments.tsx` taking `entityId`, built on the governed service layer only (`listEntityDocuments`), with the requested columns (reference, name, category, type, source module, classification, document/verification/acceptance status, current version, document date, created date, publication eligibility/status) and filters (search, category, type, source module, classification, document status, verification, acceptance). Rows link to `/documents/registry/:documentId`.
- Added as a `Documents` tab immediately after `Licenses` in `LicenseeDetail.tsx`, lazy-loaded like the other tabs.
- Server-side scope stays authoritative; visibility is whatever `dms_can_view_document` allows.

### 2. Canonical vs legacy `/documents`
- `/documents` becomes the canonical governed register for anyone holding `document_management.view`; users without it (external portal document self-service) continue to get today's screen unchanged.
- The legacy screen stays reachable at an explicitly named `/documents/legacy-store` route and is relabelled "Legacy Document Store (technical)". Nothing legacy is deleted and dual-read stays.

### 3. Registration → DMS
- Registration upload call site passes DMS context: `source_module = 'registration'`, source record type/id, form/submission relationship, category/type, confidentiality, and `primary_entity_id = NULL` while unresolved.
- New resolution RPC links the *existing* document group to `licensees.id` when a registration resolves to a regulated entity — same group, same document reference, no second document, no fabricated entity id.

### 4. Pre/Post-licensing → DMS
- Application upload call sites (`FormRenderer`, `VersionedDocumentUploader`) pass entity id (when known), application id/number, form id, submission id, sector, licence, source module/record, category and type.
- Application ↔ Entity dual visibility comes from `document_relationships` rows, not duplicate groups or files.

### 5. Licence certificate registration
- Certificate issuance registers the artefact as a canonical document with type `licence_certificate`, linked to entity, licence and the licensing source record, `publication_eligibility = 'public_eligible'` and `publication_status = 'not_requested'`. No anonymous access, no publication workflow.

### 6. Entity integrity
- Add `primary_entity_id → licensees(id) ON DELETE RESTRICT` (safe today: all values NULL). Any future violating rows would be reported, not rewritten. `owner_id` semantics untouched.

### 7. Reliable context registration
- Track `canonical_context_status` (`pending` / `applied` / `failed` / `retry_required`) with failure reason, source module/record and expected entity on the group, written when context application fails instead of a console warning.
- Governed, idempotent reconciliation RPC for authorised staff plus a small admin surface to retry. Retry never creates a second group or version.

### 8. Logical document identity
- Keep the existing logical key (which already includes the original file name) so two files in one multi-file field are two groups, and a deliberate replacement of the same file name is version 2 of the same group. Reconciliation and retries key off the existing group/version ids.

### 9–10. Security and legacy classification
- Scan lifecycle untouched: new uploads stay `pending_scan`, safety is read from the authoritative file scan state, quarantined/suspicious/infected/unknown stay blocked.
- Any classification of legacy rows is conservative (entity-originated → `entity`, staff/internal → `regulator_internal`, unresolved → restricted), never broadening access, with classification provenance recorded.

### 11. Documentation
- `docs/dms/01_canonical_mapping.md` and `docs/dms/02_access_matrix.md`, describing the rules as actually implemented.

### 12. Permissions
- Only `document_management.<action>`; no `documents.*` namespace. New actions (resolution, reconciliation) reuse existing entries where possible.

## Technical detail

- **Migrations (additive only)**: extend `dms_search_documents` with optional type/module/classification/verification/acceptance params; add `canonical_context_status` + failure metadata columns; add the `primary_entity_id` FK; add `dms_resolve_entity`, `dms_reconcile_context` (idempotent), and a certificate registration path; widen action-log verbs if a new verb is needed.
- **Frontend**: `EntityDocuments.tsx`, `LicenseeDetail.tsx` tab, `dashboardRoutes.tsx` route changes, `useDmsDocuments.ts` filter support, `services/dms.ts` new calls, DMS context at the three upload call sites, reconciliation admin panel.
- **Explicitly out of scope**: publication workflow, Public Registry publication, Returns/Prudential/F&P integration, relationship unlink, legacy table/read removal, column renames.

## Verification

- New/extended SQL script `scripts/verify-f8-dms-foundation-closure.sql` covering: entity A/B isolation, restricted classification gating, unresolved registration document without a fabricated entity, resolution preserving group + reference, pre/post-licensing canonicalisation, one logical document per file in a multi-file field, version 2 on the same group, idempotent retry, certificate `public_eligible` + `not_requested` + anonymously inaccessible, pending-scan/quarantine blocking, legal hold blocking disposal, cross-entity link rejection, and legacy dual-read still returning legacy rows.
- Re-run: typecheck, production build, `documentVersioning` and RBAC Vitest, existing `verify-f8-dms-scan-lifecycle.sql`, RLS/persona checks.
- Final gap-by-gap evidence report as requested; nothing is certified complete until every mandatory gap passes, and any unsafe change is reported as a blocker with a compatible alternative instead of being forced.
