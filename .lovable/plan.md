
## Why the error appears

I opened your `quarter1-return.xlsx` and traced it through the Excel importer (`src/components/form-builder/FileImport.tsx` → `parseExcelMultiSheet`). The file is shaped like this:

```text
Row 1:  A=""       B=""              C=2022     ← year, only value in C1
Row 2:  A=""       B=""              C="Q1"     ← period label
Row 3:  A=1        B="ASSETS - BS"   C=230064
Row 4:  A=1.1      B="LIQUID FUNDS"  C=57613.2
Row 5:  A="1.1.1"  B="NOTES..."      C=5110.8
...     319 rows total, then two empty sheets (Sheet2, Sheet3)
```

The importer tries three layouts, and this file matches **none** of them:

1. **Financial-statement layout** (`detectFinancialLayout`) — requires either a "Go to TOC" link **or** `Cover!` / "financial year" / "period end" metadata in the first 8 rows. Your workbook has neither → skipped.
2. **Template layout** — requires header row with `Label` / `Field Name` / `Type` / etc. Your row 1 is `("", "", 2022)` → no template headers → skipped.
3. **Auto-detect fallback** — treats row 1 as column headers. After `filter(Boolean)` your only header is `"2022"`, so the parser either (a) collapses everything into a single field called "2022" and drops the 317 real line items, or (b) throws inside the row-oriented branch because `headers.length` is 1 while column A/B mix numbers and text — which surfaces as the toast **"Failed to parse the uploaded file. Please check the format."**

So the error is not about a corrupt file — the importer simply doesn't recognise this common **line-number / label / value** return layout that Bank of Jamaica-style prudential returns use.

## Fix

Add a fourth detector in `FileImport.tsx` for line-item return workbooks, and route it through a small dedicated parser. No other files change.

### 1. `detectLineItemReturnLayout(sheet, data)`
Return a layout when a sheet matches all of:
- ≥ 10 non-empty rows.
- Column A of most data rows is a hierarchical line number (`1`, `1.1`, `1.1.1`, `1.1.2.5.2`, …) — regex `^\d+(\.\d+)*$`.
- Column B of the same rows is non-empty text (label).
- At least one column ≥ C contains numeric values for the same rows.
- Detects period metadata from top rows (`year` = first numeric like `2022` in C1..E2, `period` = first text like `Q1/Q2/Q3/Q4/H1/H2/FY` in C1..E2) — used only for form naming, not required.
- Value column headers = `Q1`, `Q2`, `Prior Year`, etc. taken from row 2 when present, otherwise `Value` / `Value 2` …

### 2. `parseLineItemReturnSheet(sheetName, data, layout, sheet, XLSX)`
- Iterate rows from the first line-item row.
- Section grouping: rows whose line number has **1 segment** (`1`, `2`, `3`) start a new `FormSection` using the label as its title. Deeper rows (`1.1`, `1.1.1`, …) become fields inside the current section, with the label prefixed by the line number for uniqueness.
- Each field:
  - `label` = `"{lineNo} {label}"`
  - `fieldName` = `toFieldName(line_{dotted}_col_{n})` (stable, matches the existing financial parser convention so `form_field_dependencies` keeps working)
  - `type` = `decimal` for numeric columns, `text` otherwise
  - Preserve any Excel formula on that cell via the existing `convertFormula` helper so ratios and totals become `calculated` fields.
- Return one `FormSection` per top-level line item, plus any collected `crossSheetRefs`.

### 3. Wire it in
In `parseExcelMultiSheet`, before the current `detectFinancialLayout` call, add:

```ts
const lineItemLayout = detectLineItemReturnLayout(sheet, data);
if (lineItemLayout) {
  const { sections, crossSheetRefs } = parseLineItemReturnSheet(sheetName, data, lineItemLayout, sheet, XLSX);
  // …push sheet, continue
}
```

Keep the existing detectors as fallbacks so nothing else regresses.

### 4. Guard the fallback throw
Wrap the row-oriented branch in a defensive try/catch that logs and skips the sheet instead of aborting the whole workbook — so a single unrecognised sheet never blocks import of the good ones. Empty sheets like your `Sheet2` / `Sheet3` are already skipped, but a defensive skip prevents future edge cases.

## Verification

- Re-import `quarter1-return.xlsx`; expect a return template named "quarter1-return" with one form ("Sheet1"), sections `1 ASSETS - BS`, `1.1 LIQUID FUNDS` (nested under ASSETS), etc., and a numeric field per line item under the `Q1 2022` column.
- Existing financial-statement templates (JMF prudential workbooks with `Cover!` / `Go to TOC`) still parse unchanged — new detector short-circuits only when the line-number pattern matches.
- Empty trailing sheets remain skipped.

## Files touched

- `src/components/form-builder/FileImport.tsx` — add two functions, one call site, one defensive try/catch. No DB, RLS, edge functions, or other UI files change.
