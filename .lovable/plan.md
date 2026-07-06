## 1. Return year list: 2021 → current year

**`src/pages/entity/returns/CreateReturnPage.tsx`** (line ~215–216)

Replace the current 5-year window:
```ts
const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
```

with a fixed range starting at 2021 through the current year, most recent first:
```ts
const currentYear = new Date().getFullYear();
const START_YEAR = 2021;
const yearOptions = Array.from(
  { length: Math.max(1, currentYear - START_YEAR + 1) },
  (_, i) => currentYear - i,
);
```

No other change needed — the Select already maps `yearOptions`.

## 2. Balance sheet line numbers not showing on section/heading rows

**Why the numbers are missing on the licensee fill screen**

`FormRenderer` (`src/components/form-renderer/FormRenderer.tsx`, ~line 789) only renders the `lineCode` chip inside the `Label` block, and the `Label` is skipped for display-only field types (`heading`, `section_title`, `paragraph`, `divider`, `banner`). The balance-sheet parent rows imported from Excel (`1 LIQUID FUNDS`, `1.1 …`, `1.1.1 …` when they carry no input) are stored as `heading` / `section_title` fields, so their `lineCode` never renders. Regular data rows already show the number correctly.

**Fix — render `lineCode` for display-only fields too**

In the `isDisplayOnlyFieldType(fieldType)` branch (~line 806–824) of `FormRenderer.tsx`, prefix the produced `input` (heading / paragraph) with the same monospaced number column used for normal fields, so headings render as:

```
[ 1.1 ]  LIQUID FUNDS
```

Concretely, wrap the returned block in a `flex items-baseline gap-2` container and, when `field.lineCode` is present, render:
```tsx
<span className="font-mono text-xs text-muted-foreground shrink-0 min-w-[3.5rem]">
  {field.lineCode}
</span>
```
before the heading/paragraph element. Keep `divider` unchanged (no lineCode).

No changes to parsing, DB schema, or builder screens — those already carry `lineCode` end-to-end (previous turn added `form_fields.line_code` and the snapshot preserves it).

## Files touched
- `src/pages/entity/returns/CreateReturnPage.tsx` — year range.
- `src/components/form-renderer/FormRenderer.tsx` — render `lineCode` for display-only field types.

## Verification
- Create Return dialog shows years 2026, 2025, 2024, 2023, 2022, 2021.
- Opening the imported Balance Sheet return in the licensee portal shows `1 LIQUID FUNDS`, `1.1 …`, `1.1.1 …` etc. with the number in the left column beside the heading; data rows continue to render the number as before.
