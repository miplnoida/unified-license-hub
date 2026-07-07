## Goal

Replace the side-sheet "Open Review" with a dedicated page, and render the applicant's submitted registration details (mailing/physical address, entity-specific data, documents, declarations) on that page. The existing WorkflowPanel keeps working exactly as it does today.

## Scope

- Frontend / presentation only.
- No changes to workflow logic, DB, RLS, edge functions, or approval behavior.

## Changes

### 1. New route + page

- Add route `/admin/registration-review/:registrationId` in `src/routes/adminRoutes.tsx`, guarded by the same `M module="registration_management"` wrapper.
- New file `src/pages/admin/RegistrationReviewDetail.tsx`:
  - Reads `:registrationId` from params.
  - Fetches the full `registrations` row (all columns incl. `mailing_address`, `physical_address`, `same_as_mailing`, `entity_specific_data`, `documents_metadata`, sector/sub-sector/category ids, applicant/contact fields).
  - Fetches the matching `registration_form_configs` schema for the record's sector (reuses the same lookup pattern already used in `PreLicenseeRegistration.tsx`, so labels come from the dynamic schema).
  - Reuses the same workflow hydration logic currently in `RegistrationReview.tsx` (workflow_instance → version/step) so the page can pass `workflowId` etc. to `WorkflowPanel`.
  - Layout: two columns on `lg+`, stacked on smaller screens:
    - Left (main): "Registration Details" card group
      - Header: reference, status badge, submitted date.
      - Section: Applicant & Contact (name, alt name, first/last, email, telephone, username).
      - Section: Sector / Sub-sector / Category (names resolved via existing hooks/queries).
      - Section: Mailing Address (from `mailing_address` jsonb).
      - Section: Physical Address (from `physical_address` jsonb) with a note if `same_as_mailing = true`.
      - Section: Entity-Specific Data — iterate `entity_specific_data`, resolving labels through the dynamic schema (use the same value resolver approach as `useReviewValueResolver`); fall back to a key→value dump for unknown keys.
      - Section: Uploaded Documents — list items from `documents_metadata` with filename, type, and download link when a signed URL/path is available (reuse existing document helpers; no new upload logic).
      - Section: Declarations / flags (`terms_accepted`, `email_verified`).
    - Right (sidebar): existing `WorkflowPanel` (unchanged behavior). Wrap in `ErrorBoundary` same as today. If no workflow attached, show the same warning block that exists today.
  - Includes a "Back to list" button that navigates to `/admin/registration-review`.

### 2. Update `src/pages/admin/RegistrationReview.tsx`

- Remove the `Sheet` drawer and `reviewing` state.
- Change the "Open Review" button to a `Link`/`useNavigate` to `/admin/registration-review/:id`.
- Everything else (filters, table, SLA columns, hydration) stays as-is.

### 3. Presentation helpers

- Small internal helpers in the new page file for:
  - Rendering a jsonb address block as label/value rows.
  - Formatting values via the existing display-only helpers (`resolveDisplayOnlyFieldText`, `isAttachmentValue`) so attachments render consistently with the applicant-side review.
- No new shared library files unless a helper is trivially reusable.

## Out of scope

- No changes to `WorkflowPanel`, approval actions, RLS, or workflow queries.
- No edits to the registration form itself or its submission pipeline.
- No new tables, columns, or migrations.

## Verification

- Navigating from the list opens `/admin/registration-review/<id>` and shows the applicant's submitted details plus the workflow panel.
- Workflow actions still function identically (approve/reject/forward) and refresh state after an action.
- Records without a workflow instance still render details and show the existing "No Registration workflow attached" notice.
