# Simplify Visibility Controls in Registration Form Builder

UI-only cleanup of the Registration Form Builder dialog (`src/pages/admin/RegistrationFormBuilder.tsx`). No changes to runtime, preview, edge functions or the database.

## Changes

**Security & Verification card**
- Remove the per-row "Visible to applicant" switches for Email OTP Verification and CAPTCHA Validation (and their `Hidden` badges). The rows keep only their enable switch, and OTP keeps its "Verify Email At" selector.
- Move the "Document Upload Step" switch out of this card.

**Required Document Types card**
- Header switch label changes from "Visible to applicant (whole section)" to "Visible to applicant".
- The "Document Upload Step" switch (`require_documents`) now lives in this card, at the top of its content, keeping the same label and behaviour.
- Per-row "Visible to applicant" switches stay as they are (the request only asked to remove them from Declarations and Security).

**Declaration Checkboxes card**
- Remove the per-row "Visible to applicant" switch and per-row `Hidden` badge; each row keeps label, link fields, Required switch, preview text and delete.
- Header switch label changes to "Visible to applicant".

## Technical notes

- `otp_visible_to_applicant` / `captcha_visible_to_applicant` stay in the form state, load and save payloads at their current values (defaults true), so existing configs and the runtime/preview/edge-function logic keep working untouched.
- The inline save-gate messages for "required but hidden" OTP/CAPTCHA stay in place as a safety net for legacy rows saved with hidden values; they simply become unreachable through the UI.
- Declaration `visible` values already stored are left intact; the builder just no longer edits them per row.
- Existing visibility tests remain valid — no logic files change.

## Verification

Typecheck plus a browser pass on `/admin/registration-forms`: open a form, confirm the Security card has no visibility switches, the Document Upload Step switch appears in Required Document Types and still gates the OTP placement option, Declarations rows have no visibility switch, both section switches read "Visible to applicant", and save/preview still work.
