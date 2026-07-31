## Goal

Turn the correspondence prototype into a working, auditable two-way thread manager. Current state (verified): `src/pages/correspondence/*` all read from `seed.ts` mock arrays — nothing is persisted. The only real tables are `correspondence_templates` and `correspondence_dispatches` (outbound send log, used by `SendCorrespondenceDialog` + the `send-correspondence` edge function). There is no thread/message store.

Screen structure stays exactly as-is (Dashboard / Inbox / Records / Detail / Routing Rules) — only the data source changes.

## What gets built

**1. Database (new tables, RLS + GRANTs)**
- `correspondence_threads` — reference (`COR-YYYY-NNNNNN`), subject, category, channel, direction, priority, status (received → classified → assigned → in_review → approved → responded → closed), sender name/org, `licensee_id`, `regulator_id`, assigned unit/officer, `received_at`, `due_at`, `sla_days`, retention years/expiry, tags, summary.
- `correspondence_messages` — thread_id, direction (inbound/outbound), body, author_id, author_role, channel, sent_at, `is_internal_note` flag, `dispatch_id` link to `correspondence_dispatches` when emailed.
- `correspondence_attachments` — thread/message link, storage path, file name, size, version number, uploaded_by (versioning by file name, matching the existing VersionHistoryList UI).
- `correspondence_events` — audit trail rows (actor, role, action, detail, at) written by triggers/RPCs for create, classify, assign, review, approve, respond, close.
- `correspondence_routing_rules` — persists the Routing Rules admin screen (match type/value, unit, officer, priority, manual override, order, active).
- Private storage bucket `correspondence` with staff + owning-licensee policies.

**2. Access rules**
- Internal staff: read/write scoped by regulator, gated on the existing `correspondence_management` permission actions plus the existing route module.
- Licensee users: read threads where `licensee_id` matches their entity, may insert inbound messages and attachments on those threads only. Internal notes (`is_internal_note`) are never visible to licensees.
- All writes go through `SECURITY DEFINER` RPCs (`create_correspondence_thread`, `post_correspondence_message`, `classify_correspondence`, `assign_correspondence`, `record_correspondence_review`, `close_correspondence`) so the audit event is always written atomically with the change.

**3. Frontend — staff (same screens, real data)**
- `useCorrespondence.ts` hooks (list, detail, mutations) replacing `seedCases`.
- `IntakeForm` actually captures a thread, uploads attachments, applies the first matching routing rule, and computes `due_at` from SLA days.
- `CorrespondenceDetail`: message thread view (chronological bubbles, inbound vs outbound, internal notes marked), working Classify / Assign / Review / Respond panels, real attachment versions, real audit trail from `correspondence_events`.
- `ResponseComposer`: loads real `correspondence_templates`, renders token substitution, sends via the existing `send-correspondence` edge function, and records the sent message on the thread.
- `CorrespondenceInbox` / `CorrespondenceRecords` / `CorrespondenceDashboard`: DB-backed lists, filters, SLA/aging metrics; export uses the real row set.
- `RoutingRulesAdmin`: CRUD against the rules table.

**4. Frontend — licensee portal (new)**
- `/portal/correspondence` list + `/portal/correspondence/:id` thread view for licensee users: read the thread, reply with text + attachments, see status and due date. Registered in the licensee route/nav config alongside existing portal entries; permission-gated so it only appears for entity users.
- Replies land as inbound messages, reopen SLA tracking on the thread, and notify the assigned officer via the existing `dispatchNotificationEvent` pipeline (new `correspondence.reply_received` / `correspondence.response_sent` event configs).

**5. Migration of prototype content**
- `seed.ts` demo cases are inserted once as real rows (clearly demo-tagged) so the screens are not empty; the file is then removed from runtime imports.

## Out of scope
- Auto-ingesting a real mailbox (no inbound email webhook) — capture is manual + licensee portal replies, per your answer.
- No changes to complaints, notifications, workflow, or any other module's behaviour; `correspondence_dispatches` and `send-correspondence` are reused, not modified in a breaking way.

## Technical notes
- Every new public table gets explicit `GRANT`s plus RLS, per project convention.
- Reference numbers via a sequence + trigger, mirroring the complaints `CMP-` pattern.
- Attachment versioning: same file name on a thread increments `version` rather than overwriting.
- Queries paginated (25/page) with server-side filtering, matching the complaints module standard.
