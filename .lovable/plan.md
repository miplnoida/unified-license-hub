# Add SLA Manager to the admin sidebar

## Root cause
`src/config/navigation.tsx` drives the sidebar. It has no entry for `/admin/sla-manager`. The route (`src/routes/adminRoutes.tsx`), the permission mapping (`src/lib/permissionModules.ts`), and the AdminHub card all exist — only the nav config is missing the item.

## Change

In `src/config/navigation.tsx`, add an SLA Manager entry inside the existing **Workflows** section (it shares the `workflow_management` module already used by Approval Workflows / Delegation Rules):

```text
{
  label: 'Workflows',
  items: [
    Approval Workflows  → /workflows
    SLA Manager         → /admin/sla-manager   ← new
    Delegation Rules    → /delegation-rules
  ],
}
```

- `icon`: `Timer` (already imported from `lucide-react` in this file).
- `roles`: `ADMIN_ROLES` (matches the route guard `<M module="workflow_management">`).
- `module`: `'workflow_management'`.

No other files need to change — sidebar component, routes, permissions, and AdminHub already work.

## Verify
- Sign in as admin → sidebar's Workflows group now lists "SLA Manager" between Approval Workflows and Delegation Rules.
- Clicking it navigates to `/admin/sla-manager` and renders the existing page.
- Non-admin / users without `workflow_management` continue to not see it (gated by `roles` + `module`).
