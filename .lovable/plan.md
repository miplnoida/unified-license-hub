## What the FRD asks for (NOT-THR-001) vs what exists

I re-read section 10.2 of the FRD and inspected the current module (`correspondence_threads/messages/attachments/events` tables, `useCorrespondence.ts`, `src/pages/correspondence/*`).

What exists today is a **mail-intake case tracker**: a thread row with sender details, a received→classified→assigned→in_review→approved→responded→closed lifecycle, messages, versioned attachments, an audit trail, routing rules and a licensee portal view. It persists correctly, but it is not the FRD screen.

Confirmed gaps against the spec:

| FRD requirement | Current state |
|---|---|
| Thread type (RFI Response / General Correspondence / Enforcement Notice / Condition Reminder / Supervisory Letter / Internal Discussion) | No `thread_type` column |
| Linked case (required for regulatory comms) + entry from any case workbench "Communications" tab | No case link columns at all; only `licensee_id` |
| Left thread list + right thread detail + bottom composer (master/detail) | Separate Inbox table and full-page detail |
| Parties/participants, unread badge, read receipts | No participants table, no read state |
| Thread status Open / Pending Response (SLA timer) / Closed | Different 7-state intake lifecycle; no Pending Response |
| Message colour coding: system grey, outbound blue, inbound green, internal purple + "not visible to entity" watermark | Only inbound/outbound/internal-note styling |
| Composer: rich text, template selector, preview before send, Save Draft, character count, internal/external toggle | Plain textarea, no templates/draft/preview/count |
| Per-message delivery status (Sent/Delivered/Opened/Bounced) + bounce alert to sender | Not tracked on messages |
| Thread export to PDF (court-admissible, audit `THREAD_EXPORTED`) | No export |
| Automated Message Log tab (system notifications for the thread's case) | Not present |
| Audit event names `THREAD_CREATED`, `MESSAGE_SENT`, `THREAD_CLOSED`, `THREAD_EXPORTED`, `MESSAGE_DELIVERY_FAILED/CONFIRMED` | Events use lowercase intake verbs |
| R-13 read-only all threads, R-01 admin all threads | Not explicitly covered |

## Plan

### 1. Database (additive migration — no existing column removed)
- `correspondence_threads`: add `thread_type`, `thread_state` (`open` / `pending_response` / `closed`), `source_type` + `source_id` + `source_reference` (linked case), `last_message_at`, `pending_since`, `response_due_at`, `close_justification`, `is_entity_facing`.
- New `correspondence_thread_participants` — thread_id, user_id, party_type (`entity` / `officer` / `system`), display name, role, `last_read_at`. Drives Parties, unread badges and read receipts.
- `correspondence_messages`: add `message_kind` (`system` / `external_outbound` / `external_inbound` / `internal`), `delivery_status` (`queued/sent/delivered/opened/bounced`), `delivered_at`, `opened_at`, `bounce_reason`, `is_draft`.
- Backfill: existing rows get `thread_type='general_correspondence'`, `thread_state` derived from current status, `message_kind` derived from direction + `is_internal_note`. Existing screens keep working unchanged.
- RLS/GRANTs on the new table following the module's existing pattern; entity participants can never read `internal` messages or internal notes. Read-only all-thread access for the audit role, admin access for R-01.

### 2. RPCs (new or extended, all `SECURITY DEFINER`, audit written atomically)
- `create_correspondence_thread` extended: thread type, linked case (validated: required unless type is `internal_discussion`), participants, entity-facing flag. Audit `THREAD_CREATED`.
- `post_correspondence_message` extended: `message_kind`, draft support, delivery status seeding. Audit `MESSAGE_SENT`.
- `set_correspondence_thread_state` — Open / Pending Response (starts response SLA) / Closed; closing while a response SLA is open requires justification. Audit `THREAD_STATUS_CHANGED` / `THREAD_CLOSED`.
- `mark_correspondence_thread_read` — updates participant `last_read_at` (read receipt + unread count).
- `record_correspondence_delivery` — sets delivered/opened/bounced; on bounce writes `MESSAGE_DELIVERY_FAILED` and notifies the sending officer; confirmation writes `MESSAGE_DELIVERY_CONFIRMED`.
- Threads/messages remain non-deletable (R-NOT-007) — no delete policy, no delete RPC.

### 3. Staff screen — rebuild `/correspondence/threads` as the FRD two-panel manager
- **Left panel**: thread list sorted by last activity — auto title (`case reference — thread type`), parties, last-message preview + timestamp, unread badge, status chip. Search by title / entity / case reference; filters for Status, Module, Direction (Inbound/Outbound/Internal).
- **Right panel**: chronological message history with the FRD colour scheme (grey system + icon, blue external outbound, green external inbound, purple internal with "Internal — not visible to entity" watermark), sender + role + timestamp, attachment links, per-message delivery-status chip.
- **Composer** docked at the bottom: rich text, read-only recipient line, attachments, template selector from `correspondence_templates` with token substitution, Preview dialog, Send, Save Draft, character count, Internal/External toggle (hidden on entity-facing-only threads).
- **Header controls**: thread status management with SLA timer on Pending Response, Close (with justification when SLA open), Export thread.
- **Tabs inside the thread**: Conversation · Automated Message Log (read-only system messages pulled from the notification dispatch log for the thread and its linked case) · Attachments.
- **New Thread modal**: thread type, linked case typeahead (applications, complaints, returns, enforcement, inspections, licences), recipient selector (entity for external, user for internal), subject, initial body, attachments.
- **Thread export**: client-side PDF of all messages + metadata + attachment manifest, gated through the existing authorized-export helper, audit `THREAD_EXPORTED`.

The existing Inbox / Records / Dashboard / Routing Rules screens stay as they are (intake-side views) and keep working; the new manager is added as the Communication Threads screen the FRD describes and becomes the target of the "Communications" tab deep-links.

### 4. Case workbench integration
A reusable `CaseCommunicationsTab` that lists/creates threads filtered to `source_type` + `source_id`, mounted on the application, complaint and return detail pages (behind the existing permission gates). Notification deep-links open `/correspondence/threads?thread=<id>`.

### 5. Licensee portal
`MyCorrespondence` gains the same conversation view for entity-facing threads: unread badges, read receipts on open, reply composer (external only), thread status and response due date. Internal messages remain invisible.

### 6. Notifications
Reuse `dispatchNotificationEvent`; add `correspondence.message_sent`, `correspondence.reply_received`, `correspondence.thread_sla_breach`, `correspondence.delivery_failed` event configs so entity/officer/supervisor notifications fire as the FRD specifies.

## Out of scope
No changes to complaints, returns, workflow, notifications engine or `send-correspondence` behaviour beyond additive event configs. Escalation Manager (NOT-ESC-001) is a separate screen and not touched here.

## Technical notes
- Migration is purely additive with backfill, so current Inbox/Records/Detail/portal screens continue to work during and after the change.
- Delivery status is populated from `correspondence_dispatches` status on send; "Opened" only when tracking is available, otherwise the chip shows Sent/Delivered.
- Thread list paginated at 25 with server-side filters, matching module convention.
