# 01 · Permission Coverage Matrix

Source: `src/lib/rbac/coverageScanner.ts` + catalog snapshot in
[`docs/rbac/permission-coverage.md`](../permission-coverage.md).

## Summary

| Metric | Value |
|--------|-------|
| Permissions in catalog | 123 |
| With at least one enforcement surface | 24 |
| **Orphaned (no menu/route/button/RLS/RPC/storage/report)** | **99** |

The scanner recognises seven enforcement surfaces:

| Surface | Signal it matches |
|---------|-------------------|
| Menu     | `module: '<x>'` in `src/config/navigation.tsx` |
| Route    | `<M module="<x>">` / `<ModuleRoute>` in `src/routes/*` |
| Button   | `<PermissionGate>`, `<GuardedButton>`, `data-rbac="<m>.<a>"` |
| RLS      | `has_permission(_,_,_)` inside a `CREATE POLICY` body |
| RPC      | `has_permission(_,_,_)` inside a `CREATE FUNCTION` body |
| Storage  | `has_permission(_,_,_)` on a `storage.objects` policy |
| Report   | Anything under `src/pages/reports/*` (implicit `report_management.view`) |

## Coverage classification

```
       ┌──────────────────────────── button / RLS / RPC / storage present
       │ ┌────────────────────────── route present
       │ │ ┌──────────────────────── menu present
       │ │ │
    protected ─▶ FULL       (menu + route + backend)
                 PARTIAL    (some layers, not all)
                 ORPHAN     (nothing enforces the row)
```

## Gaps to address next

1. Every module-level `view` permission that has a route but no RLS surface — the sidebar hides
   the page but nothing prevents fetching the underlying data by ID.
2. `edit`, `approve`, `delete`, `export`, `assign`, `configure` on every module — currently these
   permissions exist in the catalog but no policy or RPC references them; server-side enforcement
   is by legacy role check, not by the catalog.
3. Wire the coverage scanner into CI (`bunx vitest run src/test/rbac/permissionCoverage.test.ts`)
   so orphans and coverage regressions fail builds.

Full row-by-row matrix: [`docs/rbac/permission-coverage.md`](../permission-coverage.md).
