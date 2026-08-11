# Closure & QA: clear errors, locked-after-QA buttons, plain-language decisions

Frontend/presentation only. The closure RPC, its validation rules, workflow steps and RBAC stay untouched.

## Why "Could not record decision" appears

The closure/QA recorder rejects a submission when the required fields are missing — for the screenshot's state, closure needs a Resolution, a Rationale of at least 10 characters, an Outcome, and the "Evidence is complete" confirmation ticked. The backend returns a precise reason for each case, but the panel only shows `e.message` when the thrown value is a JS `Error`; the backend error arrives as a plain object, so every failure collapses into the generic "Could not record decision" toast. The user never sees which field was the problem.

## What will change (Closure & QA panel)

1. **Say what's actually wrong**
   - Read the message off the backend error object (not just `Error` instances) and translate the known reasons into plain sentences, e.g. "Add a resolution before proposing closure", "The rationale must be at least 10 characters", "Choose an outcome", "Confirm that evidence is complete", "Give a return reason of at least 10 characters (minimum 10)".
   - Show the same reasons inline next to the fields, not only in a toast.

2. **Prevent the error instead of reporting it**
   - Disable "Propose closure (recommendation)" and "Record closure assessment" until Resolution, Rationale (10+ chars), Outcome and "Evidence is complete" are all present, with a short "What's still needed" list under the buttons.
   - Disable "Return to officer" until the QA note has 10+ characters.

3. **Lock QA once the review is done**
   - When the latest decision is `qa_approved` (or the assessment is already recorded as closed), disable both "QA approve" and "Return to officer" and replace the note box with a completed banner: "QA review completed on <date> — no further QA action is needed. The complaint is closed from the Current step tab."
   - Buttons also disable while a decision is in flight, so a decision can't be double-submitted.

4. **Plain-language decisions**
   - Add a small label map (Proposed for closure / Closure assessment recorded / QA approved / Returned to officer) plus a friendly one-line meaning, and use it for the "Latest decision" line and in Closure history — no raw codes like `qa_approved`.
   - Latest decision line becomes: "QA approved — the closure assessment passed quality review · 11 Aug 2026, 6:54 PM", with the recorder's name where available.

## Technical notes

- Files: `src/components/complaints/ClosureQaPanel.tsx` (validation, disabled states, banners), plus a `closureDecisionLabel()` helper added next to the existing closure helpers in `src/lib/complaintWorkflow.ts` so History/Overview can reuse it.
- Timestamps use the existing `formatDateTime` utility.
- No migration; `complaint_record_closure_review` and `complaint_closure_reviews` stay append-only and unchanged.

## Verification

Drive the complaint detail page in the preview: attempt closure with fields missing (expect precise inline reasons and a disabled button rather than a generic toast), record a valid closure, then confirm the QA buttons are disabled with the completed banner and the latest decision reads in plain language.
