# Phase 3 — Strict Gap Closure (Fit & Proper + Twin Peaks)

Phases 1 and 2 stay frozen. Phase 4 does not start until this phase's matrix has no MISSING row. This plan covers Phase 3 only; Phase 4 and Phase 5 will each be planned separately after their predecessor is reported.

## Gap matrix — current HEAD (each row checked this turn)

| FRD | State | Evidence / gap |
|---|---|---|
| FP-REG-001 Individual registry | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_individuals`, list/create/profile screens exist |
| FP-REG-002 Roles & entity relationships | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_individual_roles` with effective dates |
| FP-REG-003 Duplicate detection | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_find_duplicate_candidates` exists and is wired into the create dialog |
| FP-REG-004 PQ lifecycle | PARTIAL | `pq_state` column exists but every one of the 33 existing assessments is still `draft`; the amendment/resubmission path and historic-version re-render are unexercised |
| FP-SCR-001 Screening provider states | PARTIAL | The 8-state vocabulary exists **only in the client library**. The screening backend still writes legacy outcomes — stored runs contain `outcome: "screened_clean"` with `environment: "sandbox"`, i.e. a sandbox mock is persisted as a clean result. This is the most serious gap. |
| FP-ASS-001 Assessment lifecycle | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_assessments` + transition trigger |
| FP-ASS-002 Prior-assessment comparison | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_assessment_comparison` RPC (server-side, reads stored findings) |
| FP-COM-001 Committee & voting | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | vote integrity trigger + `fp_record_committee_decision` |
| FP-COM-002 Decision snapshot | IMPLEMENTED — MANUAL VERIFICATION REQUIRED | `fp_committee_decision_snapshots`, read-only policy, no UPDATE/DELETE grant |
| FP-CON-001 Conditions lifecycle | PARTIAL | `fp_condition_evidence` / `fp_condition_events` exist, but the `fp-evidence` storage read policy grants **any** holder of `fit_and_proper.view` — it is not scoped to the individual/assessment, so a signed URL is reachable by an unrelated internal user |
| Phase 3 test suite | MISSING | `supabase/tests/phase3/` does not exist |

## Work to do

### 1. Screening provider states — backend first (FP-SCR-001)
- Add `fp_normalise_provider_state(outcome, environment, execution_mode, error_category)` and persist a canonical `state` on every entry in `fp_screening_runs.provider_outcomes`, plus a run-level `conclusive` flag. Vocabulary: `SUCCESS_HIT`, `SUCCESS_NO_MATCH`, `NOT_CONFIGURED`, `SANDBOX`, `PROVIDER_FAILURE`, `TRANSPORT_FAILURE`, `RATE_LIMITED`, `MANUAL`.
- Rename the client token `SUCCESS_MATCH` → `SUCCESS_HIT` so client and database share one vocabulary.
- Backfill existing rows: sandbox/mock executions become `SANDBOX`, never `SUCCESS_NO_MATCH`.
- `fp-screening-run` emits the canonical state directly; failure and unconfigured paths never collapse to a clean outcome.
- Screening panel, provider banner and assessment header render non-conclusive states as an explicit "check not completed" warning, and suppress any "no adverse findings" wording unless the run is conclusive.

### 2. Condition evidence access control (FP-CON-001)
- Replace the `fp-evidence` storage SELECT policy with one scoped through the owning individual/assessment (reusing `can_read_fp_individual` / `can_read_fp_assessment`), so a direct signed-URL or object path attempt from an unrelated internal user is denied.
- Add the matching INSERT/UPDATE storage policies on the same scope.
- Complete the condition lifecycle surface: waiver requires authorisation + justification through the Phase 1 override path, breach and overdue transitions raise the existing escalation/notification primitives, and satisfaction/breach triggers the reassessment hook. Every transition writes an `fp_condition_events` row (append-only).

### 3. PQ lifecycle completion (FP-REG-004)
- Wire state transitions on the declaration screen: save → `draft`/`incomplete`, completeness → `ready_to_submit`, submit → `submitted` with timestamp, supervisor amendment request → `amendment_required` with reason, keeping the prior response and its pinned form version untouched.
- Resume restores the saved draft; submit is blocked unless `ready_to_submit`.
- Historic rendering reads the pinned `form_version_id` so a submission stays reproducible after the template is edited.

### 4. AI review state (FP-ASS-002 / AI)
- The advisory panel shows the canonical provider state chip; when no provider is configured it shows `NOT_CONFIGURED` rather than a low-risk verdict. Accept/reject/override routes through the Phase 1 override registry with mandatory justification and the original output retained.

### 5. Twin Peaks disagreement (FP-COM-002 / coordination)
- Verify `fp_regulator_positions` keeps positions independent, and add the disagreement case to the test suite. No merged conclusion field is introduced.

### 6. RLS persona matrix
New pgTAP matrix over 7 personas (applicant, entity user, F&P assessor, committee member, supervisor, admin, unrelated internal) × individual profile, PQ, screening, assessment, AI output, committee votes, regulator positions, conditions/evidence — asserting SELECT/INSERT/UPDATE/DELETE, RPC execution and direct-ID denial behaviourally (real `SET LOCAL role` + JWT claims), not by counting policies.

### 7. Test suite `supabase/tests/phase3/`
- `01_registry.sql` — create, multiple roles, duplicate candidate scoring, cross-user denial
- `02_pq.sql` — draft, submit, amendment, historic version reproduction after template edit
- `03_screening.sql` — hit, no-hit, not-configured, sandbox, provider failure, transport failure, rate-limited, manual; assert a non-conclusive run can never read as clean
- `04_assessment.sql` — comparison with prior / no prior / changed severity / resolved / worsened
- `05_committee.sql` — quorum pass, quorum fail, weighted tally, vote immutability, cross-member vote denial, snapshot immutability
- `06_twin_peaks.sql` — independent positions, alignment, disagreement
- `07_conditions.sql` — evidence submit, review accept/reject, overdue, breach, waiver authorisation, completion, append-only history
- `08_rls_matrix.sql` — the persona matrix above
- Vitest additions for the client derivation helpers (provider state, PQ state, comparison classes)
- CI gate extended to require the Phase 3 suite

## Technical notes
- Migrations are additive: new functions, new/adjusted policies, backfill UPDATEs on `provider_outcomes`. The only existing objects touched are F&P-owned ones (`fp_condition_lifecycle`, the vote trigger, the `fp-evidence` storage policies) plus the screening function.
- No Phase 1/2 object is modified. No route renames, no redesign, no stylistic edits to unrelated files.

## Reporting at the end of Phase 3
FRD × Code × DB × RLS × Automated tests × Browser/Manual × State table, exact files changed, migrations, functions/RPCs, policies, test counts and results, known limitations, and the manual click-through steps for individual → PQ → screening → assessment → advisory → committee → regulator positions → condition → monitoring. Final status will be `IMPLEMENTED — MANUAL VERIFICATION REQUIRED` unless the whole chain is proven in-browser with persisted data.
