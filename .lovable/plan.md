## Add Balance Sheet & P&L returns forms for Money Service Business

Now that Money Service Business has sub-sector and category in master data, clone the Commercial Bank Balance Sheet and P&L returns templates for this sector — matching the same pattern used for the previous 6 sectors.

### Target taxonomy
- Sector: Money Service Business (`79bdf821-4ba0-4b59-9b46-0c1c6f1373e9`)
- Sub-Sector: Money Service Business (`427fb41f-6043-41ec-8ee0-f983f69155ab`)
- Category: Money Service Business (`f000a07e-5691-499a-befc-4456c2bd20e5`)

### What gets created (data-only, no code changes)
Two new `form_templates` rows + matching `form_versions` v1 snapshots:

1. **Balance Sheet** — cloned from Commercial Bank Balance Sheet (5 sections)
2. **P&L** — cloned from Commercial Bank P&L (7 sections)

Each new template gets:
- `form_type = 'returns'`
- `return_type_id = c7634c02-b23f-4ca9-9651-8fdb867e76f4` (Quarterly)
- `sector_id` / `sub_sector_id` / `category_id` set to MSB values (plus text-name mirrors)
- `regulator_id` copied from source Commercial Bank template
- `tab_name = 'Sheet1'`, `form_order = 0`, `is_reusable = true`
- `status = 'draft'` (publish from Form list when ready)

### Out of scope
- No changes to `FormBuilder.tsx` or any other code
- No changes to `return_configurations`, schemas, RLS, or other form types
- No touching the already-created 9 sectors
