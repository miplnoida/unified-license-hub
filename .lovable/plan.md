## Goal
Make uploaded return data appear in the licensee return form immediately after parsing/importing, on the specific fill page and all similar return fill sessions.

## Proposed Fix
1. **Refresh saved return data after import deterministically**
   - Update the `onImported` flow in `FillReturnPage` so it does not only invalidate the query.
   - Await a fresh `return_form_data` refetch, then rebuild `allData` and `versionByForm` from the refetched rows.

2. **Remount form tabs only after fresh data is loaded**
   - Keep the existing `importNonce`, but bump it after `allData` has been hydrated from the refreshed data.
   - This ensures `FormRenderer` receives imported values as `initialData` on remount.

3. **Prevent stale blank state overwrite**
   - Avoid the current sequence where `allData` is cleared and the form subtree remounts before the refetch has returned, which can leave the renderer seeded with `{}`.

4. **Harden field visibility for import preview**
   - If parsed rows exist, keep showing the parsed summary before commit.
   - After commit, show a success toast with written count and ensure the active tab displays the updated values.

## Technical Scope
- Frontend only unless validation shows the RPC did not write rows.
- Primary file: `src/pages/entity/returns/FillReturnPage.tsx`.
- No changes to backend permissions, RPC, or template parsing unless the refreshed query returns zero rows after import.

## Verification
- Use the affected return fill route.
- Upload a template with values, confirm parsed rows are present, click **Import into Return**.
- Verify imported values render in the form tabs without page refresh.
- Verify Save/Submit still uses the imported values.