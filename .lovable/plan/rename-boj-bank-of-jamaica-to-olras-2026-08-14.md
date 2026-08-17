# Rename "BOJ" / "Bank of Jamaica" to "OLRAS"

Searched the whole application. "BOJ" appears in only a few places, and one of them must stay as-is.

## Changes

1. **Regulator default-pick fallback** (`src/contexts/RegulatorContext.tsx` line 47)
   The fallback that picks a default regulator matches names/codes containing `boj` or `bank of jamaica`. Replace with a match on `olras`. No regulator record currently uses either name (records are `Regulator 1/2`, `ABC Prudential Authority`, `FSC Conduct Authority`), so behaviour is unchanged in practice.

2. **Business calendar record** (data)
   The calendar profile named `BOJ Calendar` becomes `OLRAS Calendar` (single-row update; the SLA Manager already shows the neutral hint "e.g. St. Lucia Calendar, FSC Calendar").

3. **Certificate signatory setting** (data)
   `license_certificate_signatory.name` is `BOJ Super Admin` → `OLRAS Super Admin`. Title, signature image and active flag stay untouched, so certificate rendering is unaffected.

4. **Test fixture strings**
   - `src/test/reportProvenance.test.ts`: `officer@boj.test` → `officer@olras.test`.
   - `supabase/tests/phase10/02_export_governance.sql`: `BOJ-2026-01` → `OLRAS-2026-01` (assertion strings stay consistent).

## Deliberately not changed

- **`supabase/functions/_shared/cors.ts`** and its test: `https://boj.skntreasury.com` is the project's real live custom domain. Changing it would break CORS for the published site. It can be updated only after the domain itself is renamed.
- **Existing SQL migrations** that contain historic "BOJ"/Jamaica text (already-applied files and imported historic Fit & Proper questionnaire data). Migration history is immutable; rewriting it changes nothing at runtime.

## Technical notes

- Data changes go through one small migration performing targeted `UPDATE`s on `business_calendar_profiles` and `site_settings` (JSON key replace), no schema change.
- No component, route, workflow, or permission logic is touched.

## Verification

- Admin > SLA Manager > Business Calendar shows "OLRAS Calendar".
- Certificate preview shows "OLRAS Super Admin" as signatory.
- Repository search for `BOJ` / `Bank of Jamaica` returns only the custom-domain entries and historic migrations.
