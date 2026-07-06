## Why only Balance Sheet appears today

Data check: the return configuration **"Balance Sheet"** already has **both** forms linked in `return_config_forms` (Balance Sheet + P&L, both `active`, both `published`, both effective now). They also share the same `tab_name = 'General'` and `display_order = 0`, so `FillReturnPage` stacks them as two cards inside a single "General" tab.

Result on screen: the P&L card is being rendered — but it sits **below** the Balance Sheet card inside the same tab, with no counter, no per-form status, and no navigation between them. On a long Balance Sheet (dozens of rows) it looks like there is only one form.

## What to build

Rework the Fill Return screen to mirror the **multi-form application workflow** so the licensee always knows how many forms belong to the return and can move between them.

### 1. Header summary strip (new)
Above the tabs, show a compact strip:

```text
Forms in this return: 2   [Balance Sheet ✓ Completed]  [P&L ● In Progress]  [1 / 2 done]
```

- Total form count pulled from `effectiveConfigForms.length`.
- Per-form status pill: `Not started` / `In Progress` / `Completed`, computed from `allData[form_id]` (any value present → In Progress; all required fields filled → Completed, reusing the same helper the Review panel uses).
- Overall progress `X / N done` + a slim progress bar (`Progress` from shadcn).

### 2. One tab per form (replaces "General" bucket)
Change the tab grouping in `FillReturnPage`:

- Instead of grouping by `tab_name`, create **one tab per linked form** (ordered by `display_order`, then name).
- Tab label = `form_templates.name` + status dot.
- Keep the existing final `Review & Submit` tab unchanged.
- Preserve the current fallback branch (no config-linked forms → `fallbackConfigForms`), just render it the same way.

### 3. Prev / Next form navigation
Inside each form's `TabsContent`, add a footer row:

- `← Previous form` (disabled on the first) / `Next form →` (last one goes to `Review & Submit`).
- Left side shows `Form 1 of 2 — Balance Sheet`.

### 4. Review & Submit panel
`ReturnReviewPanel` already receives `forms={effectiveConfigForms.map(...)}`. Extend it to show, per form:

- form name, tab label (kept for back-compat),
- completion badge (same helper as the header strip),
- a "Go to form" link that switches the active tab back to that form.

Submit button stays disabled until every form's status is `Completed` (matches how application submission is gated).

### 5. Empty / single-form behaviour
- If only **one** form is linked, hide the header strip and Prev/Next controls — the screen degrades to today's single-card layout.
- Keep the existing "No active return forms…" empty state.

## Files to change

- `src/pages/entity/returns/FillReturnPage.tsx`
  - Replace `tabs` memo: one tab per form (not per `tab_name`).
  - Add header summary strip + progress bar.
  - Add Prev / Next footer inside each `TabsContent`.
  - Wire tab-switch handler passed into `ReturnReviewPanel`.
- `src/pages/entity/returns/ReturnReviewPanel.tsx` (or equivalent)
  - Accept `onJumpToForm(formId)` prop, render per-form completion badge + "Go to form" link.
  - Gate the submit action on all-forms-complete.
- `src/lib/returnsFormProgress.ts` (new, small helper)
  - `getFormStatus(form, data, fieldRows) → 'not_started' | 'in_progress' | 'completed'`
  - Used by both the header strip and the Review panel so the two views can't disagree.

## Out of scope

- No DB schema, RLS, or edge function changes — the forms are already linked correctly.
- No changes to `useReturnConfigForms`, resolver, or the Excel importer.
- No changes to admin-side Form Management or `return_config_forms` upsert flow.
