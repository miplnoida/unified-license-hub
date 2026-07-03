# Phase 3 Completion Plan — Fit & Proper + Twin Peaks Coordination

Extending existing implementation from commit `7862ad4`. No rewrites — additive slices only. Delivered in 6 slices (3C-3 through 3C-8), each independently shippable.

## Slice 3C-3 — Audit Coverage (Items 2, 10)

Wire `logAudit` + `logComplianceAudit` into every F&P and Coordination mutation site. No new tables.

**F&P surfaces touched**
- `FitAndProperRegister.tsx` / `FpIndividualDialog` — create/update/deactivate individual, duplicate-accept
- `FpIndividualDetail.tsx` — role add/update/end, link licensee/license/application
- `FitAndProperAssessmentDetail.tsx` — draft save (already partial), submit, status transitions, route-to-screening, assign committee, close
- `FpScreeningPanel.tsx` — run, success/failure, finding review, false-positive override (via existing `OverrideReasonDialog`)
- `FpCommitteesAdmin.tsx` + `FpCommitteeVotePanel` — create/update/(de)activate committee, add/remove member, cast vote, finalize
- `FpDeterminationsPanel.tsx` — approve/conditional/reject/defer, supersede
- `FpConditionsPanel.tsx` — create/update/satisfy/waive/overdue/attach evidence
- `FpAppealsPanel.tsx` — file/assign/decide/withdraw (partial via override dialog exists)

**Coordination surfaces touched**
- `CoordinationList.tsx` / `NewCoordinationCase.tsx` — create case, link/unlink subject
- `CoordinationDetail.tsx` — invite/remove participant, post message, clear/block, raise/resolve flag, close
- `CoordinationEscalationsTab.tsx` (new in 3C-6) — raise/assign/update/resolve/withdraw

Every call passes `{ action, entityType, entityId, before, after, metadata: { individual_id, assessment_id, case_id, regulator_id, participant_id } }`.

## Slice 3C-4 — F&P Workflow + Committee Governance (Items 3, 4)

DB triggers + client guards. No new tables.

**Migration `fp_governance_triggers.sql`**
- `trg_fp_assessment_transition` — enforce Draft→Submitted requires `form_response_id` marked complete; Submitted→Screening allowed; Screening→Committee requires ≥1 `fp_screening_runs` OR row in `rule_overrides` with `rule_key='fit_and_proper.skip_screening'`; Committee→Determined requires finalized `fp_determinations`; Determined/Closed reject direct edits except from `has_role(_, 'admin')` with override.
- `trg_fp_vote_unique` — `(assessment_id, member_id)` unique for active members only; reject if member inactive; require `justification` when `vote IN ('reject','conditional')`.
- `trg_fp_determination_finalize` — verify quorum (count votes ≥ committee.quorum) and threshold (% approve ≥ approval_threshold_pct) before insert with `is_current=true`; require `rationale`; conditional insert must create ≥1 `fp_conditions` row in same tx (deferred check function).
- `trg_fp_determination_immutable` — block UPDATE/DELETE on finalized rows unless via appeal (`supersedes_id` set) or admin override row.

**Client**
- `FitAndProperAssessmentDetail.tsx` — hide transition buttons when disallowed; surface trigger errors via toast + `OverrideReasonDialog` when applicable.
- `FpCommitteeVotePanel` — require justification textbox for reject/conditional; disable finalize until quorum met (computed client-side + server-enforced).

## Slice 3C-5 — Conditions, Appeals, Monitoring, Screening Transparency (Items 5, 6)

**Schema additions (migration `fp_runtime_hardening.sql`)**
- `fp_screening_runs.config_snapshot jsonb` — snapshot of active `fp_screening_configs` at run time.
- `fp_findings.config_id uuid`, `source text`, `severity_basis jsonb` — provenance per finding.
- `fp_findings.reviewed_by/reviewed_at/review_note/override_reason` (add if missing).
- `fp_conditions.overdue_at timestamptz` computed via nightly job; `waiver_reason text` required when status='waived' (CHECK via trigger).
- `fp_appeals.decision` expand enum to include `partially_upheld`, `dismissed`, `remitted` (already has `upheld_original`, `overturned_to_*` — map old→new labels, keep back-compat).
- `fp_monitoring_events.acknowledged_by/at/note` for ack; scheduled `evaluate-fp-monitoring` edge function generates overdue-condition events.

**UI**
- `FpConditionsPanel.tsx` — full CRUD: assign owner, due date, evidence upload (via existing `VersionedDocumentUploader`), satisfy/waive with mandatory reason, overdue badge.
- `FpAppealsPanel.tsx` — extend decision picker; on `overturned_*` create new `fp_determinations` (already partial) + link `new_determination_id`.
- `FpMonitoringPanel.tsx` — event list, acknowledge button with note, "Trigger recheck" action calling edge function.
- `FpScreeningPanel.tsx` — show snapshot pill, config id per finding, mandatory reason on false-positive toggle, integration log entries on failure via `logIntegrationFailure`.

**Edge functions**
- `evaluate-fp-monitoring` (new, cron) — scan `fp_conditions.due_date < now() AND status='open'` → insert `fp_monitoring_events` with severity + notify owner.

## Slice 3C-6 — Coordination Escalation + Subject Types + Regulator Logic (Items 9, 12, 13)

**Migration `coordination_escalation.sql`**
- `coordination_escalations` table with fields per spec + GRANTs + RLS (participants can read; raised_by/assigned_to/admin can write; resolve requires rationale via trigger).
- Extend `coordination_cases.subject_type` CHECK to include `complaint`, `prudential_return`, `prudential_finding`, `fp_assessment`, `enforcement_action`.
- Seed regulators `ABC_PRUDENTIAL` and `FSC_CONDUCT` if absent (idempotent insert).
- Add `coordination_cases.primary_regulator_id` (nullable, references regulators) alongside `owner_regulator_id`.

**UI**
- `CoordinationDetail.tsx` — new `EscalationsTab` (raise/assign/update/resolve/withdraw with rationale), regulator badges on participants/messages/clearances, mandatory note on `block` clearance and case closure.
- `NewCoordinationCase.tsx` — expanded subject-type dropdown; primary/secondary regulator selects; subject lookups per type.
- `LinkedSubjectCard` component reused across subject detail pages (Slice 3C-7).

## Slice 3C-7 — Application/Licensing ↔ F&P + Coordination Decision Enforcement (Items 7, 11)

No new tables — new columns + read-only integrations.

**Migration `licensing_fp_link.sql`**
- `applications.required_fp_roles jsonb` — array of `{role, individual_id?, assessment_id?}` slots (director, controller, senior_manager, key_person, shareholder).
- Trigger `trg_application_final_approval_fp_gate` — block status='approved' unless every required slot has a current `fp_determinations` with outcome IN ('approved','conditional'); conditional allows only when application status='conditional_approval'.
- Trigger `trg_source_case_coordination_gate` — before approve/close on `applications`, `complaints`, `fp_assessments`, `enforcement_actions`, `compliance_returns`: reject if any linked `coordination_cases` has pending/blocked clearances or open escalations unless resolution_outcome='conditionally_cleared' (allows conditional decision only).

**UI**
- `ApplicationDetail` (existing) — new **Fit & Proper** section: list required roles, link/create assessment button, live status chips; new **Coordination** section: linked cases + pending blockers.
- `ComplaintDetail`, `FitAndProperAssessmentDetail`, `EnforcementDetail`, `ReturnDetail` — inject shared `LinkedCoordinationCard` showing status/participants/blockers/escalations.
- Decision buttons on each surface disabled with tooltip when gate fails; override path via `OverrideReasonDialog`.

## Slice 3C-8 — Shared Registry Dedupe, Configurable PQ finalization, Permissions, Types, Build (Items 1 finalization, 8, 14, 15, 16)

**PQ Form Builder finalization (item 1)**
- Verify seeded master PQ contains all 15 required sections listed in spec; migration `fp_pq_master_v2.sql` appends any missing sections (identity, nationality/residence, current/proposed roles, employment history, qualifications, directorships, ownership, regulatory history, criminal, bankruptcy, disciplinary, conflicts, related parties, AML/CFT, consent).
- `FitAndProperAssessmentDetail` — remove hardcoded declaration UI from primary path; retain behind `if (!form_version_id)` legacy branch only.

**Shared registry (item 8)**
- Migration `fp_individuals_dedupe.sql` — `fp_find_duplicate_individuals(_national_id, _passport, _email, _full_name, _dob)` SECURITY DEFINER function returning candidate matches with match_reason.
- `FpIndividualDialog` — call function on blur of key fields → show `DuplicateWarningDialog` with "Use existing" (link) or "Create anyway" (audited) options.
- `FpIndividualDetail` — cross-regulator roles/determinations tabs already exist; add RLS check ensuring `restricted_notes` visible only to owning regulator's staff.

**Permissions (item 15)**
- Migration `phase3_permission_seeds.sql` — idempotent inserts for `permission_modules` `fit_and_proper`, `coordination`; `permission_actions` view/create/edit/approve/reject/admin; `role_permissions` assigning to `regulator_admin`, `licensing_officer`, `conduct_officer`, `prudential_officer` per matrix.

**Types + Build (items 14, 16)**
- Regenerate `src/integrations/supabase/types.ts` covering all Phase 3 tables including `coordination_escalations` and new columns.
- `npm run build` clean; fix any TS errors.
- Smoke: vitest run for new logic (workflow guard, dedupe fn, coordination gate).

## Sequencing & Deliverables per slice

Each slice ends with: migration(s) applied, files listed, targeted vitest, `npm run build` pass, and short acceptance note against the spec item(s) it covers. Final message after 3C-8 includes the full checklist required by the user (commit SHA, files, migrations, all 15 confirmations, build result).

## Technical notes

- All new triggers use `SET search_path = public` and are `SECURITY DEFINER` only where cross-table checks demand it.
- Every new public table gets `GRANT` block before `ENABLE RLS` per project rules.
- Override paths uniformly go through existing `OverrideReasonDialog` + `rule_overrides` table — no bespoke bypass UIs.
- Audit calls batched into helper `logFpAction(action, entity, id, before, after, extra)` in `src/lib/fpAudit.ts` and `logCoordinationAction(...)` in `src/lib/coordinationAudit.ts` to keep call sites terse.
- No changes to `src/integrations/supabase/client.ts`; types file regenerated only after migrations approved.

Reply **"continue 3C-3"** to start with the audit-coverage slice, or name a different slice to prioritize.
