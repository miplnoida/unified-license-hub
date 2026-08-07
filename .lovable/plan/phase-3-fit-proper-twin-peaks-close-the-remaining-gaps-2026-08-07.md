# Phase 3 — Fit & Proper + Twin Peaks: close the remaining gaps

Phase 1 and Phase 2 stay frozen. This phase only adds what the current Fit & Proper implementation genuinely lacks.

## Current state (verified by inspection this turn)

Already implemented and reused as-is — no rebuild:

| Area | Evidence found |
|---|---|
| Individual registry | `fp_individuals`, `fp_individual_roles` (multi-entity, effective dates, reassessment cycle), profile + list screens under `/fpa/individuals` |
| PQ / declarations | `fp_assessments.form_template_id / form_version_id / form_response_id`, trigger `fp_pin_pq_form_on_insert` (historic version pinning), `declaration_invitations` |
| Screening | `fp_screening_runs.provider_outcomes`, `fp_screening_provider_status()`, `screening-sandbox` function, `FpScreeningProviderBanner`, `fp_findings` with confidence bands + resolution status, `fp_manual_screening_tasks` + `fp_task_evidence` |
| Assessment | `fp_assessments` lifecycle with `fp_check_assessment_transition` |
| AI advisory | `fp-ai-media-ingest`, `/fpa/ai-analysis`, override registry already wired |
| Committee | `fp_committees` (quorum, threshold, casting vote), `fp_committee_members.vote_weight`, `fp_committee_votes` (weight, abstain, `fp_check_committee_vote`) |
| Determinations | `fp_determinations` with `regulator_id`, supersede chain, immutability triggers |
| Coordination | `coordination_cases`, `coordination_participants`, `coordination_flags`, `coordination_escalations`, `/coordination/*` screens, `check_coordination_gates()` |
| Conditions | `fp_conditions` with `fp_condition_lifecycle`, waiver via override registry |
| Monitoring | `fp_monitoring_events`, `fp-monitoring-sweep`, `fp-cycle-scheduler` |

Confirmed missing (each checked, not assumed):

1. **Soft duplicate detection** — only exact `national_id` / `email` matching exists in `FpaIndividuals.tsx`; no name + DOB similarity candidate surfacing.
2. **PQ validation states** — no `draft / incomplete / ready_to_submit / amendment_required` state model on the PQ; only assessment status.
3. **Assessment historical comparison** — no new / changed / unchanged / resolved / worsened diff against prior assessments anywhere in the assessment screens.
4. **Committee configuration snapshot per decision** — tally is recomputed live from current membership and weights; no frozen snapshot, so later config changes retroactively change historical outcomes.
5. **Condition evidence + immutable condition history** — no condition evidence table and no condition event log; status changes overwrite in place.
6. **Twin Peaks position comparison** — regulator determinations are stored independently but no screen shows regulator A vs regulator B positions with aligned / disagreement / coordination-pending state for an individual.

## What gets built

### 3A Registry — soft duplicate candidates
Additive RPC `fp_find_duplicate_candidates(name, dob, national_id)` scoring name similarity (`pg_trgm`), DOB match and identifier match. Surfaced in the create flow as ranked "possible duplicate" candidates with a link to the existing profile; existing hard block stays. No new identity model — `fp_individuals` remains the single persistent identity across roles/entities.

### 3B PQ validation states
Add `pq_state` to `fp_assessments` (`draft`, `incomplete`, `ready_to_submit`, `submitted`, `amendment_required`) plus `pq_amendment_reason` and `pq_state_changed_at`. State derived from the existing form-response completeness check on save (no second form engine). Declaration screen shows the state and blocks submit until `ready_to_submit`. Amendment request sets `amendment_required` with a reason and keeps the prior submitted response and its pinned form version intact.

### 3C Screening — explicit provider states
Normalise the outcome vocabulary already written into `provider_outcomes` onto a documented set: `SUCCESS_MATCH`, `SUCCESS_NO_MATCH`, `NOT_CONFIGURED`, `SANDBOX`, `PROVIDER_FAILURE`, `TRANSPORT_FAILURE`, `RATE_LIMITED`, `MANUAL`. Banner and findings list render each state distinctly; non-success states never render as "no adverse findings". No provider behaviour is faked.

### 3D Assessment — prior-history comparison
New RPC `fp_assessment_comparison(assessment_id)` returning per-finding/condition change class (`new`, `changed`, `unchanged`, `resolved`, `worsened`) against the previous assessment for the same individual. Rendered as a comparison panel in the assessment detail. Read-only — no prior evidence is mutated.

### 3E AI advisory
Keep the existing advisory pathway. Additions: explicit provider-state chip using the same vocabulary as 3C, and confirmation that accept / reject / override on advisory output routes through the Phase 1 override registry with mandatory justification and retained original output. No new AI provider path, no fabricated "clear" verdicts.

### 3F Committee — decision snapshot
Add `fp_committee_decision_snapshots` (assessment_id, committee_id, quorum, threshold, member roster with weights, tally, outcome, taken_at) written when a decision is reached, append-only. Historical outcomes read from the snapshot; live tally is used only before decision. Vote immutability enforced by the existing vote trigger, extended so a member can never write another member's vote.

### 3G Twin Peaks — independent positions
New view/RPC `fp_regulator_positions(individual_id)` returning one row per regulator with its own outcome, rationale, actor, date and conditions, plus a derived state: `ALIGNED`, `DISAGREEMENT`, `COORDINATION_PENDING`, `SINGLE_REGULATOR`. New panel on the individual profile renders positions side by side and links to the existing coordination case. Nothing is collapsed into a single conclusion field; disagreement stays visible.

### 3H Conditions — evidence + immutable history
New `fp_condition_evidence` (condition_id, file path, uploader, submitted_at, review state, reviewer, note) and append-only `fp_condition_events` (state transitions, actor, reason). `fp_condition_lifecycle` extended to record events and to add `breached` alongside existing overdue/satisfied/waived. Reuses existing storage, SLA, notification and audit primitives.

## Tests
- pgTAP `supabase/tests/phase3/`: duplicate candidate scoring; PQ state transitions and historic version reproduction; screening provider-state persistence including not-configured / transport failure / manual; assessment comparison classes; committee quorum, weighted tally, snapshot immutability, cross-member vote denial, insufficient quorum, abstention; twin-peaks aligned vs disagreement; condition evidence, overdue, breach, closure, reassessment trigger; RLS direct-ID denial for individuals, findings, conditions and snapshots.
- Vitest for the client-side derivation helpers (PQ state, comparison classes, provider-state labels).
- CI gate extended to require the Phase 3 suite.

## Technical notes
- Migrations are additive only: new tables, new nullable columns with defaults, new functions, new policies. No changes to Phase 1/2 objects except extending `fp_condition_lifecycle` (F&P-owned) and the F&P vote trigger.
- Every new table gets GRANTs, RLS enabled and regulator-scoped policies matching existing `fp_regulator_visible()` usage.
- Frontend edits confined to existing F&P screens and components plus new panels; no route renaming, no redesign.

## Reporting
At the end of Phase 3 you get the FRD-ID evidence table (code / DB / RLS / test / manual / final state), files changed, DB changes, test counts, known limitations, and the exact manual click-through steps for individual → PQ → screening → assessment → advisory review → committee → regulator determinations → condition → monitoring. Phase 3 will be reported as IMPLEMENTED — MANUAL VERIFICATION REQUIRED unless the full chain is proven in-browser with persisted data. Phase 4 will not start until that report is delivered.
