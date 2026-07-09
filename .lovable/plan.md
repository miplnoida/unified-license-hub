Update the admin return-detail read-only table (`ReturnDataTable` in `src/pages/returns-mgmt/ReturnDetail.tsx`) to reduce visual density and improve numeric readability.

Changes:
1. Reduce table cell padding across the #, Label, and Value columns (use compact `py-1 px-2` / `p-2` sizing).
2. Right-align the Value column header and all value cells (`text-right`).
3. Update `formatCellValue` so numeric values render with up to 2 decimal places (e.g., `1,234.56`) while preserving existing file/array/object rendering.
4. Run the TypeScript check to ensure no regressions.

No other functionality or workflow logic will change.