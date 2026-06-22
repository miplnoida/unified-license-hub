## Plan

### 1. Delete the 3 leftover sectors
Remove these along with their dependent sub-sectors / categories:
- Credit Union (no regulator)
- Trust & Corporate Service Provider (no regulator)
- Cooperative (Regulator 2)

I'll first check for references (licenses, applications, fee_configurations, etc.) and either block or null them out before deleting, so nothing breaks.

### 2. Scope sector/sub-sector/category dropdowns to the active regulator
Replace unscoped `useSectors()` calls with `useSectors(activeRegulator?.id)` (and the equivalent for sub-sectors / categories) in:

- `src/pages/NewPostLicenseApplication.tsx`
- `src/pages/NewApplication.tsx`
- `src/pages/admin/FormBuilder.tsx`
- `src/pages/admin/PostLicenseForms.tsx`
- `src/pages/admin/PreLicenseForms.tsx`
- `src/pages/admin/FormManagement.tsx`
- `src/pages/settings/LicenseExpirySettings.tsx`
- `src/components/registration/SectorSelectionSection.tsx`
- `src/components/registration/RegistrationStepRenderer.tsx`
- `src/components/registration/useReviewValueResolver.ts`

`RegulatorManagement.tsx` keeps the unfiltered call (it needs all sectors to assign unassigned ones).

No other functionality changes.
