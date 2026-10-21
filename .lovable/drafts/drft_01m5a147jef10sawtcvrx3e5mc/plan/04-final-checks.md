## Final checks (read-only results)

**1. Eligibility for licences without a sub-sector.** The service picker shows active services by sub-sector when the licence has one. When it doesn't, it shows **every active service in the sector**. Three Credit Union licences have no sub-sector: FSRA-DEMO-CREDIT_UNIONS, FSRA-DEMO-AML-04 and FSRA-DEMO-AML-05. If the new services are ever activated, those three licences **would see them**. This is an eligibility gap that is reported, not fixed: no code is changed. Keeping the services inactive blocks this exposure completely. Two ways to close the gap before activation:
- give those three licences the Credit Union sub-sector through the existing licence-management process, or
- approve a code change separately.

Whether the server-side form lookup applies a stricter check hasn't been confirmed, so it's reported as UNKNOWN.

**2. #10 Change in Authorized Activities vs #15 Variation of Licence Conditions** (both provisional)
- **#10** adds or removes **regulated activities**, such as savings, lending, remittance or insurance agency. The form asks for:
  - current and proposed activities
  - a business plan and capital impact
  - risk and AML assessment
  - systems readiness
  - a board resolution

  Expected outcome: the licence scope is amended, with possible new conditions and possibly a site visit.
- **#15** changes the **terms or conditions attached to a licence** without changing activities, such as limits, reporting frequency or removal of a restriction. The form asks for:
  - the condition reference and its current wording
  - the proposed wording
  - justification and supporting compliance evidence

  Expected outcome: the condition is varied, refused, or replaced with an alternative.

**3. Form Builder structure match.** The form structure is stored as follows:
- `form_templates` (status `draft`, `form_type='post_license'`, `sector_id` / `sub_sector_id` / `service_id`, plus text mirrors `sector` / `sub_sector` / `service`)
- one `form_versions` row (version 1, `status='draft'`, `schema_snapshot` = the section and field JSON in the existing FormSection shape)
- `form_fields` linked by `version_id`, with section columns repeated on each row

These are the same three tables that the published "PLS -" forms use. `regulator_id` is set to the FSRA regulator.

**4. Rollback against dependencies.** `form_versions` is referenced with **RESTRICT** by application form requirements, application form versions, submission values, regulatory requests and returns. `services` is referenced by fees, effects, tasks and acknowledgements. Rollback therefore runs only behind a guard: it first counts every referencing row for the tagged records and **aborts if any count is above zero**. Once a record is referenced, it is retired (status `archived` / `inactive`) instead of deleted.

**5. Current counts (before):** 152 services, 213 form templates (22 draft), 228 versions, 8,696 fields, 144 fees, 16 workflows, 49 applications.
**Expected after:** 167 services, 228 templates (37 draft), 243 versions, about 8,876 fields. Fees, workflows and applications stay at 144, 16 and 49. Every other sector's counts stay identical.

## What happens when this plan is approved
Only one file is written: `docs/product/credit-union-post-licensing-configuration.md`. It contains:
- findings 1–5 above
- the 16-service matrix
- the complete field list per form
- the **exact proposed INSERT statements**, idempotent and tagged `CU-POSTLIC-2026-10`, with fixed workflow IDs: Standard 7e9e0fc2, Enhanced 2b5fdc86, Fit & Proper 24d71346, Notification d2590edc
- the guarded rollback script
- the before/after counts
- manual verification steps

The SQL appears **in the document only**. Nothing is executed, migrated, published or changed in code. A separate explicit authorization from you is needed before any SQL runs.
