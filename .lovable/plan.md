
## Problem

On the licensee panel, the bulk-upload import RPC (`import_return_form_data`) writes values into `return_form_data` successfully, but the values do not appear in the form tabs after import.

Root cause is in `src/pages/entity/returns/FillReturnPage.tsx`:

- `onImported` clears `allData`, resets `initializedRef`, and invalidates the `return_form_data` query. The parent state (`allData`) does re-hydrate from the refetched rows.
- Each tab renders `<SingleReturnForm>` → `<FormRenderer initialData={...} />`. `FormRenderer` seeds its **internal** field state from `initialData` only on mount / when its resolved `form_version_id` changes. After an import the version does not change, so `FormRenderer` keeps its stale internal state and the imported values never show — even though `allData` in the parent is correct.

## Fix (frontend only, minimal)

Force the form subtree to remount after a successful import by bumping a nonce and using it in the tab's `key`.

**`src/pages/entity/returns/FillReturnPage.tsx`**

1. Add `const [importNonce, setImportNonce] = useState(0);`
2. In `onImported` (already resets `initializedRef`, `allData`, `versionByForm`, invalidates query), also call `setImportNonce(n => n + 1);`.
3. In the tab render loop, key each `<SingleReturnForm>` (or its wrapping `<TabsContent>` inner block) with `` `${cf.form_id}:${importNonce}` `` so the renderer unmounts / remounts and picks up the freshly hydrated `initialData` from `allData`.

That is sufficient: once `savedFormData` refetches, the parent `useEffect` re-populates `allData`; the remounted `FormRenderer` seeds from the new `initialData`, so imported values render in every tab.

No backend, RPC, or RLS changes are needed — the data is already being written correctly.

## Verification

- Download template, edit a couple of values, upload, click Import.
- Tabs should immediately show the imported values in their fields (both "Fill blanks only" and "Replace" strategies).
- Existing typed values that were not touched by the upload remain unchanged.
- Save / Submit continue to work.
