# DMS — Canonical Mapping (as implemented)

Scope: Central DMS Foundation (Blueprint phases 0–4) after the Phase 3/4 closure slice.
Principle: one physical file → one logical document group → one or more versions. Legacy sources stay readable (dual-read). No parallel document subsystem.

## 1. Logical document identity

| Rule | Implementation |
|------|----------------|
| Two files in one multi-file field are two logical documents | The find-or-create key includes `display_name` (the original file name), both in `create_document_version_metadata` and the client probe in `uploadVersionedDocument`. |
| Re-uploading the same file name is a new version of the same document | Same logical key → existing group → `version + 1`, same `document_reference`. |
| The same physical storage path can never create a duplicate version | `create_document_version_metadata` and `dms_register_certificate` both return the existing version when `document_versions.storage_path` already exists. |
| A document reference never changes | `document_reference` is written once at group creation; entity resolution, classification and versioning never rewrite it. |

## 2. Source → canonical mapping

Derived client-side by `src/lib/dmsContext.ts` (`deriveDmsContext`) and applied server-side by `dms_register_source_context`.

| Upload `entityType` | `source_module` | `source_record_type` | Default category | Default type |
|---|---|---|---|---|
| `registration`, `pre_registration`, `registration_form` | `registration` | `registration` | `corporate_registration` | `application_supporting_document` |
| `application`, `pre_license_application`, `post_license_application`, `form_submission` | `licensing` | `application` | `licensing` | `application_supporting_document` |
| `entity`, `licensee` | `entity` | `entity` | `other` | `general_document` |
| anything else | as given | as given | `other` | `general_document` |
| licence certificate issuance (system) | `licensing` | `license` | `licence_certificates` | `licence_certificate` |

Confidentiality, publication eligibility, retention, verification and acceptance defaults come from the type, then the category — and only where no explicit override is recorded in `classification_overrides`.

## 3. Owning entity resolution

The client never supplies an owning entity id (an application id is not an entity id).

1. `dms_register_source_context` calls `dms_resolve_source_entity(source_record_type, source_record_id)`.
2. Resolution order: `applications.entity_id` → `licenses.application_id → entity_licenses.entity_id`; registrations resolve through `registration_licensing_handoffs → application`.
3. A resolved id is only written when it exists in `licensees` **and** the actor is privileged (`super_admin` / `document_management.bulk_manage`) or has scope over that entity.
4. Unresolved documents keep `primary_entity_id = NULL` and `canonical_context_status = 'retry_required'`. Nothing is fabricated.
5. `dms_resolve_entity(group, entity)` and `dms_reconcile_context(limit)` later attach the entity to the **same** group — same document, same reference, no second version.
6. `document_groups.primary_entity_id` is a foreign key to `licensees(id) ON DELETE RESTRICT`.

## 4. Context observability

| Column | Meaning |
|---|---|
| `canonical_context_status` | `pending` (registered, context not yet applied), `applied`, `failed`, `retry_required` (entity still unresolved), `not_applicable`. |
| `context_failure_reason` | e.g. `owning_entity_unresolved`. |
| `context_attempts`, `context_last_attempt_at` | Retry accounting; reconciliation is idempotent. |
| `classification_source` | `taxonomy_default`, `explicit_override`, `legacy_conservative`, `system_registered`. |

A context failure never fails the upload: the physical file and the document row are already safely registered, the failure is visible in the register ("Filing completeness" filter) and recoverable through "Retry entity filing" (`document_management.bulk_manage`).

## 5. Application ↔ entity dual visibility

One group only. Visibility to both contexts comes from `document_relationships` rows (`belongs_to/entity`, `attached_to/application|license`), which `dms_search_documents` honours. There is no duplicate group, duplicate file or duplicate reference.

## 6. Licence certificates

`dms_register_certificate` registers the issued PDF as `document_type = 'licence_certificate'`, category `licence_certificates`, `confidentiality = entity`, `publication_eligibility = public_eligible`, `publication_status = 'not_requested'`. The file stays in the private `license-certificates` bucket, enters `pending_scan`, and no publication workflow or anonymous access exists.

## 7. Out of scope (residual)

Publication workflow, Public Registry publication, relationship unlink, migration of the legacy `documents` table, Returns/Prudential/F&P/complaint evidence integration.
