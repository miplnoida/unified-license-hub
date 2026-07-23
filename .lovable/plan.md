## Problem

External users (applicants, licensee_primary/secondary, pre-licensee) see the Complaints menu but clicking `/complaints` bounces them to `/dashboard`. Two guards are the culprits:

1. **`PortalRoute`** (`src/components/auth/PortalRoute.tsx`) — for external users it now calls `hasPermission('complaint_management', 'submit'|'view_status')` against the internal dynamic-permission engine. External users don't hold rows in `role_permissions`, so every capability returns `false` → the route renders `<AccessDenied />` (and, for pre-licensees, the outer gate redirects first — see #2).

2. **`RegistrationApprovalGate`** (`src/routes/routeHelpers.tsx`) — for approved pre-licensees, if the path is not in `PRE_LICENSEE_ALLOWED_ROUTES` and the module permission check fails, it `Navigate`s to `/dashboard`. `/complaints` is not in the allowlist, which is exactly what the user is seeing.

This regression came from consolidating external portal access into the dynamic RBAC engine without keeping a role-based fallback for the fixed portal capabilities that every external user is supposed to have by default (submit/view their own complaint, application, return, etc.).

## Fix

Keep internal RBAC untouched. Restore role-based defaults for external portal capabilities so `PortalRoute` and the pre-licensee gate stop blocking legitimate external users.

### 1. `src/lib/portalAccess.ts` (new helper) or inline in `PortalRoute.tsx`

Add a small role → default capabilities table used only for external roles:

```text
applicant             → licensing (submit, view_status, upload_documents, respond_rfi),
                        complaints (submit, view_status, upload_documents),
                        fp_declarations (submit, view_status, upload_documents)
pre_licensee          → same as applicant
licensee_primary      → licensing + returns + complaints + fp_declarations (all capabilities)
licensee_secondary    → same as primary (RLS still scopes rows)
```

Expose `hasDefaultPortalCapability(role, area, capability)`.

### 2. `src/components/auth/PortalRoute.tsx`

For external users, allow if EITHER:
- dynamic permission grants the mapped `(module, action)` (unchanged), OR
- the user's base role carries the default portal capability from the table above.

Only fall to `<AccessDenied />` when neither path grants access. Internal branch is unchanged.

### 3. `src/hooks/useUserPermissions.ts`

Add `/complaints` (and, defensively, `/fp-declarations`) to `PRE_LICENSEE_ALLOWED_ROUTES` so approved pre-licensees who submit complaints don't get redirected to `/dashboard` before `PortalRoute` even runs. Existing entries (`/applications`, `/licenses`, `/payments`, …) stay as-is.

### 4. `src/hooks/useExternalPortalAccess.ts`

Have `can()` also honour the role-default table so any UI still using this hook (buttons, empty-state CTAs) matches the route decision.

### 5. Verification

- Manual: log in as `licensee_primary`, `licensee_secondary`, `applicant`, and approved `pre_licensee`; open `/complaints` — list must render, not redirect, and no `<AccessDenied />`.
- Manual: log in as internal user without `complaint_management.view` — still blocked (no regression).
- Extend `src/test/sidebarVisibility.test.tsx` (or a sibling route test) with a "complaints route resolves for external roles" case using `PortalRoute` under `MemoryRouter`.

## Out of scope

- No RLS changes (row-level checks already work correctly per the earlier `external-user-rls-invariant.md` memory).
- No changes to internal module gating, sidebar visibility, or Complaints module business logic.
- No changes to `/complaints/:id`, analytics, duplicates, escalations — those remain internal-only via `<M module="complaint_management">`. External users get list + create only, which matches the current menu wiring.
