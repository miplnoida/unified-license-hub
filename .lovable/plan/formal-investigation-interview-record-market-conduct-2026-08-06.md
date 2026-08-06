# Formal Investigation — Interview Record (Market Conduct)

Confirmed missing: the database has `conduct_investigations` and `conduct_evidence`, but no interview tables, and `/conduct/investigations/:id` currently exposes only an Overview card plus an Evidence tab. Nothing existing is removed — this adds an "Interviews" tab and its data model.

## What gets built

**Interview register per investigation**
- Add interview: interviewee name, role/designation, organisation (free text or linked licensee), contact details, interview type (in person, virtual, telephone), location or platform, date, start/end time, purpose.
- Interviewers present (multi-entry: internal staff plus external observers/legal representatives).
- Status lifecycle: `scheduled` → `conducted` → `recorded` (record finalised) → `cancelled`.

**Interview content record**
- Key information obtained (long-form notes), questions/topics covered, admissions or denials noted, follow-up actions required.
- Notes are editable while the record is draft; once finalised the record locks and any later change requires a justification captured as a revision entry.

**Attestation: signature or refusal**
- Outcome captured explicitly: signed, refused to sign (with mandatory refusal reason), or not required.
- Signature capture: typed attestation name plus date/time and captured-by user, or an uploaded signed-copy file. Refusal records who witnessed the refusal.
- Finalising a record with outcome "signed" requires either the attestation name or an uploaded signed document; refusal requires a reason of at least 10 characters.

**Documents produced during the interview**
- Per-interview attachments (documents handed over, exhibits, transcripts, recording files) uploaded through the existing secure upload path, listed with uploader, size, timestamp, and an optional "produced by interviewee" flag plus exhibit reference.
- Attachments can also be promoted into the investigation's existing evidence repository so nothing bypasses the evidence trail.

**Audit and notifications**
- Every create/update/finalise/cancel/attachment action written to the compliance audit log with reason where applicable; interview history viewable via the existing History drawer.
- Notification events registered for interview scheduled / record finalised / signature refused so investigators and supervisors are informed through existing channels.

**Where it appears**
- New "Interviews" tab in the investigation workspace (`/conduct/investigations/:id`) beside Evidence, with a summary count.
- Investigation overview shows interview totals (conducted, pending signature, refusals).

## Technical approach

- Migration creating `conduct_interviews`, `conduct_interview_participants`, and `conduct_interview_attachments`, each with `GRANT` statements for `authenticated` and `service_role`, RLS enabled, and policies mirroring the existing `conduct_investigations` pattern (`is_super_admin` OR `has_scoped_permission(..., 'market_conduct_investigation', 'view' / 'access_investigation_workspace', ...)` resolved through the parent investigation's licensee/sector).
- `updated_at` triggers reuse the existing conduct touch function.
- A `SECURITY DEFINER` RPC finalises an interview record: validates attestation/refusal rules, stamps `finalised_by`/`finalised_at`, and writes the audit row atomically. A second RPC records post-finalisation amendments with mandatory justification.
- Frontend: `useConductInterviews` hook following the `useMarketConduct` query/mutation style, `InterviewsPanel.tsx` (list + status badges + SLA-free simple table), `InterviewRecordDialog.tsx` (create/edit/finalise form), and `InterviewAttachmentsPanel.tsx` reusing `validateFile` and the same storage bucket as conduct evidence.
- Buttons carry `data-rbac="market_conduct.edit"` consistent with the existing workspace controls.
- Notification event configs seeded idempotently, matching the existing conduct event seeding style.

## Verification before claiming done

- pgTAP assertions for table/column/RLS/GRANT presence and behavioural checks on the finalise RPC (refusal without reason rejected, signed without attestation rejected, finalised record immutable without justification).
- `bunx tsgo --noEmit` type check.
- Browser walkthrough on a real investigation: create a scheduled interview, mark conducted, add notes and participants, upload an attachment, finalise with refusal (blocked without reason, then accepted), confirm audit entries appear in the history drawer and the tab reloads correctly.
