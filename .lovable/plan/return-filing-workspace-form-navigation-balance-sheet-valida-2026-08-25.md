# Return Filing Workspace — Form Navigation + Balance Sheet Validation

Targeted fix to the applicant/licensee filing screen (`/entity/returns/filings/:filingId`). No changes to the returns engine, obligations, versioning, entitlements, PPOC, or the admin Returns Queue.

## What is wrong today

- The filing screen renders every pinned form in a vertical stack, each as its own card with its own section Previous/Next and its own Save Draft / Submit footer. With two required forms (confirmed in the data: "Balance Sheet" sequence 1, "Profit and Loss" sequence 2) the second form is only discoverable by scrolling, and each form looks like it has an independent final submission.
- Server validation currently only checks that required forms are marked complete and that metrics were derived. There is no accounting-equation check, so a filing whose assets do not match liabilities plus capital submits successfully. The legacy rule table (`return_validation_rules`) is empty and belongs to the older return_configs model, so nothing is configured today.

## Confirmed accounting equation

The sector Balance Sheet forms are line-coded statements with three top-level totals:

```text
Section 1  ASSETS            -> line_1_col_1
Section 2  LIABILITIES       -> line_2_col_1
Section 3  CAPITAL ACCOUNTS  -> line_3_col_1
```

Rule to enforce: **Total Assets = Total Liabilities + Total Capital Accounts**, with a 0.01 tolerance. The exact field names are read from configuration (not hardcoded in React), so other sectors/templates can be configured the same way.

## Frontend changes

1. **Form-level navigator** in the filing workspace: a stepper/tab strip listing each pinned form in sequence order — `1. Balance Sheet`, `2. Profit & Loss`, `Review & Submit` — plus per-form status (Not started / In progress / Complete / Issue badge). Only the active form renders.
2. **Section navigation untouched.** The existing renderer keeps its Previous/Next section behaviour inside the active form. The renderer's own Save Draft/Submit footer buttons are suppressed for this screen, replaced by explicit form-level controls: `Save Draft`, `Mark form complete`, and `Save & continue to next form` on the last section.
3. **Progress header**: "1 of 2 forms completed" plus due date and version, reusing the existing filer guidance panel counts.
4. **Live balance check** on Balance Sheet-style forms: as values change, show Total Assets, Total Liabilities + Capital, and the difference in plain language when it does not balance.
5. **Review & Submit step**: table of required forms with completion + validation status, a list of blocking issues with clickable links that jump to the offending form, the declaration checkbox, and the single `Submit Return` action. Submit stays disabled until all required forms are complete and validation returns no blocking issues; it always revalidates server-side first.
6. **Save Draft always allowed**, including when the balance check fails or forms are incomplete. Existing data is preserved when switching forms (draft is saved on form change).
7. **Correction Requested** filings open in the same navigator with issue badges on the affected forms; resubmission goes through the same validated submit path.

## Backend changes

1. New configuration table `public.return_form_validation_rules` — form template, rule code, severity, blocking flag, message template, tolerance, and the arithmetic expression over field names (e.g. `line_1_col_1 = line_2_col_1 + line_3_col_1`). Created with GRANTs (read for authenticated, full for service_role), RLS on, staff-only writes.
2. Seed the balance rule for every existing sector Balance Sheet template.
3. Extend `public.returns_validate_filing` to also evaluate these rules against each requirement's saved `form_responses.response_data`: numeric-safe parsing (commas/blanks/decimals), tolerance comparison, and one `return_filing_validation_results` row per failing rule with the computed values in the message. `returns_submit_filing` already refuses to submit when blocking errors exist, so a direct RPC/API submit with an unbalanced sheet fails without touching authorization, RLS, or entitlement checks.
4. A read helper so the client can fetch the configured rule for a form version and run the identical check live.

## Test scenarios

Two required forms navigable without scrolling; multi-section Balance Sheet Previous/Next stays within the form; Save & continue opens Profit & Loss; unbalanced sheet shows the difference, allows Save Draft, blocks Submit; balanced sheet submits; direct RPC submit with an unbalanced sheet is rejected; one form incomplete keeps Submit disabled and names the form; Correction Requested navigates to the flagged form and resubmits after fix.

## Out of scope / unchanged

New Return wizard, obligation generation, sector mapping, form builder and versioning, pinned form requirements, calculated fields, metric extraction, audit logs, notifications, admin Returns Queue, payments, complaints, RBAC/RLS.
