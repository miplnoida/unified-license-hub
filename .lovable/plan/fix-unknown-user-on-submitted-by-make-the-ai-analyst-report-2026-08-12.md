# Fix "Unknown user" on Submitted by + make the AI Analyst report business-readable

## Part 1 — "Unknown user" in the Submitted by / actor fields

### What I verified

On application APP-2026-000135 the data itself is fine: the submitter is `Test Entity` (a pre-licensee account) and every other actor on the case (Anisha Anni, Vidya Rani, Super Admin) resolves to a real name in the database. Rendering the page as Super Admin right now shows the correct names on Details, Activity, Documents, History and the Decision view.

So the label is not caused by missing data. Two concrete weaknesses in how names are resolved can produce it, and both need fixing:

1. **No loading state in the name lookup.** `actorLabel()` in `src/hooks/useUserDisplayNames.ts` returns the literal string `"Unknown user"` whenever the name map is not yet available — i.e. while the lookup query is still in flight, or if it fails. Panels that use it (Sufficiency determinations, workflow/activity actor lines) therefore render "Unknown user" first and correct themselves a moment later. Depending on timing, that is exactly what a user sees.
2. **Applicant names come from a restricted table.** Applicant/pre-licensee identities live in `pre_license_users`, whose read policy only allows Super Admin plus users holding `licensee_management.manage_pre_license` / `view_all_entities`. Only the Licensing Officer role holds those permissions today, so for Analyst, Supervisor, Legal and similar reviewer roles the applicant row simply comes back empty and the submitter permanently renders as "Unknown user" (staff actors still resolve, because those live in `profiles`).

### Fix

- Add one server-side name resolver (security definer) that any authenticated staff user can call with a set of user ids and that returns only display name, email and identity kind — no other personal data. This keeps `pre_license_users` locked down while letting every reviewer role see who submitted a case.
- Route all actor labelling through it: the shared `useUserDisplayNames` hook, the Application Detail actor map, the application and returns workflow panels, and the entity audit/activity timeline.
- Make the labels loading-aware: while resolution is pending show a neutral placeholder (skeleton / "…"), on failure show a retryable "Name unavailable", and reserve "Unknown user" strictly for an actor id that genuinely has no account. `null` actors keep showing "System".
- Verify in the running app on this application as Super Admin *and* as a non-Licensing-Officer reviewer role that "Submitted by" reads "Test Entity" in the progress strip, Activity log, History drawer and Decision view.

## Part 2 — AI Analyst Assessment: business language

The report loads and its content is correct, but it is written for engineers. Changes, presentation layer only — the assessment engine, prompts and stored output are untouched:

- **Findings**: today each finding shows a duplicated severity (`HIGH` badge plus `high` text) and a raw category token (`financial`). Show one severity badge in plain words (Blocking / Needs attention / Minor) and a readable category ("Financial", "Documents", "Governance").
- **Evidence**: today it prints raw data paths such as `submitted_forms[0].response_data.amount_paid: 46; fees_payment.payments[0].amount: 2`. Show these as labelled facts ("Amount paid declared in form: 46", "Payment received: USD 2") and move the raw paths behind a "Technical details" toggle, matching the pattern already used in the Sufficiency panel.
- **Section-wise review**: replace `Pass` / `Risk: low` tokens with "Satisfied" / "Low risk" wording.
- **Recommendation block**: keep "Advisory only" prominence, but drop internal build metadata (`Prompt v2`) from the business view into the technical details, and phrase confidence in words with the number in support ("High confidence (95%)").
- **Decision controls**: keep Accept / Override / Escalate behaviour and permissions exactly as they are, and show who recorded the analyst decision and when using the same resolved-name logic from Part 1 (no "Unknown user").

No database, workflow, permission or AI-generation changes in this part.

## Technical notes

- New RPC `public.resolve_user_display_names(uuid[])` — `security definer`, `search_path = public`, returns `(id uuid, display_name text, email text, kind text)`, union of `profiles` and `pre_license_users`, restricted to authenticated callers with a staff role; grant execute to `authenticated`.
- `src/hooks/useUserDisplayNames.ts`: call the RPC instead of two direct table selects; expose `isLoading` / `isError`; change `actorLabel(userId, names, state)` so the pending and error cases are distinguishable from a truly unknown id.
- Call sites to update: `src/pages/applications/ApplicationDetail.tsx` (`nameMap` / `resolveActor`), `src/components/applications/WorkflowPanel.tsx`, `src/components/returns/ReturnWorkflowPanel.tsx`, `src/hooks/useEntityAuditLog.ts`, `src/components/applications/DecisionReadySummary.tsx`, `src/components/applications/ApproverDecisionView.tsx`.
- AI report presentation: add `src/lib/licensing/aiAssessmentLabels.ts` for severity/category/evidence humanisation plus unit tests, and consume it in `src/components/applications/ApplicationAiAssessmentPanel.tsx`.
