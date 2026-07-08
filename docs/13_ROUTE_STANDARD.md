# 13 — Route Standard

## Route Files
`src/routes/*.tsx` composes the tree. Split by audience (public / dashboard / admin / settings / returns). Do not add new top-level route files without ADR.

## Route Definition Rules
1. All non-critical routes use `lazyWithRetry` for code-splitting.
2. Every protected route wraps in `PortalRoute` (audience) and, where relevant, `PermissionGate` (module).
3. Route paths are `kebab-case`.
4. Deep-linkable state (filters, tabs) uses query params, not location state.

## Guards Stack (top → bottom)
```text
<AuthProvider>            (App.tsx)
  <PortalRoute audience="internal|licensee|applicant">
    <PermissionGate module="..." action="view">
      <FeaturePage />
    </PermissionGate>
  </PortalRoute>
```

## Redirects
- Unauthenticated → `/login` with `?next=<url>`.
- Wrong audience → `/dashboard` (audience-aware).
- Missing permission → `/403`.

## Route Naming Glossary
- `/admin/*` — internal admin surfaces (super_admin + dynamic roles).
- `/entity/*` — licensee-scoped operational surfaces.
- `/settings/*` — configuration (permissioned).
- Public: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`.

## Anti-patterns
- Deep routes duplicating list-page filters instead of using query params.
- Routes that mount then redirect (flicker) — do redirect in the parent guard.
- Business logic in route files (route files must be declarative).

## Audit Actions Required (post-EPIC)
- Sweep every route for lazy loading.
- Sweep every protected route for `PermissionGate` module correctness against `permissionRegistry`.
- Verify no direct-URL access to admin-only forms (per `mem://security/form-access-constraints`).
