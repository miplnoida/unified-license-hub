## Credit Union Post-Licensing: new records only

Add 15 new post-licensing services and 15 new draft forms under **Credit Unions → Credit Union**. Nothing that already exists is changed.

**What gets created**
- 15 services, all **Inactive**, tagged `CU-POSTLIC-2026-10`, with codes CU-PL-02 to CU-PL-16.
- 15 forms named `CU - <Service>`, all **Draft**. Each has 5 sections and one draft version (v1).
- 270 form fields in total.
- Every new record gets a fresh ID from the database's own ID generator. No existing service or form ID is reused or referenced as a target for change.

**What stays untouched**
- Historical Micro-credit Institution services, forms, fees and their dependencies.
- Other sectors and Credit Union League.
- Workflows, fees, applications, licences and roles.
- Licence Renewal: there is no new renewal service. The existing renewal on Licence Details stays in use.

**Workflows (linked, never modified):** Standard `7e9e0fc2…`, Enhanced `2b5fdc86…`, Fit & Proper `24d71346…`, Notification `d2590edc…`.

**Provisional items:** approval vs notification, SLA days and fees all need regulatory confirmation. No fee rows are created.

**Known gap, reported but not fixed:** three Credit Union licences have no sub-sector. If these services are ever switched on, those licences would see them. Keeping the services inactive blocks that for now.

**How it runs once you approve:** the insert runs as one data-only operation. It is all-or-nothing, and running it twice adds nothing. It finishes with count checks. Per your instruction, no SQL, Markdown or migration files are created.
