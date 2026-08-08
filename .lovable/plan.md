# Fix Submission Acknowledgement Placement (Applicant-First)

## What the inspection found

Traced end to end: submit (`verify-and-submit`) → idempotent `ensure` call into the `application-acknowledgement` function → `ensure_submission_acknowledgement` writes one row per (application, submission version) → PDF rendered once into the `documents` storage bucket → read/download only through that function, which authorises every call with the canonical `can_read_application` predicate.

Confirmed current state:

- The artifact and its authorisation already work for applicants. The function checks `can_read_application`, not role, so the owning applicant is permitted; downloads go through short-lived signed URLs. **No backend or access change is needed.**
- The acknowledgement is generated once per submission (unique per submission version, PDF only rendered when no document path is stored), so views/downloads never duplicate it. The latest submitted application already has exactly one v1 record with a stored PDF.
- The single existing panel (`SubmissionAcknowledgementPanel`) is mounted only on the application Details tab and is written in operational language: mail-provider delivery state, failure reasons, retry/checksum details, "Regenerate document". That is internal support content, and it is what an applicant currently sees — there is no applicant-oriented "Download Submission Acknowledgement" surface.
- After a successful submit the applicant only gets a toast and is dropped on the application page with no acknowledgement affordance.
- The Documents tab lists uploaded attachments only; the acknowledgement is not exposed as a system-generated artifact anywhere.

Root cause is therefore frontend placement and presentation, not access control.

## What will change (frontend only)

### 1. One artifact, two presentations
Give the existing acknowledgement panel a `variant` of `applicant` or `internal`. Both read the same record through the same hook and download the same stored PDF version — no second implementation, no second record.

- **Applicant variant**: application reference, submitted date + time (shared `formatDateTime`), submission status, and a single **View / Download Submission Acknowledgement** action. While no document exists yet it shows the truthful state "Acknowledgement being generated" and triggers the existing idempotent `ensure` once instead of claiming a document exists. No provider/delivery-engine wording, no failure reasons, no checksum, no internal IDs, no "Regenerate".
- **Internal variant**: keeps everything internal users use today (delivery state, reason, checksum, regenerate) as read-only support content.

### 2. Applicant primary location
On the applicant application detail Details tab the acknowledgement card stays at the top of the Submission summary, in the applicant variant.

### 3. Post-submission experience
After a successful submit, applicant flows land on the application with a `submitted` marker in the URL so the acknowledgement card renders highlighted and scrolled into view, with the download action right there. Submission never fails or blocks because acknowledgement rendering or download is unavailable.

### 4. Applicant document history
Add a read-only "Submission Acknowledgement" system-artifact row to the existing Documents tab (no new document area): title, application reference, generated date + time, version, status, view/download. No edit, replace, delete or upload-over path is offered, and the applicant upload controls are untouched.

### 5. Internal placement demotion
On internal application detail the acknowledgement moves off the primary Details tab into the Documents / artifacts area as a secondary read-only item. Internal access is preserved, not removed.

### 6. Explicitly untouched
Applications queue and all internal lists, analyst/legal/approver workflow panels, submission rules, workflow, SLA, sufficiency, payment, decision gates, decision artifacts, submission notifications (including the recently fixed recipient resolution), audit, RBAC, RLS and storage policies.

## Files expected to change

- `src/components/applications/SubmissionAcknowledgementPanel.tsx` — variant support, applicant-safe fields, shared date/time formatting.
- `src/pages/applications/ApplicationDetail.tsx` — applicant variant on Details, internal variant in Documents, read-only artifact row, post-submit highlight.
- `src/pages/ApplicationForms.tsx` and `src/pages/PostLicenseApplicationForms.tsx` — post-submit navigation marker only (submission logic unchanged).
- Possibly a small read-only artifact row component under `src/components/applications/`.

Backend changes: **None** planned. If runtime testing proves the rightful applicant is blocked, that will be reported before any policy change is made.

## Verification (run in the live app, not just typecheck)

1. Applicant submits an eligible application → acknowledgement available on the success experience; open/download; confirm correct reference, submitted date + time and correct application.
2. Navigate away, reopen the application → same acknowledgement still available; download again; confirm no second record or new version was created.
3. Cross-tenant check: another applicant/entity requesting that acknowledgement is denied by the server, not just by a hidden button.
4. Authorised internal user opens the same application → acknowledgement present as secondary read-only artifact, same version.
5. Regression: submission, submission notification, notification bell, internal and applicant detail pages, no console errors; typecheck, frontend and acknowledgement tests, plus the production build.

A final report with root cause, files changed, backend changes and a pass/fail verification table follows the work.
