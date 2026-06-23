# AI Assessment Verification Report

This is a **read-only verification** of the existing fix. No code changes are proposed — if you approve this plan I will simply re-confirm in build mode without editing files.

## 1. Latest commit
- SHA: `f471c2487089dc03040c1c2708125ede2d4d3c68`
- Title: *Improved reliability & docs*

## 2. Files changed in that commit
- `supabase/functions/verify-and-submit/index.ts`
- `supabase/functions/generate-application-ai-assessment/index.ts`
- `supabase/functions/generate-application-ai-assessment/README.md`

## 3. Build / typecheck
The Lovable harness runs build + typecheck automatically on every change. The last successful build corresponds to commit `f471c248`. I did not re-run manual builds (per project rules, manual `tsc`/`bun run build` is not used).

## 4. Pending AI assessment row after submission
Confirmed in `verify-and-submit/index.ts` (lines ~310-325): after the `submit_application` RPC succeeds, the function synchronously inserts a row:
```ts
await adminClient.from("application_ai_assessments").insert({
  application_id, status: "pending",
  prompt_version: "v1",
  model_provider: "lovable-ai-gateway",
  model_name: "google/gemini-2.5-flash",
});
```
then dispatches `generate-application-ai-assessment` via `EdgeRuntime.waitUntil(...)` so the background promise survives past the HTTP response.

## 5. Non-blocking on AI failure / missing `LOVABLE_API_KEY`
- The pending-row insert is wrapped in `try/catch` (logs, never throws).
- The `functions.invoke(...)` chain has `.then`+`.catch` swallowing all errors.
- `EdgeRuntime.waitUntil` is itself wrapped in try/catch.
- In `generate-application-ai-assessment`, missing `LOVABLE_API_KEY` updates the row to `status='failed'` with `error_message='LOVABLE_API_KEY is not configured'` and returns 500 — but the caller already returned 200 to the applicant.
→ Submission cannot be blocked by AI failure.

## 6. Document loading
`generate-application-ai-assessment/index.ts` reads **both** sources, matching `DocumentList.tsx`:
- `documents` via `.or('application_id.eq.<id>,and(entity_type.eq.application,entity_id.eq.<id>)')`
- `file_uploads` via `.eq('entity_type','application').eq('entity_id', application_id)`
Each merged item is tagged with `source: 'documents' | 'file_uploads'` in the prompt payload.

## 7. Panel visibility (UI gate)
`src/pages/applications/ApplicationDetail.tsx` line 819:
```tsx
{isInternal && app.status !== 'draft' && (
  <ApplicationAiAssessmentPanel applicationId={app.id} />
)}
```
`isInternal` resolves through `useEffectivePortalContext` + `INTERNAL_ROLES` / dynamic module access. Drafts and external users never render the panel.

## 8. Applicant access to data
RLS verified on `application_ai_assessments`:
```
policy: "Internal staff can view AI assessments"
cmd:    SELECT
qual:   has_role(super_admin) OR admin OR supervisor OR analyst OR licensing_officer
```
No INSERT/UPDATE/DELETE policy → writes blocked for everyone except service-role (used by the edge function). Applicants get zero rows.

## 9. Workflow / status mutation
Searched the AI function — it only writes to `application_ai_assessments` (`insert` then `update` of the same row). No writes to `applications`, `workflow_instances`, `approval_actions`, or any workflow table. The panel UI is display-only; analyst actions stay in `WorkflowPanel`.

## 10. Where to check in the UI
1. Sign in as an **internal user** (super_admin / admin / supervisor / analyst / licensing_officer).
2. Open **Applications → Queue**, pick any non-draft application.
3. Scroll the **Overview** tab (the panel renders directly below the main details and above the workflow panel — `ApplicationDetail.tsx:819-820`).
4. You should see the *AI Analyst Assessment* card with an "Advisory only" badge. Immediately after a fresh submission it shows "AI assessment is being generated…" and auto-polls every 5 s; on completion it shows summary, routing recommendation, findings (grouped by severity), risks, and missing-information.
5. Sign out and re-sign-in as an **applicant/licensee** — open the same application; the panel must not appear and direct DB reads must return zero rows.

## Result
All 9 verification checks pass against the current code. No fixes required.
