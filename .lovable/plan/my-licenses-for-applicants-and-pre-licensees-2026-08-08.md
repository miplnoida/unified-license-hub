# My Licenses for applicants and pre-licensees

## Current state (verified)

- A "My Licenses" sidebar item already exists under the Licenses section, but its `roles` list is `LICENSEE_ROLES` only — `applicant` and `pre_licensee` are not included, so those users never see the menu.
- The route `/licenses` and `/licenses/:id` are already guarded by the licensing portal capability `can_view_status`, which applicants and pre-licensees do have by default. So the pages themselves are reachable by URL today.
- The listing data source (`get_my_licenses_page`) already resolves licences for a user with no licensee mapping via the licence holder and via their own applications, so an applicant's licences will come back.
- Licence detail already supports holder-scoped certificate download (added previously); the list has no download action.

## What to build

### 1. Menu visibility
Add `applicant` and `pre_licensee` to the "My Licenses" item roles so it appears in the sidebar for the applicant/pre-licensee panel alongside licensee roles. Keep it in the existing Licenses section (sidebar order unchanged).

### 2. Applicant-friendly licence list
On the licences list, when the viewer is external (not internal staff):
- Title the page "My Licenses" and hide internal-only filters that don't apply (keep search and status).
- Show columns: Licence number, Type, Sector, Valid from, Valid until, Status badge (with expiring/grace treatment), and Actions.
- Actions per row: **View** (opens licence detail) and **Download Certificate**.
- Empty state: a clear "No licences issued yet" message rather than a blank table.

### 3. Certificate download from the list
Reuse the same holder-scoped download path the detail page uses (`generate-license-certificate` with `mode: "download"`), so no new permission surface is introduced:
- Downloading opens the signed PDF URL.
- When no certificate exists yet, show "Certificate is being prepared" instead of an error.
- Regeneration/sign/dispatch stay internal-only and are not exposed here.

### 4. Detail view for applicants
Confirm the licence detail page renders correctly for an external viewer: licence particulars, validity, conditions, status history, and the certificate download button — with internal-only panels (signature/dispatch, actions, internal notes) hidden.

## Technical notes

- `src/config/navigation.tsx` — extend the roles array for the `My Licenses` item.
- `src/pages/licenses/LicensesList.tsx` — external-view branch: simplified header/filters, per-row certificate download using the shared invoke helper; no change to the RPC call shape.
- Extract the certificate-download call used in `src/pages/licenses/LicenseDetail.tsx` into a small shared helper (e.g. `src/lib/licenseCertificate.ts`) so list and detail behave identically.
- `src/test/sidebarVisibility.test.tsx` — update the applicant / pre-licensee persona expectations to include the new menu item.

## Verification

- Render the sidebar for applicant and pre-licensee personas and assert "My Licenses" appears; internal personas unchanged.
- Load `/licenses` as an external viewer and confirm only their own licences are listed.
- Trigger certificate download for a licence that has a certificate, and for one that doesn't, checking both outcomes.
