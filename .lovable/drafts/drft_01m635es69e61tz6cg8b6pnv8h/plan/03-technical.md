## Corrections applied
- **Eligibility** reuses existing entitlement mechanisms (licensee roles, approved Primary/Secondary user associations, PPOC). No new stricter membership requirement. Pre-licensee/applicant-only users are denied post-licence features even when linked to an entity with an active licence.
- **Staff roles**: keep both profile roles (`returns_officer`, `returns_supervisor`) and system roles (`analyst`, `supervisor`). Fix only label, audience resolution and navigation; confirm the Returns Queue works for both.
- **Submitted answers**: complete stored answers for the selected submitted version — sections, repeatable tables, attachments — read-only, existing authorization.
- No database changes, migrations, RLS, grants, or user-specific conditions. No publish/deploy.

## Technical details
- Step 1: confirm root causes (signed-in sessions for each account, trace resolved role/audience) before editing.
- Extend `src/lib/postLicenceAccess.ts` as the single helper; consume in `src/config/navigation.tsx` (`requiresLicenceEntitlement`), returns/post-licence route gates in `src/routes/returnsRoutes.tsx`, and `ApplicationsList`.
- Trace `getEffectiveUserRoleLabel`, `ROLE_LABELS`, AuthContext mapping and `canonicalAudience` for returns staff; fix the fallback so internal roles never resolve to Applicant. Internal audience on `/entity/returns*` redirects to `/returns/queue`.
- `src/pages/returns-canonical/FilingDetail.tsx`: "Submitted answers" tab using existing filing detail data and read-only renderer. If stored values aren't reachable via existing APIs, stop and report.

## Tests and verification
- Vitest: pre-licensee denied (incl. linked active licence), licensee_primary and approved primary association allowed, returns staff resolve as internal with Analyst/Supervisor labels, nav filtering, answers tab renders sections/tables/attachments.
- Browser (signed-in): pre-licensee menu + direct URLs blocked; primary user keeps My Returns and post-licence; officer and supervisor see correct header and Returns Queue; supervisor opens `FIL-2026-000001-b43a` answers.
- Regression check: registration, licensing, post-licence applications, return submission, officer review, supervisor approval screens still open and behave as before.
- Report root causes, changed files, test results, unresolved issues.
