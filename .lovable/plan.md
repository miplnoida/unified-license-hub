# Complaint Case Management — Entity RFI Response Workbench

Complaints currently have no Request-for-Information object at all: the only RFI tables in the database are application-scoped (`application_rfis`, `application_rfi_items`, `application_rfi_responses`), and `ComplaintDetail` exposes only Overview / Investigation / Actions / Communications / Tracking. Entity replies therefore flow through generic correspondence threads with no per-question structure. This plan adds a dedicated complaint RFI cycle for the regulator and a response workbench for regulated entities.

## What the regulator gets

- A new **Information Requests** tab on the complaint case file.
- Raise an RFI against the complaint's linked licensee: due date, covering summary, and a list of numbered questions. Each question specifies whether it needs text, documents, or both, and whether it is mandatory.
- Live progress per RFI (answered / total, overdue flag), review of every entity submission with its attachments, and the ability to accept an RFI as satisfied or send a question back for clarification.
- Close an RFI with closure notes; closing is recorded in the complaint audit trail.

## What the regulated entity gets

- A new **Information Requests** area in the licensee portal listing every RFI issued against their entity, with status, due date, and outstanding-question count.
- A workbench per RFI: each question rendered as its own card with a response text field, its own attachment slots (reusing the existing secure upload path and 5-file / 20MB limits), and a saved-draft state.
- A **Submit for review** gate: drafts stay editable and private to the entity; submission is blocked until every mandatory question has a response (and a document where the question requires one). On submit, all answers are locked, the RFI moves to `submitted`, and the case officer is notified.
- Read-only history of prior submissions when the regulator sends a question back for clarification.

## Notifications

Three new event configurations, wired through the existing notification event queue: RFI issued to entity, RFI response submitted to the regulator, RFI due-date reminder (reusing the existing near-due sweep pattern).

## Technical detail

Database migration (mirrors the proven application-RFI shape):
- `complaint_rfis` — complaint_id, licensee_id, raised_by/at, due_at, summary, status (`open`/`submitted`/`closed`/`cancelled`), closure notes/by/at, timestamps + update trigger.
- `complaint_rfi_items` — rfi_id, ordinal, prompt, question_type (`text`/`document`/`both`), required, response_status (`pending`/`draft`/`responded`/`returned`).
- `complaint_rfi_responses` — rfi_item_id, response_text, file_upload_ids[], submitted_by, submitted_at, is_draft.
- GRANTs for `authenticated` and `service_role` on all three, RLS enabled, and policies that reuse existing helpers: internal read/write via `has_complaint_perm` scoping used by `complaints`, entity read/write via `can_current_user_access_licensee(licensee_id)`. Draft rows are never visible to internal staff.
- RPCs: `complaint_rfi_raise`, `complaint_rfi_save_draft`, `complaint_rfi_submit` (server-side enforcement of the mandatory-answer gate, sets item + RFI status atomically), `complaint_rfi_return_item`, `complaint_rfi_close`. All `SECURITY DEFINER`, `set search_path = public`, with authorization checks inside and audit rows written via the existing audit helper.
- Attachments: files uploaded with `secureUpload` into `secure-documents` under the complaint context; `file_uploads` ids stored on the response and linked to the complaint evidence repository on submit, so regulator-side viewers keep working with signed URLs.

Frontend:
- `src/hooks/useComplaintRfis.ts` — query/mutation layer for both personas.
- `src/components/complaints/rfi/ComplaintRfiTab.tsx`, `RaiseComplaintRfiDialog.tsx`, `ComplaintRfiReviewCard.tsx` — regulator side, mounted as a new tab in `src/pages/complaints/ComplaintDetail.tsx`.
- `src/pages/entity/complaints/MyComplaintRfis.tsx` and `MyComplaintRfiWorkbench.tsx` — entity side, using the existing `ComplaintAttachmentsField` for attachment slots.
- Routes added in `src/routes/dashboardRoutes.tsx` under `/entity/complaint-rfis` guarded by the complaints portal area, plus a sidebar entry in `src/config/navigation.tsx` for licensee roles.
- `can_respond_rfi` added to the `complaints` portal area capability list in `src/lib/portalAccess.ts` and `src/hooks/useExternalPortalAccess.ts` so the workbench is permission-gated like the licensing RFI flow.

Verification before claiming done:
- pgTAP suite `supabase/tests/complaints/17_rfi_workbench.sql`: table/GRANT/RLS structure, entity cannot see another licensee's RFI, internal staff cannot see drafts, submit RPC rejects missing mandatory answers, submit locks items, close records audit.
- `tsgo` typecheck plus a live round trip against a real complaint: raise → entity draft → blocked submit → complete submit → regulator review → close, then removal of the test rows.

No existing correspondence, complaint workflow, or application RFI behaviour is modified.
