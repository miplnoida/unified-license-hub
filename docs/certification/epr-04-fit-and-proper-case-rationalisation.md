# EPR-04 — P05 Fit & Proper Case Rationalisation (Milestone 1)

Scope of this milestone: canonical Assessment Case, explicit assessment context,
work-queue routing, multiple-assessment isolation. Specialist F&P screens are
deliberately untouched.

## What changed

### Canonical case model (server-owned)
`public.fp_assessment_case(_assessment_id uuid)` — SECURITY DEFINER, permission
checked via `can_read_fp_assessment()` / `can_act_on_fp()`. Returns one payload:

- `header` — reference, person (`fp_individuals.id`), role/appointment
  (`fp_individual_roles.id`), entity, regulator, assessment type, stage, status,
  owner, team, priority, SLA due/state, waiting-on, last activity
- `blockers`, `available_actions`, `next_action`
- `declaration`, `screening`, `findings`, `committee`, `determination`,
  `conditions`, `monitoring`, `appeals`, `related_cases`, `history`

Every section is filtered by `assessment_id` (conditions/monitoring/appeals via
the determination belonging to that assessment), so a person's other assessments
can never contribute evidence.

Defects fixed while certifying:
1. role-less assessments raised `record "rol" is not assigned yet` — role and
   determination are now read into scalar variables that are always defined.
2. the header read a non-existent `licensees.legal_name` — corrected to `name`.

### Three separated identities
| Concept | Key |
|---|---|
| PERSON | `fp_individuals.id` |
| ROLE / APPOINTMENT | `fp_individual_roles.id` |
| ASSESSMENT CASE | `fp_assessments.id` |

### Frontend
- `/fpa/assessments/:id` → `FpaAssessmentWorkspace` (was a redirect to the person).
  Tabs: Current step, Overview, Declaration, Screening, Findings, Committee,
  Determination, Conditions, Monitoring, Appeal, Communications, Related cases,
  History. **Current step is the only lifecycle controller** — no status dropdown;
  transitions go through the existing governed operations in `src/lib/fpGovernedOps.ts`.
- `FpScreeningPanel` gained `scopeToAssessment`; the workspace always sets it, so
  runs and findings are filtered by `assessment_id`.
- `/fpa/processes` rows and row actions open `/fpa/assessments/:assessmentId`.
- `FpaIndividualProfile` is now PERSON MASTER / HISTORY: identity, roles,
  assessment history (each linking to its own workspace), regulator positions,
  conditions, appeals, monitoring summaries. The `latestAssessment` query, the
  Screening tab and the assessment-operating determinations panel were removed.
- `FpaAssessmentRedirect.tsx` retired.

## Certification

Live isolation probe against a real individual holding three assessments
(`8b5e5b4e…`), read through `fp_assessment_case` as a permitted supervisor:

| Assessment | Status | Case findings | DB findings | Case runs | DB runs | Determination |
|---|---|---:|---:|---:|---:|---|
| FP-6F057871 | draft | 0 | 0 | 0 | 0 | null |
| FP-8586464D | submitted | 0 | 0 | 0 | 0 | null |
| FP-3247A516 | awaiting_committee | 4 | 4 | 2 | 2 | null |

Every section count equals the per-assessment database count — no cross-case
bleed. Sibling assessments appear only as `related_cases` links.

Repeatable suites:
- `supabase/tests/fpa/01_assessment_case_isolation.sql` — pgTAP, 16 assertions.
  One person, assessment A (closed, determination + condition + appeal) and
  assessment B (active). Proves B exposes only B evidence and A retains its
  historical evidence.
- `src/test/fpAssessmentAuthorityGuardrails.test.ts` — 6 tests; fails the build
  if any source reintroduces `latestAssessment`, a `fp_assessments … order by
  created_at desc limit 1` process lookup, or assessment-operating panels on the
  person profile.

## Result

| Check | Result |
|---|---|
| ASSESSMENT WORKSPACE | PASS |
| PROCESS-AUTHORITY LATEST-ASSESSMENT LOOKUPS | 0 |
| MULTIPLE-ASSESSMENT ISOLATION | PASS |
| PROCESS LIST ROUTES TO ASSESSMENT | PASS |
| INDIVIDUAL PROFILE PERSON-ONLY | PASS |
| TYPECHECK | PASS |
