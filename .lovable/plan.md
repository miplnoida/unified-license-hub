# Legal/Compliance Review Workflow Stage

Add an opt-in Legal/Compliance Review step type to the existing approval workflow engine, with role-restricted structured "legal notes" that are visible only to Legal/Compliance reviewers and authorized internal approvers. Existing workflows and approvals are not changed.

## 1. Database (single migration)

**Seed dynamic role**
- Insert into `public.roles` if missing: `name = 'Legal/Compliance'`, slug `legal_compliance`. Capture id for use in seeds/helpers. Do NOT remove or rename existing roles.

**Extend `approval_steps`**
- Add `is_legal_compliance_stage boolean NOT NULL DEFAULT false`.
- All other behavior (approver role, step actions, comments, signature, SLA, order, enabled actions) stays driven by existing columns — the flag only marks the step as legal/compliance for UI + access checks.

**New table `public.application_legal_notes`**
- Columns: `id uuid pk`, `application_id uuid not null`, `workflow_instance_id uuid null`, `step_id uuid null`, `actor_id uuid not null`, `note_text text not null`, `has_legal_concern boolean not null default false`, `concern_severity text check in ('low','medium','high','critical') null`, `recommended_conditions text null`, `recommendation text not null check in ('no_objection','approve_with_conditions','request_more_information','escalate','reject')`, `restricted boolean not null default true`, `created_at`, `updated_at`, `updated_at` trigger.
- Indexes on `application_id`, `workflow_instance_id`.
- GRANT SELECT/INSERT/UPDATE to `authenticated`; ALL to `service_role`. No anon grant.
- ENABLE RLS.

**Helper SECURITY DEFINER functions**
- `public.is_legal_compliance_user(_user_id uuid) returns boolean` — true if user has the Legal/Compliance dynamic role OR a legacy admin/super-admin role.
- `public.can_view_application_legal_notes(_user_id uuid, _application_id uuid) returns boolean` — true if:
  - user is Legal/Compliance, OR
  - user is super admin / regulator admin (reuse existing helpers), OR
  - user is an internal approver eligible to act on any current/future step of the application's active workflow instance (reuse the same role/step membership logic that `user_can_act_on_workflow_step` already uses; checked across all steps of the workflow, not just current).
- `public.log_restricted_legal_note_denial(_application_id uuid, _note_id uuid, _reason text, _source text) returns void` — writes `audit_logs` row with action `restricted_legal_note_access_denied` and metadata `{user_id, application_id, note_id, reason, source, timestamp}`. Never includes note contents.

**RLS policies on `application_legal_notes`**
- SELECT: `can_view_application_legal_notes(auth.uid(), application_id)`.
- INSERT: `actor_id = auth.uid()` AND `is_legal_compliance_user(auth.uid())` AND the target step is flagged `is_legal_compliance_stage` AND user can act on that step (via existing `user_can_act_on_workflow_step`).
- UPDATE: only own row, same restrictions, within active step.
- DELETE: denied (no policy).

Applicant/external/portal RLS on `applications` is unchanged — they have no path to this table.

## 2. Workflow engine integration

- No change to `perform_workflow_transition`, `perform-workflow-action`, signatures, AI, certificates, renewals, or comments. Legal notes are advisory only.
- Reuse `user_can_act_on_workflow_step` for action eligibility. We additionally gate INSERT on `is_legal_compliance_user` so non-legal users assigned to the step (edge case) still cannot write notes.

## 3. Admin UI (Workflow Builder)

`src/components/workflows/` step editor:
- New toggle "Legal/Compliance Review stage" bound to `is_legal_compliance_stage`.
- When on: show inline hint "Only users with the Legal/Compliance role can act on this step. Reviewers can record restricted legal notes."
- Recommend (non-blocking) selecting the `Legal/Compliance` role as approver.
- Existing step config (actions, signature, SLA, sequence, enable/disable) is unchanged and continues to apply.

## 4. Workflow Panel UI

In `src/components/applications/ApplicationWorkflowPanel.tsx` (and the equivalent for returns/registrations if they use the same step type — scope to applications first; other entity panels untouched unless they share the component):

- Fetch `application_legal_notes` for the application via TanStack — request will simply 0-row for unauthorized users due to RLS.
- Fetch a tiny `can_view_application_legal_notes` RPC result to decide whether to render the section header at all.

**Current step is legal/compliance AND viewer is Legal/Compliance user**
- New section `Legal/Compliance Notes` with form: textarea, "Flag legal concern" switch, severity select (low/medium/high/critical, enabled only when flag on), recommended conditions textarea, recommendation select (5 values), `Save Legal Note` button.
- On save → insert into `application_legal_notes` (RLS enforces). Toast on success, refresh list.
- Below: list of existing notes for this application (newest first) with author + timestamp + recommendation badge + severity badge.

**Authorized later-stage approver / admin (not on legal step)**
- Read-only `Legal/Compliance Review Summary` listing notes with same metadata, no edit controls.

**Unauthorized internal users**
- Render nothing, or a single muted line `Restricted legal notes` only when the workflow actually has a legal/compliance step (we know this from steps, not from notes). No counts, no contents.

**Applicant / external / pre-license portal**
- Section never mounts (existing portal gating). Confirmed by RLS too.

## 5. Denial logging

Two paths:
- A thin edge function `read-application-legal-notes` is NOT introduced; we rely on RLS for reads.
- A dedicated RPC `request_legal_notes_access(_application_id)` returns `{ allowed: boolean }`. When `false` AND the caller actually attempted to view the section (frontend calls this only when rendering the gated UI), it calls `log_restricted_legal_note_denial` server-side. This avoids logging on every benign page load.
- Inserts that violate RLS will already error; we additionally call `log_restricted_legal_note_denial` from a `BEFORE INSERT` trigger when `is_legal_compliance_user` returns false, then raise — so write denials are also audited.

Audit metadata never contains `note_text`, severity, or recommendation.

## 6. Tests

- Vitest unit: visibility helper resolution (legal user, approver in later step, admin, applicant, unrelated internal).
- Migration contract test (similar to existing `workflowBuilderRuntime.test.ts`) asserting:
  - `is_legal_compliance_stage` column exists,
  - `application_legal_notes` table + RLS policies present,
  - `can_view_application_legal_notes` function exists,
  - audit action string `restricted_legal_note_access_denied` is referenced.

## 7. Non-goals / untouched

Normal approval workflow behavior, existing actions, comments, digital signatures, AI analysis, reports, renewals, certificate generation, applicant-facing UI, and existing workflow permissions stay exactly as today. Workflows without a legal/compliance step behave identically — no new queries fire because the panel only renders the section when at least one step has `is_legal_compliance_stage = true`.

## Technical notes

- Files to add: 1 migration; `src/components/applications/LegalComplianceNotesSection.tsx`; `src/hooks/useApplicationLegalNotes.ts`.
- Files to edit: workflow step editor component under `src/components/workflows/`; `ApplicationWorkflowPanel.tsx`; types regenerated after migration.
- All access checks server-side via SECURITY DEFINER functions + RLS; UI gating is cosmetic.
