## Problem

On the Web User / PPOC (licensee) panel, the "My Applications" page has a **New Application** button that always opens the **post-licensee** new-application URL (`/post-license/new`) — even when the user is filing a **pre-licensee** application (e.g. applying for a license in a new sector). This mirrors a hard-coded role check that doesn't consider the user's actual intent or portal context.

Source: `src/pages/applications/ApplicationsList.tsx:1234`
```tsx
<Button onClick={() => navigate(
  user && LICENSEE_ROLES.includes(user.role)
    ? '/post-license/new'
    : '/applications/new'
)}>
  New Application
</Button>
```

Any user in `LICENSEE_ROLES` (licensee_primary, licensee_secondary — which includes web users and PPOCs acting for a licensee) is force-routed to the post-license flow, so pre-licensee applications become unreachable from this screen.

Elsewhere (`ApplicantDashboard.tsx:40`) the correct pattern is already used:
```ts
const newApplicationPath = portalCtx.isPreLicensee ? '/pre-license/new' : '/applications/new';
```
Note: `/applications/new` (the shared `NewApplication` page) is the neutral entry point that already handles licensee context via effective role — it does NOT force a post-license flow.

## Fix (UI only, single file)

In `src/pages/applications/ApplicationsList.tsx`:

1. Replace the hard-coded role branch with a small dropdown/menu on the "New Application" button so licensee users (web user / PPOC / primary / secondary) can choose:
   - **New Pre-Licensee Application** → `/applications/new`
   - **New Post-Licensee Application** → `/post-license/new`

   Non-licensee applicants continue to see a single button that goes to `/applications/new` (unchanged behavior).

2. Use the existing `DropdownMenu` shadcn component already imported across the codebase; keep the trigger visually identical (primary button + `PlusCircle` icon + caret).

No changes to routes, backend, or the `NewApplication` / `NewPostLicenseApplication` pages themselves — the bug is purely the button's destination on this one screen.

## Verification

- As a licensee_primary / PPOC / web user, open **My Applications** → click **New Application** → choose **Pre-Licensee** → lands on `/applications/new` (sector/sub-sector/service picker for a new license), not `/post-license/new`.
- Choosing **Post-Licensee** still lands on `/post-license/new` (existing post-license flow).
- As a pre_licensee applicant, the button remains a single-action button to `/applications/new` (unchanged).
