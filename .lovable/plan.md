## Scope

Two focused fixes on the RFI feature. No changes to the working Audit tab or other modules.

## 1. Notify applicant on RFI raise (in-app + email + dashboard)

**File:** `src/components/applications/RaiseRfiDialog.tsx`

After the `application_rfis` + `application_rfi_items` inserts succeed, fire two side effects (both non-blocking, wrapped in try/catch, before the success toast):

- **In-app notification:** insert a row into `notifications` for the applicant (`user_id = applications.applicant_id`) with:
  - `title`: "Information requested on your application"
  - `message`: RFI summary + item count + due date
  - `type`: `'rfi'`, `link`: `/applications/{application_id}?tab=rfi`, `read: false`
  This automatically surfaces in the applicant dashboard (already reads unread notifications) and header bell.
- **Email + templated in-app fanout:** call `dispatchNotificationEvent` (from `@/lib/notificationEvents`) with `event_key: 'application.rfi_raised'`, `entity_type: 'application'`, `entity_id: application_id`, and payload containing `application_number`, `applicant_id`, `rfi_id`, `summary`, `due_at`, `item_count`, `link_url`. The dispatch pipeline resolves the applicant recipient and delivers email using the existing template infrastructure.
- Look up `applicant_id` and `application_number` in a single small `applications` select before dispatching.

No new edge function is needed — `dispatch-notification-event` already handles recipient resolution, email delivery, dedupe, and logging.

## 2. Clear "pending / information requested" state when an RFI is closed

**Problem:** When staff use the workflow action `request_more_info`, the RPC sets `applications.status = 'info_requested'`. Closing the RFI from the RFI tab only updates the RFI row and resumes the SLA — the application status stays `info_requested`, so the applicant's dashboard tile ("Information Requested") and the Applications list "Pending" bucket keep counting it.

**Fix:** in `closeRfi` inside `src/components/applications/ApplicationRfiTab.tsx`, after the RFI + step-action updates succeed:

- Fetch the current `applications.status` for this `application_id`.
- If it is `info_requested` or `query_raised`, update it back to `under_review` (matching the status the workflow parks it at while paused).
- Write an `audit_logs` entry noting the status revert with `old_status` / `new_status`.
- Also fire `dispatchNotificationEvent` with `event_key: 'application.rfi_closed'` so the applicant sees the closure in-app + email.

This is the minimal, targeted change: the RFI badge on the tab and the applicant dashboard's action-required list already filter by RFI status `in ('open','responded')`, so those clear correctly once the RFI row is closed — only the application-status side needed reverting.

## Out of scope

- Licensee Audit tab (already delivers full chronological trace, supervisory plan auto-creation, and time-bound corrective actions with `due_date` per action tier). No changes.
- Workflow RPC, other approval flows, dashboards for other roles.
