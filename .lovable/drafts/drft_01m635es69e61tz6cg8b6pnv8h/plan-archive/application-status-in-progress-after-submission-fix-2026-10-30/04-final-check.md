## Final security and regression check (read-only results)

### Consistency of the four guards
All four use the same test: **status `in_progress` + submission time set = Under Review**.
- Frontend: hides edit, continue and taxonomy controls.
- `application_draft_save`: refuses applicant saves.
- `can_mutate_application`: refuses direct applicant row updates.
- `verify-and-submit`: refuses a second submission.

Staff edit permission, super admin, and the external submit/RFI-response branches keep their current behaviour.

### Exposure found in form answers and uploads (reported only, not changed)
- **Form answers (`form_responses`, 9 application rows):** the applicant can insert, update or delete their own answer rows at any time, through the API, after submission. The detail page reads the protected application record, so what regulators see there does not change. The **automatic completeness check reads these rows**, so a post-submission edit could change a later sufficiency result. Affected operations: insert / update / delete by the owner.
- **File uploads (`file_uploads`, 46 application rows):** the uploader can insert new rows and update or delete their own rows (file name, path, metadata) after submission. A replaced or deleted record can change which documents appear for an application. I have not checked whether the stored file itself can be overwritten.
- Both issues are pre-existing and apply to every submitted status, not only `in_progress`. They stay unchanged until you approve them separately.

### Preserved flows
- **Returned-for-correction, RFI, resubmission:** these use their own statuses and the RFI-response permission. The new rule only touches `in_progress` with a submission time.
- **Payment:** `canPay` is unchanged.
- **Regulator workflow:** the step-transition function and final approval are untouched.
- **Intermediate approvals:** these set only `in_progress` plus the next step. With the new rule they display as "Under Review". Final approval stays the separate command (APP-2026-000163 has no approval time).
- Pre-existing, not changed: the draft-save allow-list does not include `returned_for_correction` or `resubmission_requested`. I am not changing that.

### Exact database change (staged only; runs only after acceptance and your approval)
- `application_draft_save`: after the existing editable-status check, add:

```sql
IF v_app.status = 'in_progress' AND v_app.submitted_at IS NOT NULL
   AND NOT public.is_super_admin(v_uid)
   AND NOT public.has_permission(v_uid,'application_management','edit') THEN
  RAISE EXCEPTION 'APPLICATION_UNDER_REVIEW: This application is under regulator review and cannot be edited.'
    USING ERRCODE = '42501';
END IF;
```

- `can_mutate_application`: change the owner branch to

```sql
(a.applicant_id = _user
  AND a.status = ANY (ARRAY['draft','in_progress','resubmission_requested','resubmission_required',
                            'query_raised','returned_for_correction','info_requested'])
  AND NOT (a.status = 'in_progress' AND a.submitted_at IS NOT NULL))
```

Everything else in both functions stays byte-identical. Rollback: re-run the current definitions, which are saved verbatim in the staged file's rollback section.

### Exact edge function diff (`verify-and-submit`, not deployed until you approve)

```ts
+ if (app.status === "in_progress" && app.submitted_at) {
+   return json({ error: "This application is already submitted and under review.", code: "ALREADY_SUBMITTED" }, 200);
+ }
```

The select list adds `submitted_at`. Rollback: redeploy the previous version.

### Order of work after you approve the plan
1. Frontend changes, the new unit tests, the staged migration file and the local edge function edit. Nothing executed or deployed.
2. Run: the new tests, the existing application list/detail tests, a type check and the edge function's Deno tests.
3. Report changed files, results and the diffs. Then ask separately before applying the database change or deploying.
