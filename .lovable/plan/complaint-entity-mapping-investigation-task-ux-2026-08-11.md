# Complaint entity mapping + Investigation task UX

Two defects, both fixed without touching the Complaint Management Workflow, workflow definitions/steps/actions, RBAC or approval matrices.

## What is wrong today (verified)

- `public.create_complaint(variant, payload)` only stores `licensee_id` if the caller's payload supplies it. The portal "Submit a complaint" path in `ComplaintsList.tsx` sends `variant: 'licensee'` with subject/description/email only — no entity context — so every portal complaint lands with `licensee_id = NULL`.
- `ComplaintDetail.tsx` therefore renders the "Link Licensee" search card whenever `licensee_id` is null, and its `CommandEmpty` prints "No licensees found." for all three different situations: real no-match, an applicant entity that is not licensed, and a failed search query.
- Applicant/pre-license submitters exist in `pre_license_users` (`entity_name`, `sector_id`, `status`) and their licensing progress is in `applications.applicant_id` — there is no `licensees` row for them, so linking a licensee is not the right action for these complaints.
- `ComplaintInvestigationTab.tsx` shows per-task **Start / Complete / Cancel** ghost buttons of equal weight that write straight to `complaint_investigation_tasks`, which reads as a second lifecycle next to the configured workflow.

## 1. Entity context (backend, smallest safe change)

- New read-only function `public.resolve_complaint_entity_context(_complaint_id uuid)` returning a single JSON object:
  - `kind`: `licensed` | `applicant` | `none`
  - `licensee_id`, `entity_name`, `license_number` for licensed entities
  - `entity_name`, `application_number`, `application_status` for applicant entities (from `pre_license_users` + latest `applications` row for `complainant_id`)
  - `source`: how it was derived (`complaint.licensee_id`, `profile.licensee_id`, `pre_license_user`), so the UI can label it truthfully.
  - `SECURITY DEFINER`, gated by the same `public.has_complaint_perm(auth.uid(),'view')` / `public.external_can_access_complaint` predicates the existing complaint read RPCs use. Read-only, no writes.
- `create_complaint(variant, payload)`: when `licensee_id` is absent from the payload and the submitter has an explicit `profiles.licensee_id`, store that as the complaint's `licensee_id`. Explicit signal only — no name/email matching, no writing applicant records into `licensees`. Everything else in the function stays as is.
- No new complaint columns; `complaints.licensee_id` remains the canonical licensed-entity link.

## 2. Entity section on Complaint Detail (frontend)

Replace the "Link Licensee" card + separate linked-licensee card with one **Entity** section driven by the resolver:

- Licensed: entity name, "Licensed entity", license number, secondary action **Change linked entity**.
- Applicant: entity name, "Applicant entity", "Licensing application in progress" (uses real application status), plus a note that enforcement escalation requires a licensed entity record. Manual override stays available as a secondary **Link licensed entity** action for regulator staff — never as the default state.
- None: "No entity has been identified for this complaint." + **Link entity** (the existing picker).
- Search states become distinct: `Searching…`, `No matching licensed entity found.`, and on query failure `Licensee search could not be loaded. [Try again]` — failure is never rendered as an empty result.
- Escalation guard text and the backend licensed-entity requirement are unchanged.

## 3. Investigation tasks as supporting work items

- Relabel actions: **Mark in progress**, **Mark task done**, **Reopen task** (where permitted). **Cancel task** moves into a "More actions" overflow with a confirmation that states "This will not close or cancel the complaint."
- Card header gains a progress summary ("3 of 5 tasks done") and a one-line note that tasks do not advance the complaint; the complaint only moves via the configured action on **Current step**.
- Context-aware editing driven by existing status/tracking data already loaded on the page: read-only after closure (current behaviour, kept), and before the investigation stage the panel explains that task management becomes available at the investigation step. No workflow definitions consulted or changed.
- Task writes keep using `complaint_investigation_tasks` under existing RLS (no canonical task RPC exists; none will be invented). Audit labels become business-readable: "Investigation task marked in progress", "Investigation task completed", "Investigation task cancelled".

## 4. Current step summary

`ComplaintCurrentStepPanel` gets an "Investigation" block: task counts, the task list with done/open markers, and **Open investigation**. Outstanding tasks are shown as *Outstanding work — recommended before progressing*, clearly separated from workflow-required items. No new blockers; the configured workflow action stays the only progression control.

## Files touched

- Migration: `resolve_complaint_entity_context`, small `create_complaint` adjustment.
- `src/pages/complaints/ComplaintDetail.tsx` — Entity section, truthful search states.
- New `src/components/complaints/ComplaintEntityCard.tsx`.
- `src/components/complaints/ComplaintInvestigationTab.tsx` — task labels, overflow cancel, progress, stage awareness.
- `src/components/complaints/ComplaintCurrentStepPanel.tsx` — investigation summary.
- `src/lib/complaintWorkflow.ts` — task summary helper reuse.

## Out of scope

Approval Workflow admin pages, workflow builder, step/action definitions, approval roles and matrices, routing configuration, RFI workflow, RLS/RBAC weakening.
