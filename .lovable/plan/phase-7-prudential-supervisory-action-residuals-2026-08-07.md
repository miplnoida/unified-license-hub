# Phase 7 — Prudential Supervisory Action Residuals

Phase 6 is already implemented at current HEAD (verified below), so this plan covers Phase 7 only. Work stops after Phase 7 for manual verification.

## Verified current state (inspected this turn)

Phase 6 (no further work):
- `application_acknowledgements`, `sufficiency_determinations`, `application_legal_referrals` all exist, with the `application-acknowledgement` edge function, `record_sufficiency_determination` RPC, panels (`SubmissionAcknowledgementPanel`, `SufficiencyPanel`, `LegalReferralPanel`) and `supabase/tests/phase6/01_licensing_residual.sql`.

Phase 7 (what is actually missing):
- `prudential_actions` has only 20 columns: entity, source_type/source_id, action_type, title, description, severity, due_date, assigned_to, entity_contact, status, completion_notes, waiver/cancellation reason, closed_at/by, created_by, timestamps.
- Missing entirely: human-readable action reference, evidence requirement flag, progress tracking, regulated-entity owner (a real user, not a free-text `entity_contact`), entity response/evidence submission, supervisor review outcome, breach state distinct from overdue, SLA linkage, and an append-only event history.
- Escalation exists (`prudential_escalations`) and `mark_prudential_actions_overdue` exists, so overdue sweeping and escalation are reused, not rebuilt.
- Because the fields above do not exist, the monitoring buckets the FRD requires — awaiting evidence, awaiting supervisor review, breached — cannot currently be produced from real data; `ActionsList.tsx` can only filter existing statuses.
- Onsite examination is fully present (`examinations` plus scoping, team, data requests, workpapers, findings, exit meetings, reports, events). Revalidation only.

## What will be built

### 7A Supervisory action record completion
- Additive migration on `prudential_actions`: `action_reference` (generated, unique), `evidence_required` (bool), `progress_percent`, `entity_owner_user_id`, `response_due_at`, `sla_policy_id` reusing the Phase 1 SLA registry, `breached_at`, `review_status` (`not_required`, `awaiting_review`, `accepted`, `rejected`), `review_notes`, `reviewed_by/at`.
- New `prudential_action_responses` (entity submissions: narrative, evidence document links, submitted_by/at) and `prudential_action_events` (append-only lifecycle log: from/to status, actor, reason, timestamp) with an append-only trigger and no client UPDATE/DELETE grants.
- Server-side RPCs, all `SECURITY DEFINER` with `set search_path = public`, actor taken from `auth.uid()` and never from the client:
  - `submit_prudential_action_response` — entity owner (or licensee user for that entity) only; moves the action to `awaiting_review`.
  - `review_prudential_action_response` — supervisor permission only; accepts (completes) or rejects (returns to in-progress) with mandatory reason.
  - `close_prudential_action` — refuses closure while `evidence_required` and no accepted response exists.
- Status vocabulary made explicit and enforced by check constraint: `open`, `in_progress`, `awaiting_evidence`, `awaiting_review`, `completed`, `overdue`, `breached`, `cancelled`, `waived`.
- Extend the existing overdue sweep so a due date passed by the configured SLA breach window sets `breached_at` and raises an escalation through the existing escalation path — no new escalation engine.

### 7B Action monitoring views (real data)
- One RPC returning counts plus rows for the seven required buckets (open, due soon, overdue, breached, awaiting evidence, awaiting supervisor review, completed), scoped by regulator and RLS.
- `ActionsList.tsx` gains those buckets as tabs; every row drills through to the action and, via `source_type`/`source_id`, to the originating EWI alert, CAMELS assessment, examination finding or group risk record.
- Buckets with no qualifying rows render an explicit empty/insufficient-data state; no substituted data.

### 7C Onsite examination revalidation
- Read-only verification of the thirteen lifecycle stages against the existing tables and workspace. Only proven missing FRD behaviour is added — specifically the examination-finding → supervisory-action handoff will be wired to 7A if it is not already persisted.

## Tests
- pgTAP `supabase/tests/phase7/`: action reference uniqueness; response/review gating (closure refused without accepted evidence); breach transition; event log append-only; monitoring bucket correctness; RLS persona matrix (entity owner vs other-entity direct-ID access vs supervisor vs analyst) and RPC authorization.
- RBAC oracle additions for the three new RPCs.
- Vitest for bucket derivation and drill-through link mapping.

## Technical notes
- All migrations additive; existing prudential analytics, CAMELS, groups, examinations and escalations untouched.
- Reused: Phase 1 SLA, existing escalation tables and sweeps, notification dispatch, document storage.
- Not built: a second retry engine, a parallel escalation engine, any weakening of service-role boundaries.

## Output after completion
Per-requirement table (FRD ID, before, missing gap, change, DB/RLS, automated test, manual test, final state), files changed, migrations, RPCs, policies, assertion counts, known limitations, and click-by-click manual verification steps. Then stop; Phases 8–12 remain untouched.
