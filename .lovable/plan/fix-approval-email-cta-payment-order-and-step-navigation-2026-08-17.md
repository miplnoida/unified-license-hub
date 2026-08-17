# Fix approval email CTA, payment order, and step navigation

## 1. Registration approved email: "Login" button pointing at the login page

Verified in the backend: the approval trigger `trg_registration_approved_notification()` emits `cta_url = '/dashboard'` and `cta_label = 'Open portal'`, while the email renderer falls back to the label "Open Portal" and inserts the URL as-is. A relative `/dashboard` path in an email cannot resolve, and the label is wrong.

Fix:
- Emit `cta_label = 'Login'` and `cta_url = <login_url>` (the absolute portal login URL already resolved from the `portal` site setting, e.g. `https://boj.skntreasury.com/login`).
- Body text keeps the same wording and `{{login_url}}` merge field, so the link in the text and the button agree.
- Verify after the change by re-triggering an approval and reading the dispatch log's rendered HTML to confirm the button reads "Login" and links to the absolute login URL.

## 2. Payment must come after review (New / Continue Application wizard)

The pre-license wizard (`/applications/new`, continue mode) still runs Select Category → Required Forms → Upload Documents → **Payment** → Submit. The post-license flow was already reordered to review-then-pay; this screen was not.

New order: Select Category → Required Forms → Upload Documents → **Review** → **Payment & Submit**.

- Review step: shows documents summary plus the full review of entered data. The user confirms the review ("Confirm and continue to payment"). No submit here.
- Payment step: fee breakdown and payment as today, then the **Submit Application** button, enabled only when payment is complete (or the fee is zero) and the review has been confirmed.
- Back navigation and the "payment pending / already paid" handling stay as they are, just re-pointed at the new neighbours.
- Review confirmation is remembered per application (same session-storage pattern used by the post-license screen) so a reload does not lose it.

## 3. Step rail: only completed steps and the current step are clickable

Today any step after the forms are complete is clickable (documents and payment become reachable together), so a user can jump into payment without having passed documents/review.

New rule: a step is clickable only if it is a step the user has actually finished, and never a step ahead of the current one.

- Select Category — done once the application draft exists.
- Required Forms — done once all required forms are completed.
- Upload Documents — done once the user has moved past it.
- Review — done once the review is confirmed.
- Payment — done once payment is complete (or no fee applies).

The current step stays highlighted (filled primary circle with ring) and is not a link; steps that are not yet done render muted and disabled. Same rule applied to view/continue modes.

## Technical notes

- Migration: `CREATE OR REPLACE FUNCTION public.trg_registration_approved_notification()` with `cta_url = v_login`, `cta_label = 'Login'`. No template/body change needed; no other notification event touched.
- `src/pages/NewApplication.tsx`: reorder `WIZARD_STEPS` (review before payment), move the final-submit action into the payment step, add a `reviewConfirmed` state persisted per application, and replace the `reachable` closure with a per-step "completed" predicate driving `clickable`.
- `src/pages/PostLicenseApplicationForms.tsx` / `src/pages/ApplicationForms.tsx`: no ordering change (already review-then-pay); only the shared active/complete step styling stays as is.
- No changes to fee resolution, `verify-and-submit` gating, or workflow logic.
