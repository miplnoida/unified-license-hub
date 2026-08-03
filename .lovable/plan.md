## What already exists (verified in code and database)

- Tables: `correspondence_threads` (with `thread_type`, `thread_state`, `source_type/source_id/source_reference`, `last_message_at`, `pending_since`, `response_due_at`, `close_justification`, `is_entity_facing`), `correspondence_messages` (`message_kind`, `delivery_status`, `is_internal_note`, `is_draft`), `correspondence_thread_participants` (with `last_read_at`), `correspondence_attachments`, `correspondence_events`, `correspondence_templates`, `correspondence_routing_rules`, `correspondence_dispatches`.
- RPCs: `create_correspondence_thread`, `post_correspondence_message`, `set_correspondence_thread_state`, `mark_correspondence_thread_read`, `record_correspondence_delivery`, `add_correspondence_attachment`, `close_correspondence`, `log_correspondence_export`, plus RLS helper `correspondence_thread_visible`.
- UI: `/correspondence/manager` (ThreadList + ThreadDetail), `/correspondence/:id`, entity `My Correspondence`, `IntakeForm`, `MessageThreadPanel`, `ResponseComposer`, `AttachmentsPanel`, `AuditTrailPanel`, PDF/print export, and Notification Centre "Forward to Colleague" (`notification_forward`) already creating internal threads.
- Notification events exist for `correspondence.reply_received` and `correspondence.response_sent`; `send-correspondence` edge function handles email dispatch.

## Confirmed gaps against NOT-THR-001

1. Thread list lacks: module column, case reference, parties, last message preview, unread count, direction, assigned officer/team; filters limited to type/state (no status, module, direction, unread, assignee); search does not cover entity name or participant.
2. No unread-count source — `last_read_at` exists but nothing aggregates unread messages per thread.
3. Composer: plain textarea only (no controlled formatting), no "link authorised case document" picker, template selection only in the separate Response Composer, no preview in the inline composer, internal/external toggle not gated by thread type.
4. New thread: source is a free-text reference, not a validated linked case; recipient selection is free text, not RBAC/assignment-aware.
5. Lifecycle: no explicit "mark pending response" action with SLA start in the UI; reopen is not permission-gated; closed threads are not hard-locked against new messages at the database level.
6. Notifications: no events for internal colleague added/messaged, thread awaiting response, SLA near breach, SLA breached; no cron sweep for correspondence SLA.
7. Audit action vocabulary is not the FRD set (`THREAD_CREATED`, `MESSAGE_DRAFT_SAVED`, `MESSAGE_SENT`, `MESSAGE_DELIVERY_CONFIRMED`, `MESSAGE_DELIVERY_FAILED`, `THREAD_STATUS_CHANGED`, `THREAD_CLOSED`, `THREAD_EXPORTED`).
8. No case-screen integration: no Communications tab on application, complaint, return, enforcement, inspection or licensee detail screens.
9. RBAC: routes are gated on `settings`, not on the existing `correspondence_management` module; export/reopen/internal-post actions are ungated.
10. No pgTAP tests for correspondence RLS, internal-message leakage, or export scope.

## Implementation plan

### Phase 1 — Schema and data model (migration A)
- Add to `correspondence_threads`: `module text` (derived/normalised: licensing, complaints, returns, enforcement, inspections, conduct, general), `assigned_team text`, `sla_hours int`, `sla_breached_at timestamptz`, `sla_warned_at timestamptz`, `last_message_preview text`, `last_message_kind text`, `reopened_count int`, `closed_by uuid`.
- Add to `correspondence_messages`: `linked_document_ids uuid[]`, `body_format text` ('plain' | 'rich'), `sent_by_system boolean`.
- Add `correspondence_thread_participants.is_internal boolean` and `unread_count` derivation via a view/function `correspondence_thread_unread(_user_id)`.
- Backfill `module` from existing `source_type`/`category`; keep existing columns untouched for compatibility.
- Trigger: block INSERT/UPDATE of messages on a `closed` thread unless the actor holds `correspondence_management.approve`; block editing of any non-draft message (immutability).
- Normalise `correspondence_events.action` values to the FRD vocabulary, with a mapping of legacy values retained for history.

### Phase 2 — RPCs and RLS (migration B)
- `correspondence_thread_feed(_filters jsonb, _limit, _offset)` — single SECURITY DEFINER read returning list rows with parties, preview, unread count, assignee, module, direction, SLA state; enforces `correspondence_thread_visible` plus record-assignment checks and case-level access (`can_read_application`, `can_read_complaint`, `can_view_entity_returns`, `can_read_enforcement`).
- `correspondence_thread_link_case(_thread_id, _module, _source_type, _source_id)` — validates the caller may read that case before linking.
- `correspondence_set_pending_response(_thread_id, _due_at)` — starts the SLA clock, writes `THREAD_STATUS_CHANGED`.
- `correspondence_reopen_thread(_thread_id, _reason)` — permission-gated reopen, increments `reopened_count`.
- `correspondence_export_manifest(_thread_id)` — returns only messages/attachments the caller may see and logs `THREAD_EXPORTED`; export UI must consume this instead of local state.
- `correspondence_link_documents(_message_id, _document_ids)` — verifies each document is readable by the caller and belongs to the linked case.
- Tighten message insert policy so external users can never set `is_internal_note = true`.

### Phase 3 — SLA + notification integration (migration C + edge function)
- New notification events, seeded into `notification_event_configs` with templates: `correspondence.message_sent_external`, `correspondence.external_response_received`, `correspondence.internal_participant_added`, `correspondence.awaiting_response`, `correspondence.sla_near_breach` (high), `correspondence.sla_breached` (critical).
- `correspondence_sla_sweep()` SQL function + `pg_cron` job (hourly) marking near-breach (80% of window) and breach, dispatching via the existing notification pipeline.
- `record_correspondence_delivery` extended to emit `MESSAGE_DELIVERY_CONFIRMED` / `MESSAGE_DELIVERY_FAILED` audit rows and a failure notification.
- Keep `notification_forward` as the Notification Centre entry point, but route its result to the new thread detail deep link.

### Phase 4 — Frontend: unified thread list and detail
- Rewrite `ThreadList` to a full data table/list with all FRD columns, unread badge, direction and module chips, assignee, last-message preview and relative activity; wire `useCorrespondenceThreadFeed` to the new RPC with keyset paging.
- Filter bar: status, module, direction, unread-only, assigned user/team (visible only when permitted), thread type; search across title, entity, case reference and participant.
- `ThreadDetail`: message list showing sender name, role, timestamp, direction, body, attachments, delivery status, internal/external marker, system-generated badge; participants panel with read receipts; SLA banner; lifecycle actions (Mark pending response, Close, Reopen, Export) each gated with `data-rbac`.
- Composer (`ThreadComposer`, replacing the split MessageThreadPanel/ResponseComposer duplication): controlled rich formatting (bold/italic/lists via a sanitised subset), attachments, case-document picker, template select with token preview, Preview / Send / Save Draft, internal-external radio shown only for thread types that permit both, participants fixed after creation.
- New Thread dialog: thread type first, mandatory case picker (searchable, RBAC-filtered) for regulatory types, recipient selection from authorised entity users/internal colleagues, internal-only enforcement for `internal_discussion`.

### Phase 5 — Case-screen integration
- Shared `<CaseCommunicationsTab module source_type source_id source_reference licensee_id />` rendering the filtered thread list plus inline detail and "New thread" prefilled with the case link.
- Embed in: application detail, complaint detail, return detail, enforcement case, inspection detail, licensee detail, and the applicant/licensee portal equivalents (read-only where appropriate).
- Replace the RFI ad-hoc messaging entry point with a thread of type `rfi_response` linked to the RFI record, preserving existing RFI data by linking rather than migrating.

### Phase 6 — RBAC, routes, tests
- Re-point `/correspondence/*` routes and navigation from `settings` to `correspondence_management`; add `manage_threads`, `send_external`, `post_internal`, `export`, `reopen` actions to the RBAC catalog and grant to appropriate role templates.
- pgTAP suite `supabase/tests/rbac/300_correspondence_threads.sql` proving: cross-entity thread isolation; internal messages invisible to external users; case-assignment restriction; attachment access follows document rules; deep-link protection; export manifest excludes unauthorised content; closed-thread immutability without permission.
- Run the security linter and typecheck; report results.

## Technical notes and risks

- `correspondence_threads` already carries legacy lifecycle (`status`, `received_at`, routing rules). The plan keeps both models: `status` remains the intake workflow, `thread_state` remains the FRD status. Risk of confusion in reporting — the new feed exposes `thread_state` as the single FRD "status" and maps legacy values.
- Two overloads each exist for `create_correspondence_thread` and `post_correspondence_message`; the older overloads will be dropped only after call-site verification to avoid breaking `notification_forward` and complaint correspondence.
- `correspondence_thread_participants` policies currently target `public` role — they will be re-scoped to `authenticated`.
- Backfilling `module` on existing rows is heuristic where `source_type` is null; those rows default to `general`.
- Audit action renaming touches historical rows; legacy values are preserved and mapped in the UI rather than rewritten in place.
