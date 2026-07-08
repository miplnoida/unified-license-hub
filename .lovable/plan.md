## Problem

Every P&L form (all 11 sector templates, `form_templates.name = 'P&L'`) was built with **four fields per line code** — one each for 2022 Q1, Q2, Q3, Q4. Each return is already scoped to a single quarter via `returns_filed.period_start_date` / `period_end_date`, so a return should collect **one value per line**, not four.

Example (Commercial Bank P&L, published version `84869d01-…`):

```
line 4  OPERATING INCOME — 2022 Q1   (fieldName: line_4_col_1)
line 4  OPERATING INCOME — 2022 Q2   (fieldName: line_4_col_2)   ← wrong
line 4  OPERATING INCOME — 2022 Q3   (fieldName: line_4_col_3)   ← wrong
line 4  OPERATING INCOME — 2022 Q4   (fieldName: line_4_col_4)   ← wrong
```

Every P&L version has the same shape: **36 unique line codes, 144 total fields** (36 × 4). Balance Sheet is unaffected (294 unique lines / 317 fields, essentially 1 col per line).

## Data check (no data migration needed)

For the FinCorp Commercial Bank entity, all 17 quarterly P&L data rows were saved under `col_1` only. Zero rows exist in `col_2`/`col_3`/`col_4`. Collapsing the schema will not orphan any stored values.

## Fix

Single migration that rewrites `schema_snapshot` for every P&L `form_versions` row (11 templates × 1–2 versions each):

For each row in `rows[]`:
- If `fields[0].fieldName` matches `line_..._col_[2-4]` → drop the row.
- If `fields[0].fieldName` matches `line_..._col_1` → strip the trailing ` — 2022 Qn` from `label`.

Result per P&L form: 36 rows, one field each, labelled `OPERATING INCOME`, `INTEREST INCOME`, `LOANS, ADVANCES & DISC.`, etc.

Applied to both `draft` and `published` versions so the current published Commercial Bank / Building Society P&L forms are corrected too (they are the ones licensees actually see).

## Out of scope

- Balance Sheet schemas (already single-column).
- Any code changes — `FormRenderer` already reads the schema as-is.
- The BS/P&L data already loaded for FinCorp Commercial Bank (Q1 2022 – Q4 2025). Existing `col_1` values remain and will render correctly under the new schema.
- Any workflow, calculation, or UI logic.

## Verification after migration

```sql
SELECT fv.id, ft.sector,
       COUNT(DISTINCT f->>'lineCode')  AS unique_lines,
       COUNT(*)                         AS total_fields
FROM form_versions fv
JOIN form_templates ft ON ft.id = fv.template_id,
     jsonb_array_elements(schema_snapshot) s,
     jsonb_array_elements(s->'rows')       r,
     jsonb_array_elements(r->'fields')     f
WHERE ft.name = 'P&L'
GROUP BY fv.id, ft.sector;
```

Expected: every P&L version reports `unique_lines = total_fields = 36`.
