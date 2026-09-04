# Document Access, Linking and Search Contract (W1A lock)

Principle, recorded permanently:

**CENTRALISED STORAGE / GOVERNANCE + CONTEXTUAL ACCESS EVERYWHERE.**

Officers never leave AML, Licensing, Returns, Examination, Finding, Complaint or Enforcement to
use the central repository. Every module document action consumes the canonical DMS
(`file_uploads`, `document_groups`, `document_versions`, `document_relationships`). No second
storage, no second file table, no module-local canonical document.

## 1. No technical-id user workflows

User-facing workflows must never require a UUID, database id, storage path, bucket, RPC name or
internal table name. Internal identifiers stay behind the service boundary and are produced only
after the officer has chosen a real business record.

Closed in this wave:

| Surface | Before | After |
| --- | --- | --- |
| `LinkRecordDialog` (Document Detail) | free-text "target record ID" | `RecordPicker` — record type, then business search |
| Intervention canonical link | free-text "record identifier" (min 10 chars) | `RecordPicker`, default type derived from the delivery module |

## 2. Two pickers

- **DocumentPicker** — used from a business record: *Add Document* → *Upload New* or
  *Choose Existing*. *Choose Existing* searches authorised canonical documents and creates a
  relationship only.
- **RecordPicker** — used from Document Detail: *Link to another record*. The officer selects a
  record type, then searches actual business records. The internal id is returned only after a
  record is chosen.

## 3. RecordPicker server contract

`public.record_picker_search(_record_type, _search, _entity_id, _page, _page_size)`

- `SECURITY INVOKER`, fixed `search_path`, refuses unauthenticated callers, `EXECUTE` granted to
  `authenticated` and `service_role` only (revoked from `PUBLIC`/`anon`). Visibility is therefore
  the caller's own RLS — the picker can never reveal a record the officer cannot open.
- Each record type is searched by its own statement, so a type the caller has no privilege on
  cannot affect the others.
- Real server paging: 1-based page, page size clamped to 1–100, `total_count` from the same
  filtered population.
- Deterministic context ranking: records for the in-context entity first, then most recent, then
  id as tie-break.
- Business-safe rows only: reference, title, entity name, secondary line, status, date. Ids are
  carried in the payload, never displayed.
- Supported types: regulated entity, licensing application, licence, regulatory return, complaint,
  investigation, examination, supervisory assessment, supervisory finding, enforcement case,
  fit and proper assessment, correspondence.
- **Person is deliberately not offered** until the identity kernel exposes a governed person
  search; `persons` is not reachable by signed-in callers and must not be widened for a picker.

## 4. Action semantics (never silently converted)

| Action | Effect |
| --- | --- |
| Upload new document | new `document_group` + first `document_version` + relationship |
| Add new version | same `document_group` + new `document_version` |
| Choose existing | relationship only |
| Link document to another record | relationship only |

## 5. Context propagation

The current business context (entity, record id, record reference, domain, evidentiary role) is
supplied automatically by the calling workspace and is never re-entered by the officer.

## 6. Filing exceptions

Upload + register + context + relationship is one operation from the officer's point of view. If
the file lands but contextual filing fails, the upload is never discarded and no link is
fabricated: a recoverable filing exception is recorded and surfaced in business language
("Document uploaded, but filing against this record needs attention.") to an authorised filing
and reconciliation queue.

## 7. Duplicates

No silent merge on filename, hash or title. An identical content hash raises a warning and the
officer may view the existing document, choose it, or continue as a distinct document. Business
provenance determines identity.

## 8. Scale

The picker and register contracts assume server paging and indexed search on document reference,
display name, file name, primary entity, type/category, source module, source reference and
dates. Full-text/trigram support can be added behind the same contract, so 100k+ documents does
not require a UI rewrite.
