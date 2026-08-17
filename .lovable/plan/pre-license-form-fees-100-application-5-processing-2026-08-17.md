# Pre-License Form Fees: $100 Application + $5 Processing

Add a fixed $100 application fee and $5 processing charge to the recently created pre-license application forms, tied to each specific form.

## Forms covered

| Form | Current fees |
| --- | --- |
| Life Insurance License Application | none |
| Securities Dealer License Application | none |
| Micro-Credit Institution License Application | none |
| Financial Holding Company License Application | none |
| Money Service Business License Application | none |
| Payment Service Provider Registration | none |
| Pension Fund Administrator Registration | none |

Merchant Bank already has $100 / $5 configured, so it is left as-is. Building Society ($150) and Commercial Bank ($2 processing) are older forms and stay unchanged.

## What gets created

For each form above, two active fee configurations:

- `Application Fee` — $100 USD, fixed
- `Processing Fee` — $5 USD, fixed

Each row is scoped with `form_id` set to that form template, plus its sector / sub-sector / category so the existing fee resolution ranking picks the form-specific row first (form match has the highest specificity weight). `service_id` stays null since these are new-licence applications, not renewal services.

## Technical notes

- Data-only change: inserts into `fee_configurations` using the insert tool. No schema change, no frontend change.
- `fee_type` values use the existing display convention already present in the table (`Application Fee`, `Processing Fee`) so the fee breakdown labels render consistently and renewal filtering (which looks for "renew" in fee_type) is unaffected.
- `regulator_id` is set to the same regulator used by the existing Merchant Bank pre-license fees, keeping the rows visible under the active regulator context in Admin Hub → Fee Management.
- Inserts are guarded so re-running does not create duplicates for a form/fee_type pair.

## Verification

- Query `fee_configurations` to confirm 14 new rows (2 per form) with correct amounts and `form_id`.
- Open one of the forms as an applicant draft and confirm the fee breakdown shows Application Fee $100 and Processing Fee $5, total $105, before final submission.
