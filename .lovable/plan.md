# Rodney Bay primary user – Returns check and fix

## Checked as rbc_primary_user@yopmail.com (browser, signed in)

- Returns page opens, "Acting as Primary Representative for Rodney Bay Community Credit Union Ltd".
- **Obligations Calendar: working.** All 10 returns listed (Annual 2025, 2026; Quarterly 2025 Q1–Q4, 2026 Q1–Q4), each with an **Open** button. Past-due periods show "Overdue".
- **New Return: working.** Opens with Sector = Credit Unions and a reporting-year picker.
- **Problem: the four summary cards show 0 / None** (Active obligations 0, Next due None, Overdue 0). The server refuses the summary for organisation users (403) because it only checks staff permissions. The real numbers should be 10 obligations, next due 30 Oct 2026, 7 overdue. This affects every organisation user, not only Rodney Bay.
- Not yet tested: clicking **Open** (this creates a draft filing), filling the Balance Sheet / Profit & Loss and saving a draft.

## Fix

1. Change the summary check so an organisation user can read the summary **only for an organisation they are approved for** (same rule the calendar already uses). Staff access stays as it is; nobody gains access to another organisation's data.
2. Add a small database test: Rodney Bay primary user gets the summary for Rodney Bay; the same user is refused for another organisation.
3. As the primary user in the browser: confirm the cards show 10 / 30 Oct 2026 / 7, click **Open** on 2026-Q3, confirm both forms (Balance Sheet, Profit & Loss) appear, save a draft. It will not be submitted. This leaves one draft return for the demo.

## Technical details

- `public.returns_entity_summary(uuid)`: replace `PERFORM returns_require('view')` with: allow if `returns_require` passes **or** `can_read_entity_returns(auth.uid(), _entity_id)`; otherwise raise 42501. Body unchanged.
- Test file under `supabase/tests/rbac/`, rolled back.
