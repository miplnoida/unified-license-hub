## Problem

On `/admin/returns/queue/87a20403-...`, the tabular submitted-data view is empty even though 6 rows exist across 2 forms in `return_form_data`. Version comparison works because we already routed revision reads through the `can_view_return_filed` visibility helper in the previous fix.

The current `SELECT` policy on `return_form_data` only allows:
- `created_by = auth.uid()`, or
- static admin/regulator roles (`super_admin`, `admin`, `supervisor`, `analyst`, `licensing_officer`), or
- licensee/PPOC mappings.

Reviewers routed to this return through the workflow (e.g. `legal_compliance` and other non-listed roles) don't match any branch, so `useReturnFormData` returns `[]` and `<ReturnDataTable>` renders with no values. The revisions RPC bypasses this because it uses the workflow-aware helper; the main table read does not.

## Fix

Extend the SELECT visibility on `return_form_data` to reuse the same `public.can_view_return_filed(auth.uid(), return_id)` helper we introduced for revisions, so anyone the workflow assigns to the return can read its submitted values on the admin queue view.

### Backend (single migration)

1. Drop existing SELECT policy `Licensee viewers read return_form_data` on `public.return_form_data`.
2. Recreate it as:
   ```sql
   CREATE POLICY "Return viewers read return_form_data"
     ON public.return_form_data FOR SELECT
     USING (public.can_view_return_filed(auth.uid(), return_id));
   ```
   The helper already covers: creator, static admin/supervisor/analyst roles, licensee/PPOC mapping, external capability gate, and workflow-assigned reviewers — matching (and superseding) the current branches.
3. Keep the external capability gate policy as-is (defense in depth).
4. Confirm `GRANT SELECT ON public.return_form_data TO authenticated` is present; add if missing.

### Frontend

No changes required — `useReturnFormData` will start returning the 6 rows once RLS allows it, and the existing `ReturnDataTable` will render values automatically.

### Verification

- Re-open `/admin/returns/queue/87a20403-86c0-49a1-aa07-2247b588e720` as the workflow-assigned reviewer: each form tab should render its rows with `Label` / `Value`.
- Regression check: licensee (owner) view of their own return still shows data.
- `security--linter` / scan after migration to confirm no new warnings.

## Out of scope

- Any UI/table styling changes.
- Changes to write policies (INSERT/UPDATE) — only SELECT visibility is broken.
- Changes to the revisions flow (already fixed).