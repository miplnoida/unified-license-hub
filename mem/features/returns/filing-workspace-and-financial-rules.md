---
name: Return filing workspace navigation & financial rules
description: Multi-form navigator + Review & Submit step on the filer workspace, and the configurable balance-sheet equation enforced client- and server-side
type: feature
---
Filer workspace (`/entity/returns/filings/:filingId`) shows one pinned form at a time behind a form-level navigator (`1. Balance Sheet`, `2. Profit & Loss`, `Review & submit`). Section Previous/Next stays inside FormRenderer (`hideActions` used; form-level Save draft / Mark form complete / Save & continue live in `EntityFilingForm`). One filing-level Submit exists, on the Review & submit step only.

Financial checks are configuration, never hardcoded: `public.return_form_validation_rules` (form_template_id, rule_code, lhs_field, rhs_fields[], tolerance, severity, is_blocking, message_template with {lhs}/{rhs}/{diff}). Balance sheet rule: `line_1_col_1 = line_2_col_1 + line_3_col_1` (Total Assets = Total Liabilities + Total Capital Accounts), tolerance 0.01, seeded for all Balance Sheet templates.

`public.returns_validate_filing` evaluates these rules against `form_responses.response_data` using `public.returns_parse_numeric`, writing blocking rows to `return_filing_validation_results`; `returns_submit_filing` therefore rejects unbalanced filings even via direct RPC. Save draft is always allowed regardless of rule failures. Client mirror: `src/lib/returns/formValidationRules.ts` + `useReturnFormValidationRules`.
