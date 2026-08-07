# Phase 2 Final Verification + Gap Closure

Goal: prove the existing Phase 2 prudential implementation (PRU-ANA-001, PRU-ASS-001, PRU-GRP-001) against the acceptance gates. No new Phase 2 functionality unless a verification failure exposes a real defect. No Phase 3.

## 1. Phase 2 DB behavioural suite

New directory `supabase/tests/phase2/`, following the existing pgTAP conventions used in `supabase/tests/phase1/`:

- `01_ratio_engine.sql` — deterministic fixtures with hand-derived expected numbers; asserts CALCULATED result, INSUFFICIENT_DATA on missing input, no fake zero on zero denominator, NOT_CONFIGURED, CALCULATION_ERROR, warning vs breach classification, source/version provenance retained, recalculation does not overwrite historical evidence.
- `02_peer_comparison.sql` — sector and category grouping, no cross-sector leakage, correct `peer_count`, mathematically verified percentile/rank, INSUFFICIENT_PEER_DATA below 5 peers, real state at/above threshold, no self double-count, missing entity ratio excluded from peer values.
- `03_ewi_engine.sql` — trigger creates alert, non-trigger creates none, severity matches rule, source entity/period retained, dedup on repeated evaluation preserved (constraint not weakened), new period can create a new alert, authorised acknowledgement records actor + timestamp, unauthorised acknowledgement denied, trigger evidence survives acknowledgement.
- `04_camels_lifecycle.sql` — assessment creation, six components present, component ratings and narratives persist, draft → submit → return for revision → revise → resubmit → finalise, invalid finalisation rejected server-side with no partial final state, finalised ratings immutable per the implemented guard, history reconstructable, override requires justification and retains original value + actor.
- `05_group_consolidation.sql` — hierarchy member resolution, parent not double counted, subsidiary appears once, consolidated numerator/denominator matches manually derived value (not an average), missing member data recorded in `excluded_members`, `data_state` partial vs complete, excluded members visible in provenance, cross-group access denied.
- `06_rls_persona_matrix.sql` — 7 personas (external/applicant, regulated entity user, prudential supervisor, supervisor/team lead, reviewer/approver, admin, unauthorised internal) against Phase 2 objects: analytics select scope, EWI view/acknowledge and actor spoofing, CAMELS create/edit/review/finalise plus direct-ID access, group risk and member-ID manipulation, admin-only ratio/EWI configuration mutation. Asserted at the database layer with `set local role` / `request.jwt.claims`, not via UI.

Every assertion count recorded for the final report.

## 2. SECURITY DEFINER / RPC review

Read and audit each new Phase 2 function — `prudential_ewi_evaluate`, `prudential_ewi_acknowledge`, group consolidation routines, assessment finalisation, ratio recalculation — for: authentication requirement, explicit authorization check, no trust in caller-supplied actor IDs, pinned safe `search_path`, cross-entity scope check, and restricted grants for service-role-only routines. Findings captured as pgTAP assertions in `06_rls_persona_matrix.sql`. Grants are not broadened to make tests pass.

## 3. Browser runtime verification

Playwright against the running app with real persisted data:

- Prudential entity analytics: entity load, ratio values, result-state rendering, visually distinct warning/breach, peer count, explicit insufficient-peer case, EWI alerts, source period/return drilldown, reload persistence.
- CAMELS assessment: open/create, edit component ratings, save, reload, submit, return for revision, revise, finalise, finalised read-only/versioned behaviour.
- Group consolidated risk: hierarchy, member drilldown, consolidated metric, missing-member state, excluded-member explanation, reload persistence.

Console and network errors captured; functional errors fixed before any gate is marked PASS. Empty cards do not count as a pass.

## 4. Regression smoke

Existing flows exercised: returns configuration, form rendering, submission, validation, amendment/version history, review queue, approve/reject/return, late/overdue handling, existing entity profile, prudential dashboards, assessment routes, report generation from returns, returns RLS. Plus the full frontend vitest suite and typecheck.

## 5. CI wiring

`db-tests` job in `.github/workflows/ci.yml` extended with a required-file assertion for the six `supabase/tests/phase2/*.sql` files, matching the existing Phase 1 pattern so the suite runs on every push.

## 6. Failure handling

For each failing assertion: identify it exactly, classify as fixture error vs real defect, fix only the Phase 2 defect, add a regression assertion, rerun the affected group, then rerun the whole Phase 2 suite and relevant frontend tests. No unrelated refactoring.

## 7. Final report

Matrix of PRU-ANA-001 / PRU-ASS-001 / PRU-GRP-001 across DB behaviour, RLS, runtime UI, audit/provenance, regression, final state — followed by exact test files and assertion counts, personas and scenarios, pages/actions exercised, regression flows tested, unresolved assertions, and files changed (only if a real defect was found).

Closure output is `PHASE 2 VERIFIED — READY FOR PHASE 3` only if all three FRD IDs pass every gate; otherwise `PHASE 2 NOT YET VERIFIED` with the remaining unproven gates listed. Phase 3 is not started.
