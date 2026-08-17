# Make prudential ratio formulas readable

## Problem

Ratio formulas are stored using machine tokens: `<form id>.<field name>`, e.g.

```text
7ac713bf-4866-4570-988e-8cf3cbd2369d.line_10_col_1 / 59ebe8fc-b5dd-476c-8d6e-2004855227ff.line_1_col_1
```

These are shown raw in the Formula column of Prudential Ratios and in the version history modal, so a non-technical reviewer cannot tell what the ratio measures. The underlying names do exist: the first UUID is the "P&L" form, the second is "Balance Sheet", and each field name maps to a label (`line_1_col_1` = "ASSETS - BS", `line_10_col_1` on P&L, etc.).

## What changes (display only)

Render the same formula in plain language while keeping the stored formula untouched:

```text
P&L › NET PROFIT / Balance Sheet › ASSETS
```

- Unresolved tokens (deleted form/field) fall back to the raw token, visually marked so it is obvious something is missing.
- `$other_ratio` references inside a formula resolve to that ratio's label.
- The raw technical formula stays available on hover (tooltip) and remains what the edit dialog shows and saves, so admins can still author/paste exact expressions.

Applies to:
1. Formula column in the ratios table.
2. Each version row in the version history modal.
3. A read-only "Reads as" preview line under the formula textarea in the add/edit dialog, so the author can confirm they picked the right lines.

## Technical notes

- New hook `src/hooks/useFormulaLabels.ts`: given a set of formulas, extract `uuid.field_name` tokens, then fetch
  - `form_templates` (id, name) for the referenced template ids, and
  - `form_fields` (field_name, label) joined to the latest published `form_versions` row for those templates,
  building a `Map<"templateId.fieldName", { form, field }>`. Cached with React Query, one batched query pair.
- New presentational component `src/components/prudential/FormulaText.tsx`: tokenizes the formula string, swaps resolved tokens for `Form › Label`, leaves operators/numbers as-is, wraps output in a tooltip carrying the raw formula. Ratio-label lookup for `$key` tokens comes from the ratios list already loaded on the page.
- Wire into `src/pages/returns-mgmt/PrudentialRatios.tsx` (table column, history sheet, edit dialog preview). No schema, RPC, or evaluation-logic changes; `src/lib/returnsRatios.ts` continues to evaluate the raw stored formula.

## Also worth doing (same grammar, same problem)

The Manage Validations page and prudential threshold/stress metric expressions display the same raw token style. Reuse `FormulaText` there so the whole prudential config area reads consistently.
