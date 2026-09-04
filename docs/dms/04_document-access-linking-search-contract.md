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

## W1A delivery status (evidence)

| Contract item | Status | Evidence |
| --- | --- | --- |
| Business search picker for records (no technical ids) | Delivered | `record_picker_search` RPC + `src/components/documents/RecordPicker.tsx`; used by the document detail link dialog and the conduct intervention link dialog |
| Choose Existing document from the central register, in context | Delivered | `src/components/supervision/RecordDocumentLinks.tsx` (business search over the register, governed `dms_link_record`) |
| Upload New + link as one governed operation | Delivered (W1A.2) | Canonical ingest `dms_ingest_begin` → controlled storage write → `dms_ingest_finalize`, consumed through `src/services/dmsIngest.ts` (`uploadNewDocument` / `uploadNewVersion`). One officer action registers the file, the document with its own `DOC-…` reference and first version, applies taxonomy defaults/retention and files the canonical relationships. Verified by `scripts/verify-w1a2-dms-ingest.sql` (ING-01..ING-19). |
| Relationship-only semantics for Choose Existing / Link | Delivered | `dms_link_record` creates a `document_relationships` row only; no group or version is created, so no duplicate is produced |
| Proof contexts | Supervision (examination workpapers, data requests) and Licensing Application (documents tab) | `WorkpapersPanel`, `DataRequestsPanel`, `ApplicationDocumentsPanel` |

## W1A governed write closure

| Former client write | Governed operation |
| --- | --- |
| `workflow_instances` insert | `workflow_instance_start` — checks `workflow_management.workflow_action`, derives the first step, audits |
| `delegation_rules` insert / update / toggle / delete | `delegation_rule_upsert`, `delegation_rule_set_active`, `delegation_rule_delete` — check `workflow_management.manage_config`, refuse self-delegation, audit |
| workflow-generated `notifications` insert | `workflow_notification_emit` — resolves the applicant from the record; the caller cannot choose a recipient |
| `return_audit_log` insert | `return_activity_log_append` — the server stamps the author |
| maker-checker decisions | `maker_checker_evaluate` — segregation by default, honours decision-authority rules and active delegations, break-glass requires a rationale |

## Picker type is not the canonical target type

The type an officer chooses in the RecordPicker names a **searchable population**
in business language. The value stored on `document_relationships.target_type`
names the **canonical object** from `docs/architecture/canonical-object-register.md`.
They are deliberately different concepts and must never be conflated: the client
sends only the picker type, and the database resolves the canonical target type
itself in `public.record_picker_target_type`.

| Picker type (UI label) | Canonical source table | `document_relationships.target_type` |
|---|---|---|
| `entity` (Regulated entity) | `licensees` | `entity` |
| `application` (Licensing application) | `applications` | `application` |
| `license` (Licence) | `licenses` | `licence` |
| `return` (Regulatory return) | `return_filings` + `return_filing_versions` | `filing` |
| `complaint` (Complaint) | `complaints` | `complaint` |
| `investigation` (Investigation) | `conduct_investigations` | `investigation` |
| `examination` (Examination) | `examinations` | `examination` |
| `assessment` (Supervisory assessment) | `supervisory_assessment` | `assessment` |
| `finding` (Supervisory finding) | `supervisory_finding` | `finding` |
| `enforcement` (Enforcement case) | `enforcement_actions` | `enforcement_action` |
| `correspondence` (Correspondence) | `correspondence_threads` | `correspondence_thread` |
| `fit_and_proper` (Fit and proper assessment) | `fp_assessments` | `fit_and_proper_assessment` (domain-specific pending Assessment convergence) |

`inspection` is a **retired alias only**. It is accepted at the boundary,
normalised to `examination` immediately (`record_picker_normalise_type`), and
`dms_link_record` refuses `inspection` and `return` outright, so retired
vocabulary can never enter `document_relationships`.

## Authoritative total on an out-of-range page

`record_picker_search` reports `total_count` on result rows only, so a page past
the end of the population carries no total. `public.record_picker_page` returns a
single envelope — `{picker_type, target_type, page, page_size, total_count,
last_page, rows}` — and recovers the total from the same filtered population when
the requested page is empty. The picker owner then repairs to `last_page` and
reloads, so a stale page can never be presented as "no records".

## Linking a picked record

`public.dms_link_picked_record(_group_id, _picker_type, _record_id, _relationship_type)`
is SECURITY INVOKER. It resolves the canonical target type, confirms through the
caller's own row-level visibility that the target exists and is in scope
(`target_not_found_or_out_of_scope` otherwise), and then delegates to
`dms_link_record`, which remains authoritative for document authority
(`dms_assert_can_manage`), entity-scope checks and audit. Reading a record in the
picker therefore grants no linking authority; authority is rechecked on write and
repeated links are idempotent.
