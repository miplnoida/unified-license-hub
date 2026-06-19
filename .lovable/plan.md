## Plan: Prevent duplicate fee configurations

In `src/pages/admin/FeeManagement.tsx` `handleSave`, before insert/update, query existing `fee_configurations` rows scoped to the same `regulator_id`, `sector_id`, `sub_sector_id`, and check for any conflict on the chosen scope:

- **Category scope**: conflict if any existing row matches `category_id` AND has the same `fee_type` (with `service_id` null and `form_id` null).
- **Services scope**: conflict if any existing row matches any selected `service_id` AND same `fee_type`.
- **Individual form scope**: conflict if any existing row matches any selected `form_id` AND same `fee_type`.

When editing, exclude `editing.id` (and its sibling rows from the same logical fee, matched by name + regulator + sector + sub_sector) from the duplicate check.

If a conflict is found, show a toast like "A fee already exists for this {category|service|form} and fee type" and abort — no insert/update. Otherwise proceed with the existing save flow unchanged.

No schema changes, no other functionality touched.