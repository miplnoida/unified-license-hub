## Gap

When a reviewer raises an RFI on an application:
- **No notification** is sent to the applicant (`RaiseRfiDialog` only inserts rows + audit log; never calls `dispatchNotificationEvent`).
- **Applicant dashboard "Action required"** only reads `applications.status` (`info_requested`, `resubmission_requested`, etc.) — raising an RFI does **not** change status, so the applicant sees nothing new.
- **No count/badge on the RFI tab** in Application Detail — applicant has no visual cue that questions are waiting.

The RFI response UI itself (`ApplicationRfiTab`) already works for applicants; only the discovery + notify path is missing.

## Changes

### 1. Dispatch notification when RFI is raised — `src/components/applications/RaiseRfiDialog.tsx`
After the RFI + items insert (right before `toast.success`), fire:
```ts
await dispatchNotificationEvent({
  event_key: 'application.rfi_raised',
  entity_type: 'application',
  entity_id: applicationId,
  payload: {
    application_id: applicationId,
    application_number: <fetched or passed in>,
    rfi_id: rfiId,
    item_count: items.length,
    due_at: dueAtIso,
    summary: summary.trim() || null,
    applicant_id: <fetched from application>,
  },
});
```
Fire-and-forget — never block the reviewer flow.

### 2. Seed the notification event config — new migration
Insert one row into `notification_event_configs` for `application.rfi_raised`:
- `channels`: in-app + email
- `recipient_rules`: `applicant` (resolves via `applications.applicant_id` from `entity_id`)
- Title: `Information requested on {{application_number}}`
- Body: `A reviewer has requested {{item_count}} clarification(s) on your application {{application_number}}. Please respond by {{due_at}}.`
- Deep link: `/applications/{{application_id}}?tab=rfi`

Same GRANT/RLS pattern as existing event configs — no schema changes.

### 3. Surface open RFIs in the applicant "Action required" list — `src/hooks/useApplicantMetrics.ts`
Add a parallel query for open RFIs on this user's applications:
```ts
supabase
  .from('application_rfis')
  .select('id, application_id, raised_at, due_at, summary, applications!inner(id, application_number, applicant_id)')
  .in('status', ['open','responded'])
  .eq('applications.applicant_id', userId)
  .order('raised_at', { ascending: false })
  .limit(20)
```
Merge these into `priority_lists.action_required` as synthetic rows with a stable shape (`id` = rfi id, `application_number`, `status: 'rfi_open'`, `updated_at: raised_at`, plus `application_id`, `rfi_id`, `item_count`). Dedupe against status-derived rows by `application_id`.

Also bump `applications.clarification_requested` metric to include the open-RFI count so the "Action required" summary card is accurate.

### 4. Render RFI rows in `ActionRequiredList` — `src/components/dashboard/applicant/ActionRequiredList.tsx`
- Extend `REQUEST_TYPE_LABEL` with `rfi_open: 'Information Requested'`.
- When a row's status is `rfi_open`, "Continue" button links to `/applications/{application_id}?tab=rfi`; otherwise keep current link.
- Update the row's `ActionRequiredRow` type to allow the extra `application_id` field (optional).

### 5. Add unread badge on the RFI tab — `src/pages/applications/ApplicationDetail.tsx`
Fetch open RFI item count for this application (already available via `useApplicationRfis`, or a cheap count query) and render a small numeric badge next to the `RFI` `TabsTrigger` when > 0 and the viewer is the applicant. No layout change beyond the badge.

### 6. Deep-link the RFI tab — `src/pages/applications/ApplicationDetail.tsx`
Honour `?tab=rfi` on mount so the notification/dashboard deep link opens the RFI tab directly. One-line effect using `useSearchParams`.

## Out of scope (unchanged)

- RFI response flow (already implemented for applicants).
- SLA pause/resume behaviour on `approval_step_actions`.
- Reviewer-side surfaces (queue, sufficiency panel).
- No table/column additions.

## Verification

1. On an admin/reviewer account, raise an RFI on an in-progress application.
   - Applicant receives an in-app notification and email pointing to `/applications/:id?tab=rfi`.
2. Log in as the applicant.
   - Dashboard "Action required" card shows the application with label **Information Requested**.
   - Application Detail shows a numeric badge on the **RFI** tab.
   - Clicking Continue opens the RFI tab; applicant can respond as before.
3. After the applicant responds to all items, the RFI status becomes `responded`; the dashboard row disappears; badge clears.
