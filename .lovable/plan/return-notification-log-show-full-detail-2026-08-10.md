# Return Notification Log — show full detail

Today the log page only shows Sent At, Event, Channel, Recipient, Subject, Status and a truncated Error. The underlying dispatch records hold much more (message body, payload, delivery timestamps, retries, failure category, correlation id). Add a per-row detail view.

## What changes

1. **Row action "View detail"** — an eye icon at the end of each row (plus clicking the row) opens a side drawer.
2. **Detail drawer contents**, grouped into readable sections:
   - **Summary**: event key, module, channel, status / delivery state, provider, template name + version, fallback-template flag.
   - **Recipient**: name (resolved from the user id where available), email, phone, related record (entity type + id link where a route exists).
   - **Timeline**: requested, queued, sent to provider, sent, delivered, failed, last attempt, next attempt, acknowledged — each with date + time via the shared `formatDateTime` utility, blanks hidden.
   - **Message**: subject and the rendered content (plain text/HTML preview, scrollable).
   - **Delivery diagnostics**: attempts / retry count, failure category, error message, error details, poisoned flag, correlation id, dedupe key.
   - **Payload**: collapsible pretty-printed JSON with a copy button.
3. **Table tweaks**: keep existing columns, widen nothing; error stays truncated with full text available in the drawer.
4. Internal identifiers (dispatch id, notification id, template id) are shown only inside a collapsed "Technical references" block at the bottom of the drawer, consistent with how internal IDs are handled elsewhere.

## Technical notes

- Extend `useReturnDispatchLog` in `src/hooks/useReturnsManagement.ts` to select the additional columns already present on `notification_dispatch_log` (payload, rendered_content, provider, template_id/version, timestamps, attempts, failure_category, error_details, correlation_id, module, communication_state, poisoned, used_fallback_template). No database change required.
- New component `src/components/returns/NotificationDispatchDetailDrawer.tsx` using the existing shadcn `Sheet`, rendering only fields that have values.
- Resolve recipient display names with the existing internal-user lookup hook rather than showing raw UUIDs.
- Wire the drawer into `src/pages/admin/returns/NotifLogPage.tsx` with local `selectedId` state.
- The same drawer is reusable for the F&P notification log later; scope here is the returns log only.
