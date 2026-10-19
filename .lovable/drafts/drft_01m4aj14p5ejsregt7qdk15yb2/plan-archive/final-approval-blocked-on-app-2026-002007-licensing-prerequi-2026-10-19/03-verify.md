## If you approve option A
1. Add one required-form entry for APP-2026-002007, marked as submitted and linked to the applicant's existing submitted form. No other change.
2. Read the readiness result again and confirm the forms check now passes.
3. You click Approve on the application.

No code, settings or other applications are touched. Nothing is published.

## Technical notes
- Blocking gate: `forms_documents = BUSINESS_CONFIGURATION_REQUIRED`, `required_count = 0` (`audit_logs`, action `application_final_approval_blocked`).
- `application_form_requirements`: 0 rows for this application. `form_responses`: one row, template `a1000000-0000-4000-8000-000000000001`, status `submitted`.
- Option A: insert one `application_form_requirements` row (template above, its pinned form version, `is_required = true`, `status = 'SUBMITTED'`, `response_id` = that response). This is data-only and needs your explicit approval because it writes to the live backend.
