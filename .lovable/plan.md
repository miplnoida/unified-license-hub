# Why rodneybay sees the old form, and the fix

## Confirmed cause
- Draft APP-2026-002011 was started at 05:59 UTC today. At that moment the newest live form was **version 2**, so the draft was locked to version 2 ("latest_at_start").
- **Version 4** was published later, at 06:20 UTC.
- The system only moves a draft to a newer version when its locked version stops being usable. Version 2 is still published and valid until 31 Oct 2026, so the draft stays on version 2.
- The draft has no saved answers for this form yet, so nothing would be lost by moving it.

This is by design: drafts keep the version they started on, so applicants don't lose answers mid-way. It just doesn't suit drafts that have no answers yet.

## Proposed fix
When an applicant opens an editable draft (draft, resubmission requested, query raised) and has **no saved answers** for that form, move the draft to the newest published, in-effect version. The old lock is marked "superseded", the new lock is recorded with reason `repinned_no_data`, and the history stays.

Drafts that already have saved answers keep their version, as they do today. Submitted applications are never changed.

Result: rodneybay sees version 4 the next time they open the draft. No manual data changes needed.

Alternative (not proposed): archive version 2. That would move every draft on version 2, including drafts with saved answers.

## Technical details
- One migration that recreates `public.resolve_application_form_version`. Signature, `SECURITY DEFINER`, return shape and access checks stay the same.
- New branch: if `v_is_editable` and the pinned version is usable but a newer published, effective version exists, and there is no non-empty `form_responses.response_data` for (application, template) and no non-empty `applications.data.forms_data[template]`, repin using the existing supersede/insert/`form_version_ids` update path.
- SQL test in `supabase/tests/` covers three cases: a draft with no data repins to the newest version; a draft with data stays on its version; a submitted application stays on its version.
- I'll share the exact SQL before applying it, as you asked for database changes.
