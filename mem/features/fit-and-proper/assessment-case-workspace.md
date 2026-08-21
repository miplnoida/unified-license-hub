---
name: Fit & Proper assessment case workspace
description: F&P process authority is the assessment id; person profile is history-only and no code resolves a "latest assessment"
type: feature
---
- Process authority = ASSESSMENT CASE (`fp_assessments.id`). PERSON = `fp_individuals.id`, ROLE/APPOINTMENT = `fp_individual_roles.id`. Never operate "the latest assessment".
- `/fpa/assessments/:id` is `FpaAssessmentWorkspace.tsx`, driven entirely by `public.fp_assessment_case(_assessment_id)` (header, blockers, available_actions, next_action, declaration, screening, findings, committee, determination, conditions, monitoring, appeals, related_cases, history).
- **Current step** is the only lifecycle controller — no generic status dropdown; transitions use governed ops in `src/lib/fpGovernedOps.ts`.
- `/fpa/processes` rows open the assessment workspace, not the individual profile.
- `FpaIndividualProfile` is PERSON MASTER / HISTORY only (identity, roles, assessment history, regulator positions, conditions/appeals/monitoring summaries) — no screening tab, no determination-operating panel.
- `FpScreeningPanel` takes `scopeToAssessment`; the workspace always sets it so evidence from another assessment cannot leak.
- Guardrails: `src/test/fpAssessmentAuthorityGuardrails.test.ts` and `supabase/tests/fpa/01_assessment_case_isolation.sql`.
