## Goal
Seed a new post-license form template **"Balance Sheet Return"** with a published version and structured fields across three sections, then link it to a new monthly **Return Configuration** of the same name. No other functionality changes.

## Scope

### 1. `form_templates` row
- `name`: Balance Sheet Return
- `form_type`: `post_license`
- `status`: `published`
- `is_reusable`: true
- `regulator_id`: active regulator (first non-null from `regulators` table)
- `sector` / `sub_sector` / `category` / `service`: empty strings (applies for all sectors, matching existing pattern)

### 2. `form_versions` row
- `version`: 1, `semantic_version`: `1.0.0`, `status`: `published`, `published_at`: now, `effective_from`: now
- `schema_snapshot`: JSONB mirror of the fields below

### 3. `form_fields` rows — 3 sections, 15 fields

**Section 1: Assets Schedule** (`sec_assets`, order 1)
- `loans_by_category` — textarea — "Loans by Category (breakdown)"
- `investments` — number — "Investments"
- `liquid_assets` — number — "Liquid Assets (cash & equivalents)"
- `fixed_assets` — number — "Fixed Assets"
- `other_assets` — number — "Other Assets"
- `total_assets` — number (calculated) — expression sums the five above

**Section 2: Liabilities Schedule** (`sec_liabilities`, order 2)
- `deposits_by_type` — textarea — "Deposits by Type (breakdown)"
- `borrowings` — number — "Borrowings"
- `other_liabilities` — number — "Other Liabilities"
- `total_liabilities` — number (calculated)

**Section 3: Capital Section** (`sec_capital`, order 3)
- `paid_up_capital` — number — required
- `reserves` — number
- `retained_earnings` — number
- `regulatory_deductions` — number
- `total_capital` — number (calculated: paid_up + reserves + retained − deductions)

All numeric fields required except calculated totals; calculated fields use `calculated_expression` with the existing safe arithmetic parser.

### 4. `return_configurations` row
- `name`: Balance Sheet Return
- `frequency`: `monthly`
- `due_day`: 15
- `is_active`: true
- `regulator_id`: same active regulator
- `sector_id` / `sub_sector_id`: NULL (all sectors)

### 5. `return_config_forms` link row
- Ties the configuration to the new form template (`tab_name`: "Balance Sheet", `display_order`: 1, `status`: `active`).

## Delivery
Single `supabase--insert` call (data-only, no schema changes). No code, RLS, or UI edits — the existing Admin > Post-License Forms and Admin > Return Configuration pages will surface the new records automatically.

## Verification
Re-query `form_templates`, `form_fields`, `return_configurations`, and `return_config_forms` to confirm rows exist and the form renders in the admin list.
