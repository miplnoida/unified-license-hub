# RBAC Action Coverage — Enforcement Kit

This directory is the authoritative RBAC action-coverage audit for the app.

## Files

- **`action-audit.md`** — human-readable report with Page / Button / Permission / Protected / File / Line columns, plus per-category coverage summary. Regenerate via `bunx tsx scripts/generate-rbac-audit.ts`.
- **`action-audit.csv`** — same data in CSV, suitable for spreadsheets or diffing over time.

## How coverage is decided

The scanner in `src/lib/rbac/audit.ts` walks `src/pages/**` and `src/components/**` for:

- `<Button …>` opening tags with a visible label.
- `<GuardedButton module="…" action="…">` — inherently protected.

A site is marked **Protected = Yes** when any of the following is true:

1. It is nested inside a `<PermissionGate module="…" action="…">` (opened in the preceding ~1.2 KB of source and not yet closed).
2. It is a `<GuardedButton>` — protection is intrinsic.
3. It carries a `data-rbac="module.action"` attribute (used for buttons that live under a PermissionGate wrapper — makes the mapping visible in the report).
4. Its label matches the built-in public allow-list in `src/lib/rbac/audit.ts` (login, logout, cancel, close, back, next, refresh, and other non-business chrome).

## Guarding primitives

- **`<PermissionGate module action>{…}</PermissionGate>`** — hides children unless the current user has `module.action`, or is `super_admin`. Assignment-only regulators (no dynamic-role permissions, but mapped as regulator on ≥1 licensee) are never given permissions — they see nothing.
- **`<GuardedButton module="…" action="…">…</GuardedButton>`** — same behavior in a single element. Preferred for toolbar / table-row action buttons.
- **`useCan(module, action)`** — hook wrapper over `hasPermission` that also returns `false` for assignment-only regulators.
- **`data-rbac="module.action"`** — attribute placed on `<Button>` for the audit to record the exact permission behind a gate. Handy for buttons inside a PermissionGate whose module/action would otherwise be inferred only from the wrapper.

## Return Queue lockdown

Assignment-only regulators (Lead / Officer / Alternate Regulator on `licensees`, with no dynamic role permissions) can view returns for mapped entities and nothing else. Enforcement:

- `useUserDynamicPermissions().isAssignmentOnly` returns `true`.
- `hasPermission()` returns `false` for every action key.
- `GuardedButton`, `useCan`, and `PermissionGate` all short-circuit to hidden.
- UI test: `src/test/rbac/returnQueueAssignmentOnly.test.tsx` renders the Return Queue for this persona and asserts Export is not in the DOM.

## Coverage floor

`src/test/rbac/actionCoverage.test.ts` runs the scanner and enforces:

- Return Queue Export is protected.
- Return Detail Approve / Reject / View Analysis / Compare / History are protected.
- Overall coverage never drops below the baseline recorded in the test (the `BASELINE` constant should be ratcheted upward as coverage improves).

## Extending coverage

For every unprotected row in `action-audit.md`:

1. If the action is a genuine business action, wrap it in `<PermissionGate>` or replace it with `<GuardedButton>`, and add a `data-rbac="module.action"` marker on the button so it shows up as `Protected = Yes` with the correct permission in the report.
2. If it is chrome (cancel, back, close, refresh, etc.), add the label to the `PUBLIC_ALLOW_LABELS` set in `src/lib/rbac/audit.ts`.
3. Rerun `bunx tsx scripts/generate-rbac-audit.ts` and commit the updated report.

## Server-side mirror

The permission model on the server (`public.has_permission(user, module, action)`) mirrors the client. See `docs/verification/*` for pgTAP suites that exercise the same matrix at the RLS boundary. Any new client-side action key should have a matching row in the `permissions` catalog and, where relevant, an RLS policy or RPC guard that consults it.
