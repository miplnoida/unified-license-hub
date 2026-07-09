## Plan: Restore Prudential Analytics data

1. **Fix licensee lookup column**
   - Update `PrudentialAnalytics.tsx` to select `licensees.id, name` instead of non-existent `legal_name`.
   - Display `name` in the Licensee dropdown.

2. **Make analytics queries more resilient**
   - Keep the current two-step lookup from `return_calculated_ratios` → `returns_filed` → `licensees`.
   - Add safe fallback labels if a licensee name is missing.
   - Clear stale selected licensee/period values when a newly selected ratio has a different dataset.

3. **Verify against actual data**
   - Confirm all active ratios return linked return IDs, entity IDs, and period-end dates.
   - Load `/admin/returns/prudential/analytics` and verify:
     - Ratio dropdown has 13 ratios.
     - Licensee dropdown lists the linked entities.
     - Period dropdown lists available period ends.
     - Trend and peer comparison charts render for a selected ratio.

Technical note: backend rows exist for all 13 ratios, but the UI is reading the wrong licensee column (`legal_name`), causing the client request to fail before dropdown options are built.