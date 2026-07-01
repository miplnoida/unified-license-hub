## Fix Back button on License Detail page

**File:** `src/pages/licenses/LicenseDetail.tsx` (lines 681–682)

The `PageHeader` currently hardcodes `backHref="/licenses"`, which is wrong when an admin/internal user arrives here from `/admin/licensees` (or the Licensee Entities admin listing).

### Change
Make the back target role-aware:

- If the current user is an internal role (`super_admin`, `admin`, `supervisor`, `licensing_officer`, `analyst` — reuse `INTERNAL_ROLES` already imported), set:
  - `backHref="/admin/licensees"`
  - `backLabel="Back to Licensee Entities"`
- Otherwise keep:
  - `backHref="/licenses"`
  - `backLabel="Back to My Licenses"`

Role is available via `useAuth()` (already imported and used elsewhere in this file). No other logic, styling, or data flow changes.

### Out of scope
- No changes to routes, `PageHeader` component, or the licensee-side "My Licenses" listing.
- No change to admin listing page itself.