
# Fit & Proper — Bug Fix & Script 2 Coverage Plan

Scope is strictly the F&P module: `src/pages/fit-and-proper/*`, `src/pages/admin/Fp*`, `src/components/fit-and-proper/*`, `supabase/functions/fp-*`, `src/lib/fp*`, and F&P DB tables. Nothing outside is changed.

## 1. Blocking runtime bugs (fix first — everything else depends on these)

1. **Assessment type mismatch (B-01/B-02)** — DB CHECK on `fp_assessments.assessment_type` rejects `'material_change'`, `'adverse_event'`, `'cycle'` sent by the UI and cycle scheduler.
   Migration: extend CHECK to include `initial, renewal, change_of_role, triggered, ongoing_monitoring, material_change, adverse_event, cycle`.
2. **Appeal filing crash (B-03)** — `FpAppealsPanel` inserts `status: 'filed'` which violates the CHECK. Change to `'submitted'`.
3. **Monitoring sweep early-return (B-04)** — missing `}` closes the overdue-conditions loop early. Fix brace so all overdue conditions are processed and the response returns after the loop.
4. **Monitoring event_type constraint (B-05)** — sweep inserts `screening.<check>` which fails CHECK. Map to `'recheck_hit'` / `'recheck_ok'` per hit count.
5. **Population trend chart shows zeros (B-06)** — count `'determined'` / `'closed'` (and join `fp_determinations.outcome` for approve/refuse split) instead of non-existent statuses.
6. **Committee double-vote (B-11)** — add `UNIQUE (assessment_id, member_id)` on `fp_committee_votes`.

## 2. Script 2 coverage gaps (add missing surfaces)

7. **DEMO-FPA-001 — 4 initiation paths.** Add:
   - "Add Role" dialog on Individual → Roles tab (inserts `fp_individual_roles`, supports licensee link, role type, effective_from). Unblocks role-change initiation.
   - "Trigger cycle sweep now" admin button on Individual detail (invokes `fp-cycle-scheduler`) so cycle path is demoable.
   - Ad-hoc supervisory initiation already exists via Start Assessment; expose `assessment_type: 'triggered'` (ad-hoc) explicitly in the picker.
   - New-licence path: on `applications` marked with an FP-relevant category, auto-open an `initial` assessment on approval — implemented as a lightweight hook in the existing application approval flow, keyed off a boolean already-present flag; otherwise leave a "Create FP assessment from this application" button on the application detail page for admins.
8. **DEMO-FPA-002 — duplicate detection + cumulative roles.** Add UNIQUE `(national_id) WHERE national_id IS NOT NULL`; pre-INSERT lookup in `FitAndProperIndividuals` create form with conflict banner ("Existing profile found — open?"); add a Roles column to the individuals list.
9. **DEMO-FPA-003 — access-denial audit.** On individual detail load, when `.maybeSingle()` returns null while user is authenticated, log `security_event_logs` row with `event_type='fp.individual.access_denied'`.
10. **DEMO-FPA-004 — notifications on submit.** After PQ submit and legacy declaration submit in `FitAndProperAssessmentDetail`, invoke `dispatch-notification-event` with `event_type='fp_assessment_submitted'`. Same after `fp-cycle-scheduler` opens a new draft.
11. **DEMO-FPA-006 — evidence upload on manual screening.** Add `evidence_urls jsonb DEFAULT '[]'` to `fp_findings`; per-row uploader in `FpScreeningPanel` using the existing `secureFileUpload` helper into the `fp-evidence` bucket (create bucket if missing).
12. **DEMO-FPA-007 — high-severity escalation.** In `fp-screening-run`, after inserting findings, dispatch a notification when any finding is `severity='high'` and insert a `fp_monitoring_events` row (`event_type='manual_flag'`) for the audit.
13. **DEMO-FPA-010 — sector rules actually enforced.** In `FpDeterminationsPanel`, import `resolveFpSectorRule` + `evaluateFpCriteria`; before Finalize, evaluate against the assessment's sector/sub-sector/role and render a blocking "Disqualifiers" panel listing failed criteria; require override reason (existing `OverrideReasonDialog`) to proceed anyway.
14. **DEMO-FPA-011 — multi-regulator determinations.** Add a Regulator select to the Start Assessment dialog defaulting to the user's `active regulator` from `RegulatorContext`; persist to `fp_assessments.regulator_id`. Supersession logic then works as designed.
15. **DEMO-FPA-013 — condition reminders.** Add `monitoring_owner_user_id uuid` and `reminder_sent_at timestamptz` on `fp_conditions`. Extend `fp-monitoring-sweep` to dispatch reminder notifications for conditions with `due_date` within 7 days and null `reminder_sent_at`, then stamp `reminder_sent_at`.
16. **DEMO-FPA-014 — appeal → license impact.** Add `license_id uuid REFERENCES licenses(id)` to `fp_appeals` and an optional license picker in the file-appeal dialog. On decide-appeal with `overturned_*` outcome, if `license_id` is set, insert a note/action on that license (using existing `license_actions` table) — no license status flip, only an auditable "FP appeal overturned" action to avoid changing other modules' behavior.
17. **DEMO-FPA-015 — monitoring notifications.** After `fp-monitoring-sweep` inserts events, dispatch a digest notification to F&P assessors listing new alerts.

## 3. Non-blocking polish inside module (only if trivial)

- `fp-screening-run/index.ts`: switch CORS import to project's `../_shared/cors.ts` for consistency with sibling functions.
- `fp-ai-media-ingest`: graceful `{ok:false,error:'AI key not configured'}` when `LOVABLE_API_KEY` is missing (currently throws — surfaces as generic error toast).

## 4. Explicit non-goals

- No changes to unrelated modules (applications, returns, compliance, complaints, licensees), except for the single `license_actions` insert triggered by an overturned FP appeal.
- No UX redesign — dialogs and panels reuse existing shadcn components and styling.
- No new tables beyond the additive columns listed above.

## 5. Verification

- Typecheck (`tsgo`) after edits.
- Manual DEMO-FPA-001 walkthrough on preview: 4 assessments appear on DEMO-FPA-001 in the Assessments panel (initial, cycle, material_change, adverse_event), all with audit rows.
- Manual DEMO-FPA-014: file an appeal end-to-end without the CHECK error.
- Manual DEMO-FPA-015: invoke `fp-monitoring-sweep` from admin button; response processes all overdue conditions and creates monitoring events.
- Supabase linter run to confirm new grants/policies are clean.

## 6. Technical details

**Migration (one file):**
```text
ALTER TABLE fp_assessments DROP CONSTRAINT ...; re-add CHECK with new types
ALTER TABLE fp_appeals: keep 'submitted' as canonical (fix client instead)
CREATE UNIQUE INDEX fp_individuals_national_id_uniq
CREATE UNIQUE INDEX fp_committee_votes_unique
ALTER TABLE fp_findings ADD COLUMN evidence_urls jsonb DEFAULT '[]'
ALTER TABLE fp_conditions ADD monitoring_owner_user_id uuid, reminder_sent_at timestamptz
ALTER TABLE fp_appeals ADD COLUMN license_id uuid REFERENCES licenses(id)
```
All new/altered tables retain existing RLS + GRANTs; no policy changes required (columns inherit table policies).

**Edge functions touched:**
- `fp-cycle-scheduler` — assessment_type still `'cycle'` (now valid); dispatch notification.
- `fp-monitoring-sweep` — brace fix, event_type mapping, reminder sweep, notification dispatch.
- `fp-screening-run` — high-severity escalation, CORS import.
- `fp-ai-media-ingest` — graceful key-missing response.

**Frontend files touched:**
- `src/components/fit-and-proper/FpAssessmentsPanel.tsx` (regulator picker; keep type values now that DB allows them)
- `src/components/fit-and-proper/FpAppealsPanel.tsx` (`'filed'` → `'submitted'`; license picker; overturn action)
- `src/components/fit-and-proper/FpScreeningPanel.tsx` (evidence uploader)
- `src/components/fit-and-proper/FpDeterminationsPanel.tsx` (sector rule enforcement)
- `src/components/fit-and-proper/FpConditionsPanel.tsx` (owner user, reminder shown)
- `src/pages/fit-and-proper/FitAndProperIndividuals.tsx` (dup check, roles column)
- `src/pages/fit-and-proper/FitAndProperIndividualDetail.tsx` (Add Role dialog, cycle-now button, access-denial log)
- `src/pages/fit-and-proper/FitAndProperAssessmentDetail.tsx` (dispatch-notification-event on submit)
- `src/pages/fit-and-proper/FpPopulationTrends.tsx` (chart data fix)

No other files change.
