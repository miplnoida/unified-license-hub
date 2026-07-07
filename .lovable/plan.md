## Remove duplicate Sector step

The active `Standard Registration (v2)` config has 3 steps: Applicant & Address, PPOC, and Sector Selection. On the public `/register` page, the sector selection is also rendered by the hardcoded `SectorSelectionSection` card on Step 1 (Applicant & Address), so users see the same three cascading dropdowns twice — once on step 1 and again on step 3.

### Change
- Remove the third step (`id: "step-sector"`) from the `form_schema` of the active registration config (`registration_form_configs.id = 'd488a0b7-eea2-4c24-aca0-58373ba55597'`), leaving only:
  1. Applicant & Address
  2. Principal Point of Contact
- Sector, Sub-Sector, and Category continue to be captured via the existing hardcoded `SectorSelectionSection` on Step 1 (which already writes `sector_id`, `sub_sector_id`, `category_id` to the `registrations` table).

### Not changing
- No schema/DDL changes.
- No frontend code changes — `PreLicenseeRegistration.tsx` and `SectorSelectionSection.tsx` stay as-is.
- Legacy config (`22a5fcb8-…`) remains inactive; v2 stays active/default.
- Rollback: single `UPDATE` restoring the removed step JSON.

### Verification
- `/register` shows 2 steps in the stepper; sector selection appears only on Step 1.
- Complete a registration end-to-end; confirm `sector_id`, `sub_sector_id`, `category_id` still land on `registrations`.
