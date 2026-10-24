# Urgent: Rodney Bay returns missing for primary user + Session 3 data check

## What I found (checked in the database)

- `rbc_primary_user@yopmail.com` is set up correctly: Primary User, APPROVED membership and active access for Rodney Bay Community Credit Union Ltd.
- Rodney Bay has an active licence **LIC-2026-000166** (Credit Unions sector, issued 2026-10-22, valid to 2027-10-22).
- The Credit Union returns are configured: **Credit Unions - Annual Return** and **Credit Unions - Quarterly Return**, each with 2 forms (Balance Sheet, Profit & Loss) and an active sector rule.
- **Root cause:** Rodney Bay has **0 reporting obligations**. The licence was issued after the returns rules were set up, and the step that creates obligations and reporting periods for a newly licensed entity was never run for it. So the primary user's Returns page has nothing to list.

## Fix

1. Run the existing obligation-creation routine for Rodney Bay only, so its Annual and Quarterly obligations are created from the Credit Union rules.
2. Run the existing period-generation routine so the reporting periods from the licence date appear (Q4 2026 quarterly, due 30 days after quarter end; Annual 2026, due per the configured window). No new due-date logic; no other entity touched.
3. Sign in as `rbc_primary_user@yopmail.com` in the browser and confirm: both returns listed, the Open / File Return button shows, the opened filing shows Balance Sheet and Profit & Loss, and a draft can be saved. I will not submit unless you ask.
4. Recheck every Session 3 point in the document (portfolio, Entity 360, returns config, metrics, CAMELS assessment, thresholds/ratios, supervisory plan, prudential dashboard, corrective actions PA-CU-DEMO-2026-01..03, AML methodology, Marigot assessment, examination EXM-CU-DEMO-2026-01 with findings F1–F3) using the regulator account, and report each as Ready / Not ready with the reason. Data gaps found there will be listed for your approval before I create anything else.

## Not changed

Return configuration, forms, permissions, security rules, other entities, application APP-2026-002011, and all AML protected records.

## Technical details

- Calls `public.returns_derive_entity_obligations('cc331000-0000-4000-8000-000000000001')` then `public.returns_generate_periods` scoped to the new obligations (both idempotent).
- Verify with counts of `entity_reporting_obligations` and `reporting_periods` for the entity before and after.
