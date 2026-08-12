# Application detail — certificate visibility and auto expiry date

Three corrections on the admin Application detail page (Decision tab → "Decision Letter & Certificate Preview").

## 1. No certificate for rejected applications

The certificate section currently appears for any application in the Decision tab; the only gate is the "intended outcome" dropdown. Change it so the Licence certificate tab and all its actions (Generate draft PDF, Print certificate, Download PDF, Issue) are hidden whenever the application's own status is rejected (also for withdrawn/cancelled terminal non-approval states). In their place, show a short note: "No licence certificate is issued for a rejected application."

## 2. Licence certificate visible only when approved

Beyond rejection, the certificate tab only appears once the application status is approved. Before a determination is recorded (submitted / under review / query raised), the certificate tab is replaced with a note that the certificate becomes available after the application is approved and the licence is issued. The Decision letter tab and preview stay available at all stages, so approvers can still preview wording before deciding.

## 3. Expiry date is read-only and auto-derived

The expiry date input is currently a free editable date field. It becomes:

- A disabled, read-only field.
- Value = effective date + configured validity period, resolved from the licence expiry configuration (default policy plus any sector / sub-sector / category rule matching this application's taxonomy) — the same rule the backend applies when it creates the licence on approval.
- When an actual licence already exists for the application, its stored expiry is shown instead of the computed preview (the authoritative value).
- Helper text under the field: "Set automatically on approval from the licence validity configuration."
- The computed value continues to be passed to the certificate preview / print / artifact so what is shown matches what will be issued; nothing is written from the UI.

## Technical notes

- `src/components/applications/DecisionDocumentPreview.tsx`: gate the certificate tab on application status (new prop or existing `application` data), drop `setExpiryDate` from the input, and compute expiry with `useLicenseExpiryConfig().resolveFor({ sector_id, sub_sector_id, category_id })` → `effectiveDate + period_days`.
- `src/components/applications/ApproverDecisionView.tsx`: pass application status and taxonomy ids down to the preview.
- Frontend/presentation only — no schema, RPC, or approval-workflow changes. Backend already derives `valid_until` from the `license_expiry` configuration when the licence is created.
