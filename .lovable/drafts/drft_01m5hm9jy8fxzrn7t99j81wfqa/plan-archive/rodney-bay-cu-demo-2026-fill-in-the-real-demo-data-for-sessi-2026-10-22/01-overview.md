# Rodney Bay CU-DEMO-2026: fill in the real demo data for Sessions 2 and 3

## What I checked before writing this (read-only)
- **Licence LIC-2026-000166** is active, but it is held by the applicant account (rodneybay.registration@yopmail.com). That is why rbc_primary_user sees 0 licences.
- **Post-licensing:** all 15 Credit Union services (CU-PL-02 to CU-PL-16) are **inactive**, and **no Credit Union post-licence form exists**. That is why the forms are empty. The licence is not the blocker.
- **Returns:** there are **no** Credit Union return configurations, templates or return forms. The 4 existing configurations are for banks and insurers. Rodney Bay cannot file any return.
- **Prudential assessment** cd600001 is a draft with a rationale only. It has no ratings, evidence, observations or financial figures.
- **Pre-licence form:** APP-2026-002011 is submitted and approved, so I leave its answers alone.

## Decisions you approve with this plan
These are configuration changes made through the normal admin screens. They are not code, schema or security changes.
1. **Licensee-side account.** I record the licensee screens as **rodneybay.registration@yopmail.com**, the licence holder. Licence visibility rules stay as they are.
2. **Post-licensing.** I build and publish Credit Union forms for 3 services and activate only those services:
   - Change of Registered Address (CU-PL-02)
   - Appointment of Director (CU-PL-04)
   - Change of Compliance Officer / MLRO (CU-PL-07). This fits the story of the withdrawn compliance officer.

   The other 12 services stay inactive and are reported as such.
3. **Returns.** I create one quarterly Credit Union prudential return (balance sheet, income statement, ratios) for Saint Lucia FSRA, with its form and filing configuration.
   - Only periods that the schedule actually opens after the licence date (22 Oct 2026) can be filed.
   - I will **not** backdate obligations or create submission history for earlier quarters.
   - The fictional figures for all four quarters are still prepared and used in the assessment as supporting financial information.
