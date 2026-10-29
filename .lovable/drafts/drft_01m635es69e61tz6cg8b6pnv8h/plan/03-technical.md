## Technical details
- Extend `src/lib/postLicenceAccess.ts` into the single eligibility helper; consume it in `src/config/navigation.tsx` (`requiresLicenceEntitlement` items), `PortalRoute`/returns route gates in `src/routes/returnsRoutes.tsx`, post-licence routes and `ApplicationsList`.
- Trace `getEffectiveUserRoleLabel`, `ROLE_LABELS`, AuthContext role mapping and `useUserDynamicPermissions().canonicalAudience` for `returns_officer`/`returns_supervisor`; fix the fallback so unknown internal profile roles resolve from `user_roles` (analyst/supervisor), never to applicant. Redirect internal audience on `/entity/returns*` to `/returns/queue`.
- `src/pages/returns-canonical/FilingDetail.tsx`: new "Submitted answers" tab rendering stored values per form/section/table for the chosen version via the existing filing detail query and form renderer in read-only mode. If stored values are not reachable through existing APIs, stop and report rather than add schema.
- No migrations, grants, RLS or role changes. Server-side RLS remains the boundary.

## Tests and verification
- Vitest: eligibility rule (pre-licensee denied, licensee_primary allowed, analyst/supervisor internal), role label for returns staff, nav filtering, answers tab rendering stored values.
- Browser (signed-in sessions): pre-licensee menu + direct URLs blocked; primary user retains My Returns; officer and supervisor header shows Analyst/Supervisor and lands on Returns Queue; supervisor opens `FIL-2026-000001-b43a` and sees submitted values.
- Report root causes, changed files, results. No publish.
