# Phase 3 — Final Gap Closure (verification-led, no rebuild)

Phases 1 and 2 stay frozen. Phase 4 does not start. No existing Phase 3 feature is rebuilt — this phase only proves behaviour server-side and closes the gaps the proof exposes.

## Gap matrix — checked against current HEAD this turn

| FRD | State | Evidence checked |
|---|---|---|
| FP-REG-001 Individual identity | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_individuals` (19 rows), list + profile screens present |
| FP-REG-002 Roles / history | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_individual_roles` with effective dating |
| FP-REG-003 Duplicate candidates | PARTIAL | `fp_find_duplicate_candidates(name, dob, national_id, limit)` exists and is wired; no automated test, no governed-merge path asserted |
| FP-REG-004 PQ lifecycle | PARTIAL | `fp_request_pq_amendment`, `fp_pq_state_on_declaration`, `fp_pq_state_guard`, `fp_pin_pq_form_on_insert` all exist, but of 33 assessments 0 are `submitted` and 0 `amendment_required` — the submit/amend/historic-render chain has never been exercised |
| FP-SCR-001 Provider states | PARTIAL | `fp_normalise_provider_state`, `fp_provider_state_conclusive`, `fp_run_is_conclusive`, stamping trigger all exist; 29 runs stored; no test proves NOT_CONFIGURED / SANDBOX / failures can never read as clean |
| FP-ASS-001 Assessment lifecycle | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_check_assessment_transition` trigger |
| FP-ASS-002 Prior comparison | PARTIAL | `fp_assessment_comparison()` + panel exist; the six classification cases are untested against real historic findings |
| FP-COM-001 Committee & voting | PARTIAL | `fp_vote_integrity` blocks UPDATE/DELETE and cross-member casting; but `fp_record_committee_decision` computes quorum from *vote count* rather than entitled-member participation, and counts `abstain` weight inside the approval denominator — both need to be pinned by tests and corrected if they contradict the FRD |
| FP-COM-002 Decision snapshot / Twin Peaks | PARTIAL | `fp_committee_decision_snapshots` is append-only (0 rows so far); Twin Peaks positions are **derived** by `fp_regulator_positions()` from current `fp_determinations` per regulator with `SINGLE_REGULATOR` / `ALIGNED` / `DISAGREEMENT` / `COORDINATION_PENDING` states — no merged verdict field exists, but the disagreement path is untested |
| FP-CON-001 Conditions lifecycle | PARTIAL | `fp_condition_lifecycle`, `fp_condition_log_event`, `fp_condition_events_append_only` exist; 3 `fp-evidence` storage policies now route through `fp_can_read_evidence_object`; 0 evidence rows, so no lifecycle or storage-denial proof |
| Phase 3 automated suite | MISSING | `supabase/tests/phase3/` does not exist |

## Work to do

### 1. PQ chain proof and version integrity (FP-REG-004)
Drive the full chain in tests: submit v1 → pinned `form_version_id` recorded → supervisor amendment with reason → prior response bytes and pinned version unchanged → `amendment_required` → revised submission stored as a new submission/version → v1 still readable and rendered from its original definition → later template edit mutates neither. Server-side rejections asserted: blank/short reason, actor without `fit_and_proper.edit`, declarant requesting their own amendment.

### 2. Screening state honesty (FP-SCR-001)
Assert all eight states through `fp_normalise_provider_state` and the stamping trigger, and that `SUCCESS_NO_MATCH` is unreachable from unconfigured, sandbox, provider-failure, transport-failure or rate-limited inputs. Assert `fp_run_is_conclusive` is false for every non-live state, and add a Vitest check that the client `normalizeProviderState` / `isConclusive` contract matches the SQL vocabulary token-for-token.

### 3. Registry and duplicate detection (FP-REG-001/2/3)
Tests for one identity with multiple current and historical roles, national-ID exact and DOB+name-similarity candidate scoring, no automatic merge without a governed review record, and direct-ID denial for an unrelated authenticated user.

### 4. Assessment comparison (FP-ASS-002)
Seed prior/current finding pairs covering no-prior, new, unchanged, changed, worsened and resolved, assert each class from the RPC, and assert prior findings rows are byte-identical afterwards.

### 5. AI / advisory review
Assert the stored AI output retains source evidence and citations, that a non-conclusive provider run cannot produce a clean advisory conclusion, and that a reviewer override goes through the Phase 1 override registry with mandatory justification, actor and timestamp while the original recommendation stays readable.

### 6. Committee voting (FP-COM-001)
Tests for member snapshot with regulator affiliation, entitlement and weight; quorum met → outcome computed; quorum not met → determination blocked as `insufficient_quorum`; weighted tally; abstention handling; vote immutability; Member A cannot cast or edit Member B's vote; and a later committee-config change leaves an existing snapshot unchanged. Where the quorum/abstain arithmetic contradicts the FRD, `fp_record_committee_decision` is corrected in a small additive migration — it is the only committee object touched.

### 7. Twin Peaks (FP-COM-002)
Tests for aligned (both suitable), disagreement (suitable vs unsuitable/conditional) and coordination-pending, asserting each returned position keeps its own regulator, actor, date, rationale and condition count, and that no single collapsed verdict is produced. Cross-regulator visibility asserted via `fp_regulator_visible`.

### 8. Conditions lifecycle and storage denial (FP-CON-001)
Tests across create → source determination → due date → evidence requirement → upload → review accept/reject → satisfied → overdue → breached → waiver with authorisation and justification → escalation/notification row → reassessment hook, with `fp_condition_events` proven append-only. Storage: a persona denied the individual/assessment is denied the object by path, proving `fp_can_read_evidence_object` and not UI hiding.

### 9. RLS persona matrix
Behavioural matrix (real `SET LOCAL role` + JWT claims) over 7 personas — applicant, regulated-entity user, F&P assessor, committee member, supervisor, admin, unrelated authenticated — across individual SELECT, PQ read/write, screening SELECT, assessment read/write, committee vote, Twin Peaks positions, condition evidence, storage object, RPC execution and direct-ID access.

### 10. Suite layout `supabase/tests/phase3/`
`01_registry.sql`, `02_pq.sql`, `03_screening.sql`, `04_assessment.sql`, `05_committee.sql`, `06_twin_peaks.sql`, `07_conditions.sql`, `08_rls_matrix.sql`, plus Vitest additions for the client derivation helpers. CI gate extended to require the Phase 3 suite. No existing test is weakened.

### 11. Manual verification handoff
A handoff document with click-by-click scenarios — route, persona, setup data, action, expected UI, expected persisted row — for individual registry, PQ initial submission, PQ amendment, screening hit, screening unavailable/failure, assessment comparison, committee voting, Twin Peaks disagreement, condition evidence, condition breach/closure.

## Technical notes
- Fixes are additive migrations confined to F&P-owned objects; the likely edits are `fp_record_committee_decision` (quorum/abstain arithmetic) and any gap the tests expose in the PQ or condition paths. No Phase 1/2 object, route rename or styling change.
- TypeScript build and the frontend test run happen after the changes.

## Closure
The final report will state `PHASE 3 IMPLEMENTED — MANUAL VERIFICATION REQUIRED` only if every row above reaches code + persistence + RLS + automated coverage with no known functional gap; otherwise it will state `PHASE 3 NOT YET COMPLETE` and name the exact missing requirement.
