# Make the Edit Ratio dialog usable by non-technical staff

## Problem

The dialog asks the author to type raw technical strings:

```text
7ac713bf-4866-4570-988e-8cf3cbd2369d.line_4_col_1 / 59ebe8fc-b5dd-476c-8d6e-2004855227ff.line_1_col_1
```

Nobody outside engineering knows a form's internal id or a line code. "Ratio key" and "Metric key" are equally opaque. The only friendly element today is the read-only "Reads as" preview.

## What changes

The dialog keeps the same fields and saves the exact same stored formula — only the way the author builds it becomes guided.

**1. Guided formula builder (default view)**

Replace free typing with a small builder:

- Rows of "Numerator" and "Denominator" (the common ratio shape), each built from picks, plus buttons to add another term with `+ - * /`.
- Each term is chosen with two friendly dropdowns:
  - **Form** — only the forms actually attached to the selected Return Configuration ("Balance Sheet", "P&L"), searchable.
  - **Line item** — the field labels of that form's latest published version ("ASSETS", "OPERATING INCOME – EARNINGS & EXPEND."), searchable, with the line code shown as small secondary text so power users can still confirm.
- Alternatively a term can be a plain **number** (e.g. `100`) or **another ratio** (picked by its label).
- Parentheses supported via a "group" wrapper on a term list.
- The live "Reads as" line stays, showing e.g. `P&L › OPERATING INCOME / Balance Sheet › ASSETS`.
- Form dropdown is disabled until a Return Configuration is chosen, with a hint saying so.

**2. Advanced mode escape hatch**

A "Advanced (edit expression)" toggle reveals today's textarea unchanged, so existing power users can paste exact expressions. Switching from Advanced back to guided is allowed only when the expression is parseable into terms; otherwise the dialog stays in Advanced and says so. Existing ratios open in guided mode when their formula parses, else in Advanced.

**3. Plain-language labelling of the other fields**

- "Ratio key" → **Internal code** with helper text "Used by reports and thresholds. Auto-filled from the label — change only if you know why." Auto-generate from Label for new ratios (slugified, editable).
- "Metric key (links to threshold)" → **Link to threshold** as a dropdown of existing thresholds for that configuration (by label), plus "None". Free text stays available in Advanced mode.
- "Display format" gets one-line examples (Percent → `12.5%`, Ratio → `1.25x`).
- Validation messages become plain: "Pick a form and line item for the numerator", instead of the generic "formula is required".

## Scope guard

- Stored `formula` string format is unchanged; evaluation (`src/lib/returnsRatios.ts`), versioning, archive/restore, RLS and RPCs are untouched.
- Table, version-history modal and validations page rendering stay as-is (they already use the readable `FormulaText`).
- The same builder is reused later for Manage Validations only if requested — not in this change.

## Technical notes

- New hook `src/hooks/useConfigFormFields.ts`: for a `return_config_id`, read `return_config_forms` → `form_templates` (name), then the latest published `form_versions` per template → `form_fields` (`field_name`, `label`, ordering). Returns `{ forms: [{ id, name, fields: [{ name, label }] }] }`, React Query cached. Mirrors the resolution logic already in `useFormulaLabels.ts`; the label tidy-up reuses `cleanLabel`.
- New component `src/components/prudential/FormulaBuilder.tsx`: controlled `value: string` / `onChange`, internal term model `{ kind: 'field' | 'number' | 'ratio' | 'group', ... }`, a `parseFormula(expr)` for round-tripping simple `+ - * /` expressions with parentheses, and `serialize()` producing the canonical `formId.field_name` string. Returns `null` from the parser on anything it can't represent, which triggers Advanced mode.
- Threshold dropdown sources from the existing `useThresholds(configId)` hook in `src/hooks/usePrudentialConfig.ts`.
- Wire into the Add/Edit dialog in `src/pages/returns-mgmt/PrudentialRatios.tsx` only; the dialog body moves into `src/components/prudential/RatioEditDialog.tsx` to keep the page file small.
- Verified live in the running app: build a ratio with the pickers, save, and confirm the stored formula and table rendering are identical to what typing produced.
