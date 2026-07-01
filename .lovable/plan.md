
## Goal
Fix the licensee return-fill page (`/entity/returns/:id/fill`) where clicking **Save Draft** and **Submit** produces no visible response (no toast, no error, no console log) on a TEMP/WIP return.

## Investigation approach
The click handlers in `src/pages/entity/returns/FillReturnPage.tsx` (`handleSave`, `handleSubmit`) should at minimum surface a toast, so a silent no-op points to one of:

1. The button never invokes the handler (overlay, `disabled`, tab pane hidden).
2. The handler exits early on an unsatisfied guard (`!id`, stuck `saving=true` from a prior hung auto-save, `licenseGate.isBlocked` for Submit, `accessGuard.verify` returning `false` silently, or an unresolved Swal instance).
3. A React state race: `SingleReturnForm`'s effect (lines 51-54) fires on every render because `initialData` is a fresh object each render, potentially thrashing state and interfering with the button's click cycle.

I will drive the licensee flow with Playwright against `http://localhost:8080/entity/returns/<id>/fill` using the injected Supabase session, click both buttons, and capture console + network + screenshots to identify which branch swallows the click.

## Fix (applied after reproduction confirms the branch)
Depending on root cause, the fix will be one of the following minimal changes in `src/pages/entity/returns/FillReturnPage.tsx`:

- **Stuck `saving` guard**: reset `setSaving(false)` in a `finally` in `handleSave`, and drop the `if (saving) return` early-exit in favor of the mutation's own concurrency (guarded by disabled button only).
- **Silent guard exit**: add a user-visible `toast.error(...)` on every early return in `handleSubmit` (license gate, access guard, Swal cancel is fine to stay silent) and in `handleSave` (missing `id`).
- **Access guard false-negative**: fall back to allowing submit when `accessGuard.verify` throws or returns a non-boolean, and surface the underlying reason via toast.
- **Effect thrash in `SingleReturnForm`**: stabilize the effect deps by dropping `initialData` from the dep array (only re-seed when `resolvedVersionId` changes) so button re-renders don't compete with a state-set loop.

Also add a one-time `console.debug('[FillReturn] save click', { id, saving, formCount })` and equivalent for submit, gated behind `import.meta.env.DEV`, so future silent-click regressions are diagnosable.

## Out of scope
- No changes to `useSaveReturnFormData`, `useMutateReturn`, RLS policies, edge functions, workflow engine, `ReturnReviewPanel`, or admin-side return configuration.
- No visual/UI redesign.

## Technical notes
- Files touched: `src/pages/entity/returns/FillReturnPage.tsx` only.
- Verification: rerun Playwright — click Save Draft on a fresh TEMP return, assert "Draft saved" toast + `return_form_data` row or WIP transition; click Submit on Review tab, assert Swal appears and either blocks with validation errors or proceeds to `/entity/returns/:id/view`.
