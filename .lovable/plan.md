## Goal

Add four capabilities on top of the existing license workflow, without changing other working flows:

1. Digitally-signed PDF license certificate on approval/issuance.
2. Streamlined renewal workflow + near-expiry alerts (entities + officers).
3. Officer-initiated revocation with mandatory justification, notifications, status update, and audit trail.
4. Auto-generation of an initial supervisory risk profile + time-bound supervisory plan on licensing completion.

Keep `LicenseDetail`, `approve-pre-licensee`, `license-expiry-reminders`, notification dispatcher, workflow engine, and existing license actions intact — only extend.

---

## 1. Digitally-signed license certificate

- New edge function `generate-license-certificate` (Deno + `pdf-lib` + `node-forge` for PKCS#7 signing).
  - Input: `license_id`. Loads license + licensee + entity name + signatory from settings.
  - Renders certificate PDF with: entity name, license type, license number, issue date, expiry date, authorized signatory name/title, regulator branding.
  - Signs PDF using a project-stored signing key (PKCS#12 / PEM stored as secrets `LICENSE_SIGNING_KEY_PEM`, `LICENSE_SIGNING_CERT_PEM`, `LICENSE_SIGNATORY_NAME`, `LICENSE_SIGNATORY_TITLE` — added via `add_secret` tool when user confirms).
  - Uploads signed PDF to existing storage (new private bucket `license-certificates`) at `{license_id}/{license_number}.pdf` and records a row in new table `license_certificates` (license_id, file_path, signed_at, signatory_name, signature_fingerprint, version).
- Hook into `approve-pre-licensee` (post license insert) and into the renewal flow (below) to call the function fire-and-forget.
- UI: `LicenseDetail` gets a "Download Signed Certificate" button that fetches a short-lived signed URL via the function (`mode: "download"`).
- Fallback if signing secrets not configured: still generate an unsigned PDF marked "Signature pending — configure signing key" so feature works out-of-the-box.

## 2. Renewal cycle + near-expiry alerts

- Reuse existing `license-expiry-reminders` (already dispatches 30/15/7/1/0-day windows). Extend it to also resolve **internal officer recipients** for the license's sector/regulator and dispatch a parallel event `license.expiring_soon_officer` so officers get alerts too (entities already covered).
- Seed 2 new `notification_templates` rows (`license.expiring_soon_officer` email + in_app) and a `notification_event_configs` entry routing to `sector_regulators` recipient rule.
- New table `license_renewals` (id, license_id, initiated_by, status [`draft|submitted|approved|rejected`], submitted_at, approved_at, new_valid_until, notes, source_application_id nullable).
- New "Renew License" flow on `LicenseDetail` and on the licensee dashboard expiring-soon card:
  - Opens a streamlined dialog pre-filled with current license data (entity, type, sector, conditions). User edits only the renewal period and any updated conditions/attachments.
  - On submit: insert `license_renewals` row, write `license_actions` (`renewal_requested`), notify officers (`license.renewal_requested`).
  - Officer approve action extends `licenses.valid_until` by the renewal period, sets `license_renewals.status='approved'`, writes `license_actions` (`renewal_approved`), regenerates signed certificate, dispatches existing `license.renewed`.
- No change to current direct-renewal button behavior — it stays but routes through the new dialog instead of instant status flip.

## 3. Officer-initiated revocation (mandatory justification)

- `LicenseDetail` already exposes Revoke for internal users. Tighten:
  - Make `reason` mandatory for revocation (button disabled until non-empty; trimmed length ≥ 10 chars). Same for suspension/cancellation to be consistent.
  - On revoke: in addition to existing `license_actions` + `licenses.status` + `logAudit` + `license.revoked` dispatch, also flip the linked `licensees.status` to `revoked` (mirrors license), and ensure an `audit_logs` entry via existing `log_self_audit` RPC (already done) plus a `license_actions` row carrying the justification.
  - Seed a `notification_templates` row for `license.revoked` (email + in_app) if missing, with the justification token `{{reason}}` rendered to entity primary users AND sector regulators.
- No DB schema change required — just code + seed.

## 4. Auto supervisory risk profile + time-bound plan

- New table `supervisory_plans`:
  - id, entity_id (→ licensees), license_id, created_from (`licensing`|`manual`), risk_rating_id, status (`active|completed|archived`), created_by, created_at, updated_at.
- New table `supervisory_plan_actions`:
  - id, plan_id, title, description, owner_role, due_date (date, NOT NULL), status (`pending|in_progress|completed|overdue`), completed_at, source (`auto`|`manual`).
- Trigger point: at the end of `approve-pre-licensee` (after license + licensee insertion), call a new SECURITY DEFINER RPC `bootstrap_supervisory_profile(_license_id uuid)` that:
  1. Inserts a baseline `risk_ratings` row for the licensee (rating = sector default or `medium`, risk_score = 50, risk_factors derived from application sector/category, notes = "Auto-generated from licensing findings: <application_number>").
  2. Inserts a `supervisory_plans` row linked to the new rating.
  3. Inserts default `supervisory_plan_actions` (all time-bound, due dates relative to today):
     - "Initial onboarding meeting" — due +30d
     - "Submit baseline compliance return" — due +60d
     - "First on-site / desk review" — due +90d
     - "Risk reassessment" — due +180d
  4. Writes an `audit_logs` row noting auto-bootstrap.
- New admin UI tab inside `LicenseeDetail` → "Supervisory Plan" listing current plan + actions with due dates and overdue badges. Officers can mark actions complete or add more (manual actions still require a due date — enforced by NOT NULL + form validation).
- Sidebar/dashboard: no nav changes; reachable through the existing licensee detail page.

---

## Technical details

### Migrations (single migration file)
- `license_certificates` table + GRANTs + RLS (read: authenticated for license holders + admins/supervisors; write: service_role only).
- `license_renewals` table + GRANTs + RLS (insert/select by entity_user_access or admins; update by admins/supervisors).
- `supervisory_plans` + `supervisory_plan_actions` tables + GRANTs + RLS (admins/supervisors manage; entity users read their own via `entity_user_access`; external roles denied via RESTRICTIVE policy).
- `bootstrap_supervisory_profile(_license_id uuid)` SECURITY DEFINER function.
- Seed rows into `notification_templates` and `notification_event_configs` for: `license.expiring_soon_officer`, `license.renewal_requested`, `license.renewal_approved` — using existing token conventions. Idempotent via `WHERE NOT EXISTS`.
- Private storage bucket `license-certificates` created via `supabase--storage_create_bucket`; RLS on `storage.objects` so only admins/supervisors and the license holder can read.

### Edge functions
- `generate-license-certificate` (new) — handles `mode: "generate" | "download"`.
- `approve-pre-licensee` (extend) — after license insert: invoke `generate-license-certificate` and `bootstrap_supervisory_profile` RPC. Both fire-and-forget; failures logged but do not block approval.
- `license-expiry-reminders` (extend) — additional officer-recipient loop dispatching `license.expiring_soon_officer`.

### Frontend
- `src/pages/licenses/LicenseDetail.tsx`:
  - "Download Signed Certificate" button.
  - Renewal dialog wired to new `license_renewals` flow.
  - Mandatory-reason validation for revocation/suspension/cancellation.
- `src/pages/admin/LicenseeDetail.tsx`: new "Supervisory Plan" tab component.
- `src/lib/notificationEvents.ts`: extend `NotificationEventKey` union with new keys.

### Secrets to be requested (only after user confirms)
- `LICENSE_SIGNING_KEY_PEM`, `LICENSE_SIGNING_CERT_PEM`, `LICENSE_SIGNATORY_NAME`, `LICENSE_SIGNATORY_TITLE`.
- If user prefers no signing infra now: skip secrets; certificate is generated unsigned with a clear "Signature pending" watermark and the wiring is ready for later.

### Out of scope (explicit)
- No changes to workflow builder, fee management, complaint flows, returns flows, or existing notification dispatcher.
- No changes to existing `license.created` / `license.renewed` / `license.revoked` templates' content beyond seeding what's missing.
- No edits to `src/integrations/supabase/client.ts` or auto-generated types.

---

## Confirm before I build

1. **Signing key**: do you have a PKCS#8 PEM private key + X.509 PEM cert you can share via `add_secret`, or should I ship the unsigned-with-watermark fallback for now and wire the signing later?
2. **Renewal period**: default to "same length as previous validity" (e.g. +1 year if existing license was 1y), or always prompt the officer to pick the new `valid_until`?
3. **Supervisory plan default actions**: are the 4 actions above (30/60/90/180 days) the right starting set, or do you want a different list?
