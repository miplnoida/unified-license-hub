## Add Balance Sheet & P&L returns forms for remaining sectors

### Current state
Balance Sheet + P&L returns forms exist for 3 sectors: **Building Society**, **Commercial Bank**, **Financial Holding Company / Group**. The Commercial Bank pair is quarterly and published (v2); the other two pairs are not yet marked quarterly. Each form is a `form_templates` row (`form_type='returns'`) with a matching `form_versions` schema snapshot and a legacy `forms` row.

### Remaining sectors to add
Balance Sheet + P&L will be created for these 6 sectors (each with matching sub-sector + category already in master data):

1. Financial Group
2. General Insurance
3. Life Insurance
4. Merchant Bank
5. Micro-credit Institution
6. Securities Dealer

**Money Service Business** is skipped — it has no sub-sector or category in master data, so the mandatory taxonomy on Returns forms can't be satisfied. If you want it included, add a sub-sector + category for it first (or tell me to auto-create them).

### What gets created per sector (data-only migration, no code changes)
For each of the 6 sectors, insert:

- **Balance Sheet** — `form_templates` row cloned from Commercial Bank Balance Sheet (5 sections) + a `form_versions` v1 with the same `schema_snapshot` + legacy `forms` row.
- **P&L** — `form_templates` row cloned from Commercial Bank P&L (7 sections) + a `form_versions` v1 + legacy `forms` row.

Fields set on every new template:
- `form_type = 'returns'`
- `return_type_id = QUARTERLY` (c7634c02-b23f-4ca9-9651-8fdb867e76f4)
- `sector_id` / `sub_sector_id` / `category_id` and their text-name mirrors set to the target sector's values
- `tab_name = 'Sheet1'`, `form_order = 0`, `is_reusable = true`
- `regulator_id` copied from the source Commercial Bank template
- `status = 'draft'` (matches the safe default; publish from the Form list when ready)

Also backfill the 2 existing pairs that are missing `return_type_id`: set Building Society and Financial Holding Company / Group Balance Sheet + P&L to `return_type_id = QUARTERLY`.

### Out of scope
- No changes to `FormBuilder.tsx` or any other code.
- No changes to `return_configurations` (that table is a separate scheduling layer and isn't currently linked to these template rows).
- No changes to schemas, RLS, or other form types.

### Confirm before I run
1. Skip Money Service Business (default) or auto-create a sub-sector + category named "Money Service Business" for it?
2. Create the new forms as **draft** (default) or **published** immediately?
