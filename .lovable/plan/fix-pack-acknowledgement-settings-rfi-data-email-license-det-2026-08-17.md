# Fix pack: acknowledgement, settings, RFI data & email, license detail

## 1. Applicant acknowledgement — trim fields (PDF + on-screen)
Remove from both the generated PDF and the applicant panel view:
- Submission version
- Acknowledgement status
- Current status / current stage
- Applicant declaration

The remaining content stays: application reference, submitted date & time, applicant/entity, contact, licence/service, and the receipt disclaimer. Existing PDFs are regenerated for new submissions only; old stored files remain untouched.

## 2. Admin side — no acknowledgement section
The "Download acknowledgement" / system-generated acknowledgement block on the Application Detail Documents tab will render only for applicant/licensee users. Internal users no longer see it (code retained, just not rendered internally).

Document viewing: you confirmed it works again now. Its earlier failure is explained by storage read rules — internal staff can only open files in the secure bucket if they are super admin, own the folder, or hold "view all entities"/audit view permission. To make this reliably work for reviewers, the read rule will also allow staff holding application, complaint or return view permission. No UI change.

## 3. Settings — remove Schedule card
Remove the Schedule card from the Settings hub. The Schedule page and its route stay in place (just not linked from the hub).

## 4. Settings — License Expiry & Renewal as a list
Convert the page from one long stacked editor into a table of configured rules:
- Columns: scope (Sector / Sub-sector / Category), renewal cycle, validity days, reminder days, grace period, notify officer.
- Row actions: View (read-only dialog) and Edit (dialog with the existing fields), plus Add rule and Delete.
- Saving behaviour, storage shape and the resolver used elsewhere stay exactly as today (no history/versioning added, per your answer).

## 5. Application queue detail — stale form data after RFI
Symptom to fix: applicant edits and resubmits after an RFI, admin still sees pre-RFI values.

First step is a targeted check of one affected application (compare what the applicant last saved against what the admin view reads), because two mechanisms can produce this and only the data will say which:
- the applicant's save silently not persisting (update matched no row), or
- the admin view rendering the form on a pinned older form version whose field keys differ.

The fix follows the confirmed cause: guarantee the applicant save reports failure instead of a false "saved" toast and persists on the correct record, and make the admin view always read the latest saved values. Verification is a live re-check of the same application after the fix.

## 6. RFI email body shows raw markup
The stored `application.rfi_raised` email template contains literal `\n` escape text and conditional `{{#summary}}…{{/summary}}` blocks the renderer does not understand, so they print as-is. Fix:
- Rewrite that template (and the small number of sibling templates with the same problem) to real line breaks and plain placeholders, so it renders in the standard branded email layout like other emails.
- Harden the renderer so any literal `\n`/`\t` text and leftover conditional blocks are normalised before the email is built — future templates cannot leak markup.

## 7. Entity detail → License detail
Hide the "Certificate Signing & Dispatch" panel (component kept in the codebase, simply not rendered).

## Technical notes
- Files: `supabase/functions/application-acknowledgement/index.ts`, `src/components/applications/SubmissionAcknowledgementPanel.tsx`, `src/pages/applications/ApplicationDetail.tsx`, `src/pages/settings/SettingsHub.tsx`, `src/pages/settings/LicenseExpirySettings.tsx`, `src/pages/licenses/LicenseDetail.tsx`, `src/pages/ApplicationForms.tsx`, `supabase/functions/dispatch-notification-event/index.ts` + `_shared/email-layout.ts`.
- Database: template body updates, and a storage read-policy widening for internal reviewers.
- Nothing else in workflow, notifications routing, or licensing logic changes.
