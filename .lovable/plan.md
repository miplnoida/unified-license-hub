## Problem

External users (applicant, licensee_primary, licensee_secondary, pre_licensee) no longer see the **Complaints** menu (and any other portal item that declares a `module`). It regressed as part of the RBAC hardening pass.

## Root cause (confirmed by reading Sidebar.tsx lines 122–189)

`Sidebar.isItemVisible` runs this branch whenever `enforceDynamic` is true (which is true for every non-super-admin, including external users):

```ts
if (item.module) {
  if (isInternalOnlyItem && !userIsInternal) return false;
  if (item.requiredAction) return hasPermission(item.module, item.requiredAction);
  if (hasModuleAccess(item.module)) return true;
  ...
  return false;   // ← external users always land here
}
```

`hasModuleAccess` / `hasPermission` walk `user_dynamic_roles → role_permissions → permissions`. External users have **no dynamic role**, so both return `false`, and the entry is hidden even though its `roles` array explicitly lists external audiences (`applicant`, `licensee_primary`, etc.).

The Complaints entry in `src/config/navigation.tsx` line 126 lists external roles and `module: 'complaint_management'`, so it is affected. The same regression silently hides any other module-tagged item whose audience includes external roles (Applications, Payments, Returns for licensees, F&P declarations, Documents, etc.).

The intent of the earlier `isInternalOnlyItem` block was exactly to distinguish admin-only screens from portal screens, but the code then still forces external users through the internal permission check.

## Fix

Restore the external-audience path in `src/components/layout/Sidebar.tsx` `isItemVisible`, without weakening internal gating:

1. Compute `userIsInternal` once (already there).
2. When `item.module` is set and the item is **not** `isInternalOnlyItem`:
   - If `userIsInternal` → keep today's behavior (`hasModuleAccess` / `requiredAction` check).
   - If not internal → return `effectiveVisible` (the existing audience match that already accounts for licensee / pre-licensee portal context). Row-level access is still enforced by RLS on click; the menu just needs to appear for the declared audience.
3. Apply the same split in the `item.href → mappedModule` branch a few lines below (same regression class).
4. Leave the `isInternalOnlyItem` early-return in place so admin-only screens (`/admin/*`, `/settings/*`, `adminOnly: true`) stay hidden for external users regardless of module.

No changes to `usePermissions.ts`, no RLS changes, no navigation config changes.

## Verification

- Add persona cases to `src/test/sidebarVisibility.test.tsx`: `applicant`, `licensee_primary`, `licensee_secondary`, `pre_licensee` each see **Complaints**; none of them see admin-only items like `Complaint Types`, `Duplicate Detection`, `Auto-Escalation`, `Admin Control Panel`.
- Existing 10-persona suite must still pass (assignment-only regulator still sees only Return Queue; internal users without permission still don't see gated items).

## Out of scope

- No changes to backend policies, RPCs, or the permission catalog.
- No changes to any route guard — only the sidebar visibility predicate.
