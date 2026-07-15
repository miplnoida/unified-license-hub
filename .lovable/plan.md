# Licensee Application — Excel/XML Import (UI Only)

Add a bulk-fill capability to the applicant licensee application form that mirrors the existing Returns import experience. Users can download a sample Excel or XML template that reflects the current form schema, fill it offline, and upload it to populate the application. This plan covers UI only — no parsing logic, no backend writes, no DB changes.

## Scope

- Applicant-facing licensee application fill page (new + resume/continue).
- Mirror the visual/behavior pattern used by `src/components/returns/ReturnUploadPanel.tsx` on `FillReturnPage`.
- Templates regenerate automatically from the live form schema, so any backend form change flows through without code edits.

Out of scope: parsing engine, validation rules, actual data hydration into the form state, backend endpoints, audit logging. Those are Phase 2.

## UX

A new `ApplicationUploadPanel` sits above the form on the applicant application fill page, collapsible, with three actions:

1. **Download sample (Excel)** — generates `.xlsx` on the fly from the current form's sections/fields.
2. **Download sample (XML)** — generates `.xml` with the same schema.
3. **Upload filled file** — drag/drop or picker accepting `.xlsx` and `.xml`. Shows filename, size, and a disabled "Import into application" button with a "Coming soon — parser not wired yet" helper tooltip (UI-only phase).

Panel states: idle → file selected (preview list of detected sections) → parsing stub (spinner) → success stub ("Review changes below before importing" — same phrasing as returns) → error stub. All stubs use existing shadcn `Card`, `Button`, `Alert`, `Badge`.

Sample file contents:
- **Excel**: one sheet per form section; columns = Field label, Field key, Type, Required, Value (blank). Header row styled bold. Read-only helper sheet "Instructions".
- **XML**: `<application><section name="..."><field key="..." label="..." type="..." required="..."></field></section></application>` shell, empty values.

Both regenerate from the same schema source used by `FormRenderer`, so backend form edits (fields added/removed/renamed) are reflected on next download with no code change.

## Files

New:
- `src/components/applications/ApplicationUploadPanel.tsx` — the panel (mirrors `ReturnUploadPanel` structure).
- `src/lib/applicationTemplate.ts` — pure functions `buildApplicationExcelTemplate(schema)` and `buildApplicationXmlTemplate(schema)` returning Blobs. Modeled on `src/lib/returnTemplate.ts`.

Modified:
- Applicant application fill page (the route rendering `FormRenderer` for a licensee application — e.g. `src/pages/NewApplication.tsx` and the continue/resume page). Insert `<ApplicationUploadPanel schema={formSchema} />` above the form. No other logic touched.

## Technical Notes

- Excel generation: reuse `xlsx` (already a dep via returns template).
- XML generation: plain string builder, no new dep.
- Schema source: whatever object `FormRenderer` currently receives (sections → fields). Panel is a pure consumer — it re-reads on every render so backend changes propagate automatically.
- Import button stays disabled with tooltip until Phase 2 wires parsing + form hydration.
- No changes to routing, auth, RLS, or existing form submit flow.

## Verification

- Panel renders on applicant application fill page.
- Download buttons produce `.xlsx` and `.xml` reflecting current form fields (verify by editing a field label in admin form builder and re-downloading).
- Upload accepts files, shows filename; import button disabled with helper text.
- Existing form fill/submit behavior unchanged.

## Phase 2 (not in this plan)

Parser (`parseApplicationExcel` / `parseApplicationXml`), value coercion, diff preview, hydration into form state via an `importNonce` remount pattern (same as returns), audit logging.
