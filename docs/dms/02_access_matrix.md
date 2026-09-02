# DMS — Access Matrix (as implemented)

All reads and writes go through governed `SECURITY DEFINER` RPCs in the `document_management` permission module. The client never mutates `document_groups` / `document_versions` directly.

## 1. Visibility (`dms_can_view_document`)

| Caller | Sees |
|---|---|
| Anonymous | Nothing. Every path requires `auth.uid()`. `public_eligible` with `publication_status = 'not_requested'` is **not** anonymously accessible. |
| Document owner / uploader | Their own document, whatever its classification. |
| Regulatory staff (`is_doc_staff`) | `public` + `entity` documents; `regulator_internal` with `view_internal`; `restricted` / `confidential` / `legal_privileged` with `view_restricted`. |
| Entity portal user | `public` / `entity` documents whose `primary_entity_id` they have access to (`can_current_user_access_licensee`) — so an entity document survives the original uploader losing their portal relationship. |
| Super admin | Everything. |

Unresolved documents (`primary_entity_id IS NULL`) are visible to the owner and to staff only — resolution never broadens access retroactively beyond the entity's own scope.

## 2. Actions (`dms_assert_can_manage`)

| Action (`document_management.*`) | Who |
|---|---|
| `view`, `download` | Visibility rule above; owner implicitly. |
| `edit_metadata`, `upload`, `create_version` | Permission holders; owner on their own document. |
| `classify`, `verify`, `accept` | Permission holders only (never the owner implicitly). |
| `archive`, `restore`, `soft_delete` | Permission holders; blocked while a legal hold is active. |
| `link_record` | Permission holders; entity targets require scope over **both** contexts, otherwise `cross_entity_link_forbidden`. |
| `bulk_manage` | Bulk operations and context reconciliation (`dms_reconcile_context`). |
| `view_internal`, `view_restricted` | Confidentiality escalation only. |

No `documents.*` permission namespace exists — the module is `document_management` throughout, including the new resolution and reconciliation actions, which reuse `edit_metadata` and `bulk_manage`.

## 3. Safety gates (unchanged by this slice)

- DMS-managed uploads enter `file_uploads.scan_status = 'pending_scan'`; only the trusted scan-verdict writer may release a file.
- Verify / accept / download are blocked until the current file has passed security release; `suspicious`, `infected`, `quarantined` and `unknown` remain blocked.
- Disposal (archive / soft delete) is blocked while a legal hold is active.
- Archived or soft-deleted documents disappear from ordinary listings but remain in `document_action_logs` history.

## 4. Route access

| Route | Audience |
|---|---|
| `/documents` | Internal staff → canonical Document Register (`document_management` module). External portal users → existing document self-service screen. |
| `/documents/registry`, `/documents/registry/:id` | `document_management` module. |
| `/documents/legacy-store` | Legacy technical store (external portal capability), retained for dual-read. |
| Entity → Documents tab | Entity workspace listing; rows are filtered by the register's own visibility rules. |

## 5. Residual

Relationship unlink is deliberately not implemented (server-side rules for de-linking a governed record are not defined yet); publication approval workflow is out of scope.
