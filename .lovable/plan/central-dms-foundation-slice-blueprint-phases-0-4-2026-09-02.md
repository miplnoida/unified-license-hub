# Central DMS — Foundation Slice (Blueprint Phases 0–4)

Goal: give every regulated entity one governed documentary record, by **extending** the existing `document_groups` / `document_versions` / `document_action_logs` model. No parallel document subsystem, no removal of current upload flows.

Scope agreed: Phases 0–4. Legacy sources stay dual-read. Publication workflow deferred (fields modelled, no workflow, no public exposure).

## Verified current state

- Tables that exist: `documents` (3 rows), `file_uploads` (19), `document_groups` (17), `document_versions` (18), `document_action_logs` (18).
- `document_groups` today has only: entity_type, entity_id, document_type, display_name, owner_id, current_version_id, is_deleted, metadata, form_id, field_id, submission_id, document_label, status — no category, classification, verification, acceptance, retention, publication, or document reference.
- Missing entirely: `document_categories`, `document_types`, `document_relationships`, `document_retention_policies`, `document_holds`.
- Governed write path already exists: SECURITY DEFINER `create_document_version_metadata`, used by `src/lib/documentVersioning.ts` (checksum, safe path under `{auth.uid()}/form-management/…`, scan/quarantine fields on `file_uploads`).
- No `document_management` permission module in `sec_permissions`; only per-module `upload_documents` keys under licensing, returns, complaints, fit_and_proper.
- `src/pages/admin/LicenseeDetail.tsx` has 9 tabs and **no** Documents tab.
- `/documents` (DocumentStore) is client-side merge; `src/hooks/useApplicationDocuments.ts` already reconciles 4 sources and dedupes by storage path.

## Phase 0 — Source inventory and taxonomy sign-off (no code)

Produce `docs/dms/00_source_inventory.md` classifying every document source (documents, file_uploads, document_groups, form JSON refs, complaint evidence, conduct evidence, correspondence attachments, payment docs, certificates) as: migrate / link-only / keep module-local / exclude / manual review. Also record the agreed category and type list. Nothing downstream starts before this file is reviewed.

## Phase 1 — Canonical schema (additive migrations only)

New tables (each with GRANTs + RLS + policies):

- `document_categories` — code, name, parent_id, domain, default confidentiality / publication eligibility / retention policy, requires_verification, requires_acceptance, is_active, sort_order. Seeded with the 15 blueprint categories.
- `document_types` — category_id, code, name, defaults, `metadata_schema` jsonb, is_active.
- `document_relationships` — document_group_id, relationship_type, target_type, target_id, target_reference, is_primary.
- `document_retention_policies` and `document_holds` — created and enforced as constraints on disposal, operational reporting deferred to Phase 10.

`document_groups` gains nullable columns (no existing column dropped or renamed): `document_reference` (unique, `DOC-YYYY-NNNNNN` from a sequence), category_id, document_type_id, primary_entity_id, owner_type, owner_id, sector_id, license_id, source_module, source_record_type, source_record_id, source_reference, document_status, verification_status, acceptance_status, confidentiality_classification, publication_eligibility, publication_status (default `not_requested`), document_date, effective_from/until, expiry_date, reporting_period_start/end, retention_policy_id, retention_start_date, retention_until, disposition_status, legal_hold_status, tags, archived_at/by, created_by, updated_by.

`document_versions` gains: version_status, effective_from/until, superseded_at. Existing 17 groups / 18 versions are backfilled in the same migration with `document_reference`, defaults of `Other` category, `entity`-level confidentiality, `not_publishable`, and status derived from current values — so nothing becomes invisible.

Classification, status, verification and acceptance values are constrained enum-style CHECKs matching blueprint §5, §7, §8.

## Phase 2 — Governed service layer

New `document_management` permission module in `sec_permissions` with the blueprint keys (view, view_entity, view_internal, view_restricted, upload, download, create_version, edit_metadata, classify, verify, reject, accept, archive, restore, manage_retention, manage_hold, delete, audit_view, bulk_manage). Publication keys are registered but unused this slice.

SECURITY DEFINER RPCs (all permission + scope checked server-side, all writing `document_action_logs` with before/after):

- `dms_register_document` / `dms_add_version` — wrap and reuse `create_document_version_metadata`; never overwrite an existing version.
- `dms_update_metadata`, `dms_classify`, `dms_verify`, `dms_accept`, `dms_archive` / `dms_restore`, `dms_link_record`, `dms_soft_delete`.
- `dms_list_entity_documents(entity_id, filters, page)` and `dms_search_documents(...)` — server-side filtering and pagination.
- `dms_get_document(id)` — overview, current version, version history, relationships, audit trail.

Guards enforced in SQL: no preview/download/verify/accept unless the version's `file_uploads.scan_status` is clean and `is_quarantined` is false; accepted regulatory evidence cannot be hard-deleted; a document under legal hold cannot be disposed.

Client wrapper `src/lib/dms/` (service + typed hooks). `src/lib/documentVersioning.ts` keeps its current public API and delegates to the new RPCs.

## Phase 3 — Entity Documents workspace

- New **Documents** tab in `LicenseeDetail.tsx` (added after `licenses`, existing tabs untouched): summary counters, server-side filters, and the blueprint column set.
- New document detail workspace `src/pages/documents/DocumentDetail.tsx` with tabs Overview, Current Version, Version History, Related Records, Access & Privacy, Retention, Audit Trail. Publication tab is rendered read-only ("workflow not enabled").
- `DocumentStore.tsx` (`/documents`) is switched to `dms_search_documents` server-side paging, keeping its current route and permission gate.
- Route/menu additions are guarded by the new `documents.view*` permissions.

## Phase 4 — Registration & licensing integration

- Registration, pre-licensing and post-licensing uploads keep their existing components and validation; they additionally pass category/type/source so a canonical document + relationship row is created, and get linked to the entity once the entity is provisioned.
- Application → Documents and Entity → Documents → Licensing render the **same** logical document (one physical file, two relationships).
- `useApplicationDocuments.ts` keeps reading all four sources (dual-read), but prefers the canonical record when present so nothing renders twice.
- Licence certificates are registered as canonical documents marked `public_eligible` but left unpublished.

## Regression safety

Enforced as explicit rules for the work: no existing column dropped, no upload component removed, no change to application/licensing workflow status logic, return calculations, complaint workflow or payments; bucket stays private; scan/quarantine controls only tightened; no service role in the browser; legacy tables retained; existing signed-URL download paths keep working throughout.

## Verification

- `scripts/verify-dms-foundation.sql` — schema presence, backfill completeness (every group has a reference, category, classification), permission registration, RPC grants (no `anon`), scan-gate and legal-hold negative cases, one-current-version invariant.
- Vitest: extend `src/test/documentVersioning.test.ts` and add service tests for classification/verification/acceptance transitions, version creation, relationship linking.
- Persona RLS checks: entity user cannot read regulator-internal or restricted documents; anonymous cannot read anything.
- Regression run: existing registration submit, application submit, return submit and complaint suites, plus typecheck and build.

Identity and integrity cases (each an explicit assertion):

- Two files uploaded into one multi-file form field produce **two** logical documents, not one grouped document.
- Adding a new version preserves the same `document_reference` and group id; only the version number advances.
- Re-registering the same physical storage path (retry, double submit) does not create an accidental duplicate version — the checksum + path guard returns the existing version.
- Entity association can move unresolved → resolved (application document later linked to a provisioned entity) without changing document identity, reference or version history.
- When the original owner/uploader loses their portal relationship, the entity's document remains available to other authorised entity users.

Access and classification cases:

- A migrated document of unknown category defaults conservatively (`Other`, entity-level confidentiality, `not_publishable`) and never widens access relative to its source row.
- `publication_eligibility = public_eligible` with `publication_status = not_requested` is **not** readable anonymously.
- An archived or soft-deleted document disappears from ordinary listings but remains fully visible in version history and audit trail.
- Changing category or type recalculates defaults only where no explicit override was recorded; overridden classification, retention or eligibility values are preserved.

Scope and cross-entity cases:

- Creating a relationship across two entities is rejected unless the actor has scope for both contexts.
- A document belonging to an application for entity A cannot be attached to entity B.

Dual-read case:

- The existing `/documents` route continues to list legacy-only records (rows with no canonical document) throughout the dual-read period, with no duplicates against canonical rows.

## Out of scope this slice

Publication approval workflow and public registry documents (Phase 8), legacy backfill of `documents` / `file_uploads` into canonical records (Phase 9), retention/hold operations and DMS reports (Phase 10), OCR/AI (Phase 11), and admin configuration screens for categories/types/retention — the tables are seeded by migration for now.
