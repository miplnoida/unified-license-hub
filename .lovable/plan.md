# Fix: Return-form fields sharing values (1.3.1 overlap)

## Root cause

In `form_fields`, multiple rows in the same section share the same `field_name` (e.g. `line_1_3_1_col_1`) but have different labels ("ELIGIBLE AS LIQUID ASSETS…" vs "FROM BANK OF JAMAICA…"). The renderer keys form values by `field_name`, so typing into one row writes to the shared key and both rows display the same value (399 in the screenshot).

Evidence from DB (section `14c3cfed…`):
- `line_1_3_1_col_1` → "ELIGIBLE AS LIQUID ASSETS…"
- `line_1_3_1_col_1` → "FROM BANK OF JAMAICA…" (duplicate key)
- `line_1_3_1_col_1_new` → "FROM BANK OF JAMAICA…" (earlier manual patch attempt)

Same pattern repeats across sections `7adde37e…` and `f226b7df…`, and for other line codes (1.3.2 OTHER, 1.3.2.1, 1.3.2.2). Likely produced by the Excel import when two spreadsheet rows share a numeric code prefix.

## Fix

Two parts:

### 1. Data migration — de-duplicate existing `field_name` values

For every section, detect duplicate `field_name`s and rename the 2nd, 3rd, … occurrence by appending `_b`, `_c`, … while keeping the first occurrence stable (so already-saved values on the first row remain intact).

```text
per section:
  group by field_name
  order duplicates by sort_order, id
  keep the first
  rename subsequent to `${field_name}_b`, `_c`, …
  ensure new names don't collide with existing rows
```

Applied to `form_fields`. No changes to submitted `return_form_data` payloads — existing rows keyed by the old duplicate key already only match the first (kept) field, which matches current on-screen behavior; the newly-renamed rows will simply start blank, which is the intended state.

### 2. Import guard — prevent recurrence

In the returns/form Excel importer (the code path that seeds `form_fields`), when a candidate `field_name` already exists inside the same section, auto-suffix `_b`, `_c`, … before insert. I'll locate the importer via `rg` on `form_fields` inserts under `src/lib/` and `supabase/functions/` and add the suffixing there. No behavior change for non-colliding imports.

## Out of scope

- No renderer change: `field_name` uniqueness per section is the right contract.
- No touch to submitted historical data.
- No UI change to the numeric prefix column ("1.3.1" is a label artifact, not the key).

## Verification

- Re-query duplicates: `select section_id, field_name, count(*) from form_fields group by 1,2 having count(*) > 1;` returns 0 rows.
- Reload the BS weekly return: the two "1.3.1" rows accept independent values.
- Re-run an Excel import with an intentionally colliding sheet: second row lands as `_b` and both render/save independently.
