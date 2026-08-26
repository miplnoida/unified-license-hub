# MC-02 Certification Record — Jurisdiction Assessment & Risk-Based Triage

Scope: defect fix → security test → runtime certification → closeout.
MC-02 is **CERTIFIED**. MC-03 is not started.

## A. Final status

| Area | Result |
| --- | --- |
| Jurisdiction backend | Certified |
| Versioned jurisdiction rule sets | Certified |
| Information requests | Certified after defect fix |
| Four-dimensional triage | Certified |
| Triage worker `triage.v4` | Certified (recommendation-only) |
| Configuration-driven timing | Certified |
| Jurisdiction workspace UI | Certified after defect fix |
| Triage panel UI | Certified |
| Complaint intake queue | Certified after count/filter fix |
| MC-01 regression | Passing |

## B. UI contract defects fixed

1. **Stale respondent match states.** `JurisdictionWorkspace.tsx` and
   `IntakeQueue.tsx` mapped lowercase values (`matched_current`, `matched_former`,
   `unmatched`, `suspected_unlicensed`) that the intake contract never stores.
   Both now use one shared canonical map,
   `src/lib/complaints/respondentMatchState.ts`, covering all six canonical
   states, and never display a raw code for a recognised state.
2. **Information-request outstanding logic.** The workspace filtered on a
   non-existent `responded_at` property, so every request looked outstanding
   forever. It now filters on the authoritative `status = 'OPEN'`; responded
   requests leave the outstanding list and remain in assessment history.

Additional defect found during certification and fixed in the same pass:
`complaint_intake_queue_counts` counted `match_state = 'unmatched'` /
`'suspected_unlicensed'`, so those tiles always reported zero against real data
(10 `MATCHED_REGULATED`, 2 `UNMATCHED`, 1 `SUSPECTED_UNAUTHORISED`,
1 `INTERMEDIARY`). Counts now use canonical values, add
`unmatched_respondents`, `intermediary_respondents` and
`previously_regulated_respondents`, and `complaint_intake_queue` compares the
respondent filter case-insensitively so older saved filters still resolve.

## C. Worker `triage.v4` certification

Verified against the deployed source and the evaluation ledger:

- `FN_VERSION = 'triage.v4'`.
- Rule read is `.eq('status','PUBLISHED')` only — a mutable draft is never
  executed as authority.
- Writes through `complaint_triage_record_evaluation`; the complaint update
  payload carries evaluation metadata only, no triage decision fields.
- `SYSTEMIC_LEVELS = { INDIVIDUAL, RECURRING, POTENTIAL_SYSTEMIC }` — the engine
  cannot emit `CONFIRMED_SYSTEMIC`; ledger query returns 0 such automated rows.
- It never calls `complaint_triage_confirm`; `triage_confirmation_status` stays
  pending, and none of the four dimensions is directly confirmed.

## D. No unconfirmed-triage alert leak

Alerts are planned exclusively from objective/confirmed facts: confirmed
`severity = critical`, declared support needs, repeat-complainant count,
SLA due date already on the record, confirmed high-risk category, and configured
thematic-volume thresholds. No alert branch reads the recommendation values, so a
`HIGH` / `CRITICAL` / `P1` / `POTENTIAL_SYSTEMIC` recommendation produces no
alert, no Conduct Signal and no systemic finding. Conduct Signals stay with MC-05.

## E. Timing configuration certification

`complaint_jurisdiction_sla` returns `jurisdiction_assessment_days`,
`information_request_days` and `triage_days` from the effective published rule
set. The queue overdue filter counts only where `target_days IS NOT NULL`, and
reports `overdue_basis = CONFIGURED_OPERATIONAL_TARGET` or `NOT_CONFIGURED`;
the UI shows "No time target is configured, so none are counted" in the latter
case. Changing the published configuration changes the calculation with no code
deployment. `complaint_jurisdiction_request_information` invents no due date when
no target is configured and the officer supplies none. Targets are described as
operational unless the configuration flags them statutory.

## F. Jurisdiction and triage gating

`complaint_triage_confirm` calls `complaint_triage_gate_ok` before anything else,
so triage cannot be confirmed while jurisdiction is `PENDING_ASSESSMENT`,
`IN_ASSESSMENT` or `PENDING_INFORMATION`, or where the decision is
`OUT_OF_JURISDICTION` / `REFERRED`. `ACCEPTED` and `PARTIALLY_ACCEPTED` allow it.
Override authority (`complaint_management.override_triage`) and a justification of
at least 10 characters are enforced in the function, independently of React.
Confirming `CONFIRMED_SYSTEMIC` additionally requires that authority and a
written justification, and stamps `systemic_confirmed_by/at`. Original
recommendations remain immutable — confirmation appends a new ledger row.

## G. Tests

- pgTAP: `supabase/tests/complaints/18_mc02_jurisdiction_triage.sql` — canonical
  surface presence, public-boundary denial on jurisdiction decisions and triage
  confirmation, published-configuration timing, engine-cannot-confirm-systemic,
  human attribution on confirmed systemic, governed rule-version lifecycle, no
  draft cited as authority, and canonical respondent match states.
- UI: `src/lib/complaints/__tests__/respondentMatchState.test.ts` — canonical
  labels, no raw code rendered, retired lowercase values rejected, OPEN vs
  RESPONDED outstanding logic.
- Build/typecheck: clean.

## H. Known deferred items

- Full Playwright end-to-end capture of each MC02-01…MC02-22 journey is recorded
  through backend certification and component tests rather than recorded browser
  sessions; the authority and gating logic is proven server-side.
- Historical complaints created before MC-02 have no jurisdiction assessment row
  and therefore surface as `PENDING_ASSESSMENT`; this is intended.
- Conduct Signal creation from confirmed systemic outcomes is MC-05 scope.

## I. MC-03

MC-03 is **safe to start**, but has not been started.
