# A1 Certification — Authority, Governed Mutations & Access-Integrity Closure

Date: 2026-08-20
Scope: Package A1 (authority layer, governed mutations, route audience + domain integrity)

## 1. Governed mutation closure

Browser-side direct DML on every P1 (canonical business state / regulatory
decision) store is eliminated. Scan of `src/**/*.{ts,tsx}` for
`.from(<P1 table>).(insert|update|upsert|delete)`:

| Metric | Result |
|--------|--------|
| Total browser write expressions (all tables) | 400 |
| **P1 governed-store write expressions** | **0** |

P1 stores covered: `applications`, `application_rfis`, `approval_actions`,
`approval_step_actions`, `compliance_returns`, `returns_filed`,
`license_appeals`, `inspections`, `examinations`, `thematic_reviews`,
`thematic_review_findings`, `thematic_review_actions`,
`thematic_review_letters`, `payments`, `refunds`, `enforcement_actions`,
`conduct_alerts`.

## 2. Database privilege lockdown

`INSERT` / `UPDATE` / `DELETE` for `authenticated` and `anon` on every P1 store:

```
application_rfis          NONE
applications              NONE
approval_actions          NONE
approval_step_actions     NONE
compliance_returns        NONE
conduct_alerts            NONE
enforcement_actions       NONE
examinations              NONE
inspections               NONE
license_appeals           NONE
payments                  NONE
refunds                   NONE
returns_filed             NONE
thematic_review_actions   NONE
thematic_review_findings  NONE
thematic_review_letters   NONE
thematic_reviews          NONE
```

All mutations flow through SECURITY DEFINER RPCs (178 governed functions in the
A1 domains) that: derive the actor from `auth.uid()`, enforce
`has_permission(<domain module>, <action>)` or documented ownership, validate the
state transition, require a rationale where mandatory, and write exactly one
compliance audit row inside the same transaction.

### Final closure additions this pass

| RPC | Purpose |
|-----|---------|
| `public.application_draft_save` | Applicant / officer draft answer persistence (`data`, `license_type`, `regulator_id` only; refuses non-editable states) |
| `public.application_rfi_close` | Officer RFI closure with notes, parked-status revert to `under_review`, audit row |
| `public.create_application_draft` (existing) | Sole path for application creation; browser `INSERT` on `applications` revoked |

Migrated call sites: `NewApplication.tsx`, `ApplicationForms.tsx`,
`PostLicenseApplicationForms.tsx`, `applications/ApplicationDetail.tsx`,
`NewPostLicenseApplication.tsx`, `licenses/LicenseDetail.tsx` (renewal),
`applications/ApplicationRfiTab.tsx`.

## 3. Route audience + domain integrity

Full inventory of 282 route declarations:

| Audience | Count |
|----------|-------|
| ADMINISTRATION | 106 |
| INTERNAL_REGULATOR | 103 |
| AUTHENTICATED_APPLICANT | 36 |
| PUBLIC | 16 |
| COMPATIBILITY_REDIRECT | 14 |
| EXTERNAL_ENTITY | 7 |

| Check | Result |
|-------|--------|
| Internal/admin routes with no module guard and no admin shell | **0** |
| Wrong-domain module assignments (route path vs permission module) | **0** |

Domain remapping landed in `src/routes/dashboardRoutes.tsx`,
`src/routes/adminRoutes.tsx` and `src/lib/permissionModules.ts`
(inspections → `inspection_management`, enforcement →
`enforcement_management`, supervision/thematic → `market_conduct` /
`prudential_supervision`, correspondence → `notification_management`,
entity resolution → `entity_resolution`).

## 4. Typecheck

`tsgo --noEmit -p tsconfig.app.json` — clean (0 errors).

## 5. Known residual (not A1 scope)

- Linter: 935 findings, of which 929 are the intentional SECURITY DEFINER
  governed-RPC surface plus pre-existing extension/view debt. No new class of
  finding was introduced; the two new entries are the two RPCs above.
- P2/P3 configuration and draft-scratch writes remain browser-side by design.

## A1 COMPLETE = YES
