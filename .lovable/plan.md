## Goal
Clean up renewal applications for licensee `817c85c1-114b-41e0-8da2-314c55f87c42` against license **LIC-2026-000014** (`7a5b3197-49cc-49ea-a1fd-ca94434cb005`) so they can start a fresh renewal.

## Records found
Six renewal applications currently exist for this licensee + license:

| App ID | Status |
|---|---|
| `a6c9b5f8-e26a-47ab-981b-b69b845e06da` | submitted |
| `d58310ad-69f8-4ba0-97ca-f6d57dd1d137` | draft |
| `f658db8f-d6b1-4e72-a3bb-3e65f64cb9d3` | draft |
| `75752d82-3002-412d-80a3-8faf9df1f461` | draft |
| `70f623f3-0b83-469c-8677-9c95fb0eac09` | draft |
| `7d257778-aae0-47e4-a767-f9e1e7b6ec2b` | draft |

## Plan
Hard-delete all six renewal application rows above (drafts + the one submitted). Scope is strictly:
- `applicant_id = 817c85c1-114b-41e0-8da2-314c55f87c42`
- `data->>renewal_of_license_id = 7a5b3197-49cc-49ea-a1fd-ca94434cb005`

Also delete dependent child rows that reference these application IDs so the delete doesn't fail or leave orphans:
- `application_form_versions`
- `application_ai_assessments`
- `payments`, `payment_receipts`, `payment_attachments`, `payment_remarks`
- `workflow_instances`
- `audit_logs` rows pointing at these application IDs are kept (audit trail must remain).

No schema changes. No code changes. License row, original approved application, and all non-renewal records for this licensee are untouched.

## Verification after run
Re-query and confirm zero renewal applications remain for this licensee + license. Licensee can then click "Renew" on LIC-2026-000014 and get a clean draft.

## Confirm before I proceed
Should I delete **all six** (including the submitted one), or only the **5 drafts** and keep the submitted renewal intact?