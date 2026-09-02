# DMS Phase 3 — User Interface (UI only)

Build the Document Management user interface on top of the accepted Phase 2 governed service (`src/services/dms.ts`). No migrations, no permission redesign, no backend inspection, no certification run.

## 1. Document Register

New screen: **Documents → Document Register**.

- Data source: `searchDocuments()` (`dms_search_documents`) — server-side search, filter, pagination.
- Built with the existing `EnterpriseDataGrid` so it matches every other regulatory register.
- Columns: Document reference, Document name, Document type / category, Linked context (entity / case / application in business words), Classification, Verification, Acceptance, Scan state, Legal hold, Owner / uploader, Uploaded / updated date, Archive state.
- Filters: free-text search, category, document status, "include archived" toggle.
- Row click opens the detail screen. Row actions are permission-aware.
- Loading skeleton, error panel with retry, empty state ("No documents match these filters").

## 2. Document Detail

New screen: **Document Register → document**.

- Data source: `getDocument()` (`dms_get_document`).
- Sections: Overview (metadata, dates, reporting period, tags), Canonical context (owning entity + source record with a link where the platform already has that screen), Classification & retention, Verification, Acceptance, Linked records, Versions & history, Activity / audit trail, Safety panel (scan state + legal hold).
- Legal hold and un-scanned states render as prominent banners and disable the actions the server would refuse anyway.

## 3. Governed actions

Every action calls the existing service function; no table writes anywhere.

| Action | Service |
| --- | --- |
| Edit document details | `updateDocumentMetadata` |
| Classify | `classifyDocument` |
| Verify / reject verification | `verifyDocument` |
| Accept / conditionally accept / reject | `acceptDocument` |
| Archive / restore | `archiveDocument` / `restoreDocument` |
| Delete (soft) | `softDeleteDocument` |
| Link to a record | `linkDocumentToRecord` |
| Search / open | `searchDocuments` / `getDocument` |

Failures are shown through `describeDmsError()` so users never see a raw error code. Destructive actions (archive, delete) use the existing SweetAlert confirmation convention with a reason field.

**Note:** the backend exposes no unlink operation, so "unlink" is presented as not available in this phase rather than faked client-side. Flagged as the only scope reduction.

## 4. Context linking

A "Link to a record" dialog lets an authorised user attach an existing document to a canonical context — regulated entity, complaint, licensing application, investigation, return, correspondence, or another supported context type — by selecting the record from existing pickers. It always links the existing document; it never creates a second document record. Cross-scope refusals from the server surface as a clear permission message.

## 5. Multi-file identity

The register groups nothing client-side: each canonical document renders as its own row keyed on its own reference, so two files uploaded through one multi-file form field stay two distinct documents with independent versions, classification and status. Verified by inspecting a known multi-file upload in the register.

## 6. UX rules applied

No UUIDs, raw enums or RPC names in the UI — all codes pass through business-language label maps and the existing `StatusBadge` tone system. Every screen has loading, error, empty and read-only states. Actions hidden or disabled by permission. Legal hold and unsafe/unscanned states are visually unmistakable.

## 7. Navigation

Add a **Documents** entry (Document Register) to the existing regulatory sidebar alongside the other registers, gated on the `document_management` module — no parallel admin-only module. The current `/documents` store screen stays exactly as it is (legacy dual-read), untouched.

## Technical notes

- New files: `src/pages/documents/DocumentRegister.tsx`, `src/pages/documents/DocumentDetail.tsx`, `src/components/documents/dms/*` (status badges, action dialogs, link-record dialog), `src/hooks/useDmsDocuments.ts`, `src/lib/presentation/dmsLabels.ts`.
- Routes registered in `src/routes/dashboardRoutes.tsx`: `/documents/registry` and `/documents/registry/:documentId`, guarded by the module route guard.
- `document_management` added to `KNOWN_PERMISSION_MODULES` and the route→module map in `src/lib/permissionModules.ts` (frontend registry only).
- Server capability checks reuse `useCan('document_management', …)`.
- Verification for this turn: typecheck and build only.

## Deliverable

Report A–H (UI complete, Register, Detail, Governed actions, Context linking, Multi-file identity, typecheck/build, blockers). No DMS certification.
