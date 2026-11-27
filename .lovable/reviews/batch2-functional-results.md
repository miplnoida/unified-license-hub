# Batch 2 functional results — read-only (2026-11-27)

Method: signed in as the super administrator, browser on localhost. PATCH, PUT and DELETE requests, direct table inserts and every backend function call were aborted (0 attempted during the sweeps). Public pages were opened in a signed-out context. No record was created or changed.
Workbook: F03-01..06, F04-01..07, F05-01..06 in `OLRAS_Master_Certification.xlsx`. Every write case (‑A positive, ‑C persistence) is **NOT TESTED – needs approval** unless stated otherwise.

| Workbook | Screen(s) | Read-only result |
|---|---|---|
| F03-01 Registration | /register, /register/applicant, /register/entity, /admin/registration-review(+detail REG-2026-000205), /admin/registration-forms | Pages open, and the review list search works (REG match, nonsense → 0). /register/entity shows "Sign in required" when signed out, as designed. |
| F03-02 Entity matching | /licensing/entity-resolution(+ERC-20261022-48298), /persons/identity-queue | Pages open, no errors. The list has no search box. |
| F03-03 Change mgmt | Entity 360 → Regulatory history | **Defect (backend):** `entity360_timeline` returns 400 (STABLE + temp table). The timeline still renders from another source. |
| F03-04 Persons | /persons/:id | Person party opens. **Fixed:** opening an organisation party showed the raw code `PERSON_PARTY_REQUIRED` after about 7s of retries. It now shows a plain message straight away. |
| F03-05 Ownership | Entity 360 Ownership / Group relationships, /entities/:id/structure | Open, no errors. |
| F03-06 Entity dossier | /entities, /entities/:id (22 sections clicked) | All sections open with no error text. Entities list paging works. Licences and Prudential section clicks timed out in automation (selector), not verified. |
| F04-01..05 Applications | /applications, /queue, /new, APP-2026-002019 (11 tabs) | List search works. All tabs open, and the Decision gates display. **Defect (backend):** Communications tab, `correspondence_thread_feed` 400. |
| F04-06/07 | Decision tab / AI | Display only. Not exercised (AI calls blocked). |
| F05-01..06 F&P | /fpa hub (5 stage tabs) and 14 sub-pages | All open with no errors. Individual Register search works. |
| Public register | /registry/entities | **Fixed:** the failed search showed "No published entities match". It now says the register could not be loaded. Browser-verified. Underlying cause, not changed (grant): anon has no EXECUTE on `public_entity_register_search`, so the public register is empty for every visitor. Public pages also get 401 on `monetary_config_resolve` and `currencies`. |

Backend proposals: `batch2-volatility-fix-approval.md` (three functions). Public register anon EXECUTE is a permission change, listed only and not drafted, given the holds.
