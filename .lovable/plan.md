## Goal

Add a single consolidated **Decision-Ready Summary** card on `ApplicationDetail` for internal approvers, sitting between the existing `ApplicationAiAssessmentPanel` and `WorkflowPanel`. Read-only. No new workflow logic, no new data model, no changes to existing components.

## Scope

- One new component: `src/components/applications/DecisionReadySummary.tsx`
- One small edit: `src/pages/applications/ApplicationDetail.tsx` to mount it
- Optionally one tiny helper if needed for SLA age formatting (reuse `useWorkflowSLA` / `resolveSlaInputFromInstance`)

No DB migration. No edge function changes. No changes to `DocumentList`, `WorkflowPanel`, `ApplicationAiAssessmentPanel`, RLS, or routing.

## Visibility rules

Render only when:
- `portalContext.isInternal` is true (or dynamic `application_management` access), AND
- `app.status !== 'draft'` (matches existing AI panel gating)

Never rendered for applicants, licensees, pre-licensees. RLS already blocks `application_ai_assessments` and internal `approval_actions` columns; component additionally guards on role.

## Layout

Compact card with collapsible subsections (shadcn `Accordion` / `Collapsible` + `Badge`):

1. **Case Snapshot** — application number, applicant name/email, entity/company, license type / sector / sub-sector / category / service (via `formatTaxonomyLabel`), status badge, current workflow step name, submitted/created dates.
2. **SLA & Status** — total age since `submitted_at`, current-step age via `workflow_instances.updated_at` fallback (labeled "estimated" when not exact), step SLA hours from `version_snapshot`, within/overdue badge using existing `useWorkflowSLA` + `SlaStatusBadge`.
3. **Documents** — total count merged from `documents` + `file_uploads` by `entity_type='application'`/`entity_id=app.id` (same pattern as `DocumentList`); "missing documents" flag pulled from AI assessment `rule_check_snapshot` when present; embeds existing `DocumentList` inside accordion for view/download — no new storage URLs.
4. **AI / Risk Flags** — reads latest row from `application_ai_assessments` (status, summary, routing recommendation, confidence, counts of high/critical findings, risks, missing info, top 3 findings/risks, generated_at). Shows advisory disclaimer. Empty state links to existing AI panel above. Also surfaces deterministic flags: `paymentComplete` (already in parent), submitted forms count (`formTemplateIds.length`), document count, missing info count.
5. **RFIs & Responses** — derived from existing `approval_actions` filtered to RFI-style actions (`resubmission_requested`, `info_requested`, `query_raised`, `returned_for_correction`, `edit_requested`, `resubmitted`). Pairs each request with the next `resubmitted`/response action to show status open/responded. No parallel workflow.
6. **Notes & Remarks** — consolidated internal comments from `approval_actions.comments` (excluding RFI rows already shown). Placeholder "No legal notes recorded" if none.
7. **Submitted Responses** — compact list of form template names from `templateNames` already loaded in parent + completion state from `formsData`; accordion to expand and reuse existing `SubmittedForms` rendering link by switching tabs (button: "View full responses" sets `activeTab='forms'`).

## Data sources per subsection

| Subsection | Source |
|---|---|
| Case Snapshot | `applications` row + `profiles`/`pre_license_users` for applicant name (already loaded in parent, pass via props) |
| SLA | `workflow_instances` (entity_type='application', entity_id=app.id) + `useWorkflowSLA` |
| Documents | `documents` + `file_uploads` (merged), AI `rule_check_snapshot` |
| AI / Risk | `application_ai_assessments` latest row |
| RFIs | `approval_actions` (already loaded as `events` in parent, pass via props) |
| Notes | `approval_actions.comments` |
| Submitted Responses | `app.data.form_template_ids` + `templateNames` (already in parent) |

## Mount point

In `ApplicationDetail.tsx` around line 820–824, insert immediately after `<ApplicationAiAssessmentPanel />` and before `{showWorkflowPanel && <WorkflowPanel .../>}`:

```tsx
{isInternal && app.status !== 'draft' && (
  <DecisionReadySummary
    application={app}
    events={events}
    templateNames={templateNames}
    paymentComplete={paymentComplete}
    onJumpToFormsTab={() => setActiveTab('forms')}
  />
)}
```

## Non-goals / guardrails

- No Approve/Reject/Forward buttons in the new card.
- No mutations to `applications`, `workflow_instances`, `approval_actions`, or AI tables.
- No new RLS policies (existing policies already enforce internal-only reads on AI + workflow data).
- Does not duplicate `DocumentList`; embeds it.
- Does not duplicate `ApplicationAiAssessmentPanel`; summarises it and links up.
- Does not alter applicant-facing tabs.

## Verification

- Typecheck (auto via harness).
- Manual: login as analyst/admin → Applications → Application Queue → open submitted application → confirm "Decision-Ready Summary" appears above WorkflowPanel.
- Manual: login as applicant → open own application → confirm summary not visible.
- Confirm WorkflowPanel actions still work and AI panel still renders.
