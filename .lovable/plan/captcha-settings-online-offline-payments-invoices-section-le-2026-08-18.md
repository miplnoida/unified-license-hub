# CAPTCHA Settings, Online/Offline Payments + Invoices, Section-Level Review Editing

Four connected pieces of work, built on what already exists: `payments` / `payment_receipts` / `payment_attachments` / `payment_remarks`, the fee engine (`fee_configurations` + `resolveApplicationFeeBreakdownMeta`), the `NewApplication` wizard (`selection → forms → filling → documents → payment → review`), `ApplicationReviewBuilder` / `ReviewAcknowledgement`, and the registration flow (`useRegistrationForm`, `CaptchaSection`, `register-pre-licensee`).

## 1. CAPTCHA settings

Today `CaptchaSection.tsx` is an "I'm not a robot" checkbox placeholder and `useRegistrationForm` only checks a boolean. This becomes a real, admin-configured provider.

New admin page **Settings → CAPTCHA** (`/settings/captcha`, added to `SettingsHub` and `settingsRoutes` behind the existing `SettingsRoute` guard):
- Table of configurations: name, provider, environment, site key (masked tail), Active badge, created/updated.
- Create / edit dialog: name, provider (Google reCAPTCHA v2, Cloudflare Turnstile, hCaptcha), site key, secret key (write-only field, never returned), environment, notes.
- Activate action with the existing SweetAlert2 confirmation: "Activating this CAPTCHA will deactivate the currently active CAPTCHA."
- Deactivate, and delete (blocked for the active record).
- Global master switch (`captcha_enabled`) stored in `site_settings`, matching how other global flags are handled.

Backend:
- `captcha_configurations` — id, name, provider, site_key, environment, is_active, notes, created_by/updated_by, timestamps.
- `captcha_secrets` — 1:1 by config id, holds `secret_key`; granted to `service_role` only, so no client role can ever read it.
- Single-active invariant enforced in the database: partial unique index `where is_active` plus an `activate_captcha_configuration(_id)` security-definer RPC that deactivates the previous record and activates the new one in one statement pair. Admin-only via existing `has_role` / settings permission checks.
- A public read path returns only `provider`, `site_key`, `environment` of the active config (view or RPC exposed to `anon`); the config table itself stays admin-read.

Frontend rendering + verification:
- New `useActiveCaptcha()` hook and a provider-aware `CaptchaWidget` (loads the reCAPTCHA / Turnstile / hCaptcha script for the active provider, produces a token) replacing the placeholder inside `CaptchaSection`.
- `useRegistrationForm` validation switches from "checkbox ticked" to "token present"; the token travels with the submission.
- Shared `supabase/functions/_shared/captcha.ts` verifies the token against the provider using the secret read with the service-role client. Wired into `register-pre-licensee` and `send-registration-otp` — submissions with a missing/invalid token are rejected server-side.
- Enabled but no active config: submission is blocked with a clear message (admins additionally see a link to the CAPTCHA settings page). Globally disabled: no widget, no requirement.
- Audit: create / update / activate (including the implicit deactivation) / delete written through the existing audit helper. Secret values are never logged or returned.

## 2. Online + offline payment

At the payment step (and in `LicenseePaymentPanel`) the applicant first picks a method:
- **Online payment** — existing `complete_or_get_application_payment` gateway path, untouched.
- **Offline payment** — new form: offline method (bank transfer / cash / cheque / other), amount, payment date, reference number, bank / institution, remarks, and proof upload via the existing `payment_attachments` + secure-storage pattern.

Both options only appear when enabled in payment settings (`site_settings` flags, surfaced on the existing Payment Settings page).

`payments` is extended (no parallel table): `payment_channel`, `offline_method`, `payment_date`, `bank_name`, `verification_status`, `verified_by`, `verified_at`, `verification_remarks`. An offline submission is created server-side with status `pending_verification`; it never counts as paid.

Admin verification lives in the existing payment surfaces (`PaymentHistory`, `PaymentDetail`, and the application Payments tab): view offline details, open/download proof, Approve or Reject with mandatory remarks, and the full history of who did what and when. Approve/reject run through a permission-checked RPC/edge function that flips the payment to `success` or `rejected`, generates the invoice on approval, and writes audit entries. Rejected payments leave the application unpaid, show the reason to the applicant, and allow a corrected resubmission.

Payment gating for submission (server-side `verify-and-submit`) treats only approved/successful payments as satisfying the obligation.

## 3. Invoices

`payment_receipts` already stores a `receipt_number`, amount, currency and a `fee_breakdown` snapshot, so it becomes the invoice record rather than a new parallel model. Added: `invoice_number` (unique, `INV-YYYY-NNNNNN` from a sequence-backed generator), `application_id`, `subtotal`, `tax_amount`, `total_amount`, `payment_method`, `payment_reference`, `issued_by`.

- Generated once when an online payment is confirmed and when an offline payment is approved, inside the same server-side transaction, from the fee breakdown at that moment — later fee-config changes never alter an issued invoice.
- Applicant: "Download Invoice" from the payment step, payment history and application detail, available permanently (not only right after paying).
- Admin: invoice visible from payment detail and the payment list, searchable by invoice number / applicant / application.
- PDF built with the existing certificate/acknowledgement PDF utilities, including regulator details, applicant/entity, application number and licence type, line items, totals, currency, method, reference, status and payment date.
- RLS: applicants see only their own invoices; staff follow existing payment scope rules.

## 4. Section-level editing on Application Review

`ReviewAcknowledgement` currently exposes one `onEdit(templateIndex)` per form. Each rendered section gets its own edit control (existing `Edit` icon, tooltip "Edit <Section name>", accessible label), and the callback becomes `onEdit(templateIndex, sectionId)`.

`ApplicationReviewBuilder` already knows the section id behind every review block, so it passes it through. In `NewApplication`, the handler sets the active template *and* the target section, and `FormRenderer` accepts an initial section/group target so it opens on the exact tab / group / sub-form (reusing its existing `stepStorageKey` step state) instead of the first one. All previously entered values load as today.

State rules:
- Edit controls render only when the application status is applicant-editable (draft / returned-for-correction, per existing checks) — read-only reviews keep no edit affordance, and the control never bypasses server-side edit restrictions.
- If data changes after acknowledgement, the stored review confirmation is reset so the applicant must re-review before payment/submission.

## Technical notes

- Migrations: `captcha_configurations`, `captcha_secrets` (service-role only), invoice/offline columns, unique + partial indexes, GRANTs and RLS policies for every new table, plus the activate / offline-verify / invoice-generation RPCs.
- Permissions reuse the existing registry: settings permissions for CAPTCHA administration, payment permissions for offline verification and invoice viewing; new keys added only where no equivalent exists.
- Audit logging uses the current helpers for CAPTCHA changes, offline payment submit/approve/reject and invoice generation.
- Regression checks before finishing: registration submit + builder/preview, existing online payment path, payment history/detail, fee management as fee source of truth, payment-after-review ordering, pre/post-license form navigation, server-side submit validation, RBAC, and no secret leakage into client code, storage, logs or payloads.
