## Revision — Keep Sector Information as in the legacy form

The prior plan already places **Sector Information** in the new dynamic `form_schema` (Sector → Sub-Sector → Category, all required, cascading). This revision only clarifies that the Sector step must match the legacy config **exactly** — same fields, same labels, same required flags, same cascading behavior, same UI (rendered by the existing `SectorSelectionSection` inside the dynamic stepper).

### Change to the plan
- In the new `Standard Registration (v2)` `form_schema`, the **Sector Information** step is copied verbatim from the legacy config row (`id='22a5fcb8-...'`):
  - Field 1: `sector_id` — Sector * (Select, active sectors, scoped by resolved regulator)
  - Field 2: `sub_sector_id` — Sub-Sector * (Select, cascades from sector)
  - Field 3: `category_id` — Category * (Select, cascades from sub-sector)
  - Same helper text: *"Select the sector, sub-sector, and category for your license application."*
  - Same step title: *"Sector Selection Information"*
- No new sector-related fields, no reordering inside the Sector step, no styling change.
- All other parts of the previous plan stand: legacy row flipped inactive; new row inserted active/default; Applicant & Address, PPOC, Documents, Declarations steps mirror the screenshots; no schema DDL; no middle name; sector-dropdown fallback in `NewApplication.tsx` unchanged.

### Implementation touch points
- **Database:** re-issue the same `UPDATE` + `INSERT` on `registration_form_configs`, with the Sector step JSON copied byte-for-byte from the legacy row's `form_schema`.
- **Frontend:** no additional changes beyond the previous plan — `SectorSelectionSection.tsx` already renders these three fields with cascading behavior and is what the dynamic stepper already uses.

### Out of scope
- No changes to `useSectors`, RegulatorContext, admin master data, or the sector-empty fallback logic in `NewApplication.tsx`.
- No Middle Name, no auth/OTP/document/approval changes.

### Verification
- `/admin/registration-forms`: new row Active/Default, legacy row Inactive.
- `/register`: Sector step renders the same three cascading selects as the legacy form, with identical labels and validation.
- Playwright smoke: complete a new registration, confirm `sector_id`, `sub_sector_id`, `category_id` land on `registrations`.

### Rollback
- Single `UPDATE` flipping `is_active`/`is_default` back to the legacy row.
