# Fix blank Conduct Category / Product / Channel dropdowns

## Why they are blank

The master data exists — 11 conduct risk categories, 13 products, 6 channels, all marked active. The problem is access, not missing data.

All three reference tables (`conduct_risk_categories`, `conduct_products`, `conduct_channels`) have a single read policy that requires the `market_conduct.view` permission. Checking which internal roles actually hold that permission:

- Have it: Analyst, Prudential Supervisor, System Administrator, Legacy Admin (and any super admin)
- Do NOT have it: Market Conduct Supervisor, Investigator, Licensing Officer, Executive Supervisor, Legal/Compliance Reviewer, Insurance Regulator, Payment Systems Supervisor, Approver/Decision-Maker, Committee Member

So the very roles that record complaints cannot read the conduct reference lists. The database returns a permission error, and the internal complaint form swallows it (`data ?? []`), so the user sees three silently empty dropdowns instead of an error. Complaint Types loads fine because that table has a broader read policy — which is why only these three look broken.

## Fix

1. **Broaden read access to the reference lists.** Replace the read policy on the three tables so any authenticated internal staff member with market conduct view, complaint management view, or complaint management manage rights can read them. Write access stays restricted to the existing manage-monitoring-rules permission — only reads change.
2. **Grant `market_conduct.view` to the conduct-facing roles** that plainly need it: Market Conduct Supervisor and Investigator. This also unblocks the rest of the conduct module for them, not just the dropdowns.
3. **Stop the silent failure in the form.** In the internal complaint intake, surface load errors instead of discarding them: show an inline message under each affected dropdown when the list is empty or failed to load ("No conduct categories available — add them under Admin Hub, or contact an administrator if you expect entries here"), and a toast when the reference query errors. Same treatment for the conduct classification card used on complaint detail.

## Steps to add this master data (for your reference)

Conduct Category:
1. Admin Hub → Conduct → Risk Taxonomy (`/admin/conduct/risk-taxonomy`)
2. Add Category → enter Code, Name, optional Parent (for sub-categories), Severity Hint, Sort Order
3. Keep Active checked → Save. It appears immediately in the complaint form dropdown.

Product:
1. Admin Hub → Conduct → Products & Channels (`/admin/conduct/products-channels`), Products tab
2. Add Product → Code, Name, Sector, Sub-Sector, description
3. Keep Active checked → Save.

Channel:
1. Same page, Channels tab
2. Add Channel → Code, Name, Kind (e.g. branch, digital, agent, call centre)
3. Keep Active checked → Save.

Both admin pages require market conduct manage rights; they are visible to System Administrator / Super Admin today.

## Technical notes

- Migration: drop and recreate `conduct_cfg_read` on the three tables with the widened `USING` clause (super admin OR `market_conduct.view` OR `complaint_management.view` OR `complaint_management.manage_complaints`). Existing grants are already correct — no GRANT changes needed.
- Data change: insert `role_permissions` rows linking the Market Conduct Supervisor and Investigator roles to the `market_conduct.view` permission, guarded against duplicates.
- Frontend: `src/pages/complaints/NewInternalComplaint.tsx` (return the query error rather than coercing to `[]`, render empty-state hints) and `src/components/complaints/ConductClassificationCard.tsx` (same pattern). No change to submission logic or validation.

## Verification

- Re-check that each of the affected roles resolves the three reference lists.
- Open the internal complaint form and confirm the three dropdowns list the existing 11 categories, 13 products and 6 channels, and that an empty list now shows guidance instead of a blank menu.
