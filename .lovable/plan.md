## What's wrong today

Verified against the live data and code:

- **History and "Actions taken" are always empty.** The tracking function builds both only from `approval_actions` linked to the complaint's workflow instance. Every complaint in the database has a workflow instance but **zero approval action rows**, so both sections render "No history recorded yet." The real activity lives in `audit_logs` (events like complaint created, licensee linked, investigation started, task created/completed, severity set, escalated, resolved, closed) — which the tracking function never reads.
- **Investigation section is hidden most of the time.** It only renders when tasks exist or an investigator is assigned; complaints under review with neither show nothing at all, so users think the page is broken.
- **Progress steps** come from workflow steps only; when a step has no public label the raw internal name shows.
- **UI**: the lookup card with a full-width "Track complaint" button stays on screen even when a complaint is already loaded, dominating the page; the "Back to complaints" button in the header is oversized; labels are internal-sounding (status codes, "intake source", step keys).

## What to build

### 1. Backend — make the tracking function return real activity

Extend `public.get_public_complaint_tracking`:

- **History**: build the timeline from `audit_logs` for the complaint (plus the workflow actions, merged and sorted by time). Map each audit action through a plain-English whitelist, e.g.
  - `complaint_created` / `complaint.created` → "Complaint received"
  - `licensee_linked` → "Matched to the firm concerned"
  - `complaint.investigation_started` / `complaint_under_investigation` → "Review started"
  - `complaint.task_created` / `task_in_progress` / `task_completed` → "Review activity progressed"
  - `complaint.severity_set`, `complaint_triage_retry`, `RULE_OVERRIDE` → "Complaint assessed"
  - `complaint.escalated_to_enforcement` → "Referred for enforcement"
  - `complaint.resolved` → "Resolution reached"; `complaint_closed` → "Complaint closed"
  - anything not on the whitelist (internal notes, correspondence internals, assignment changes) is **excluded**, so nothing internal leaks.
  - No actor names, no internal remarks in the public/complainant view.
- **Actions taken**: same source, filtered to decision-type events (investigation started, referred, resolved, closed, not accepted) so the section is meaningful rather than duplicating history.
- **Investigation**: always return a block with a plain status ("Not yet started" / "In progress" / "Completed") derived from complaint status, tasks and investigator, plus the task counts and any published findings/outcome, so the section can always render.
- **Steps**: fall back to a readable, title-cased label when neither `public_label` nor `name` is friendly.

### 2. Frontend — `ComplaintTrackingView.tsx`

- **Lookup card**: collapse it once a complaint is loaded — show a compact "Tracking CMP-…  · Track a different complaint" line that expands the form on click. Button becomes a normal-size (`size="sm"`) inline button, not a full-width block.
- **Status summary**: one clear headline card — big status label, one-sentence explanation of what it means and what happens next, plus the four dates as a simple row.
- **Progress**: replace the chip row with a vertical numbered stepper (done / in progress / upcoming) with a short caption per step — easier for non-technical users than pills.
- **Actions taken** and **History**: always visible; each entry is a plain sentence plus a friendly date (`27 Jul 2026, 3:40 pm`). Empty state gives a reassuring message ("Nothing further recorded yet — you'll see updates here as your complaint moves along.") instead of a bare "No history".
- **Investigation**: always rendered, with the plain status, a simple "3 of 5 review activities completed" line and findings/outcome when published.
- **Correspondence**: unchanged, shown only to the complainant.
- Section headings reworded for non-technical readers; internal jargon (intake source, step keys, status codes) removed.

### 3. Page chrome — `ComplaintTracking.tsx`

- Shrink the "Back to complaints" action to a small ghost link in the header, matching other detail pages.
- Keep the public `/track/complaint` page on the same component, unchanged in behaviour.

## Technical notes

- One migration replacing `get_public_complaint_tracking`; return shape stays backwards-compatible (same keys), with `investigation.status_label` and richer `timeline` entries added.
- Audit rows are read inside the SECURITY DEFINER function and filtered through the whitelist before returning — the raw `audit_logs` table stays inaccessible to external users.
- Date formatting helper added in the view; no new dependencies.
