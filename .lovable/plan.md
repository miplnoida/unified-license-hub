## Goal
Close the "Licensing Appeals" gap. Today only Fit & Proper has appeals (`fp_appeals` + `/fpa/appeals` register + `FpAppealsPanel`). Verified: no licensing appeal table exists in the database (only `fp_appeals`), no appeal UI or route exists outside Fit & Proper, and `license_management` / `application_management` have no appeal-related permission actions.

## What gets built

### 1. Data model (new tables, does not touch existing ones)
- `license_appeals` — one appeal per refused application/licence action:
  - links: `application_id`, optional `license_id`, `licensee_id`
  - `appeal_reference` (auto `APL-YYYY-NNNNNN`), `grounds`, `relief_sought`, `supporting_docs` (jsonb)
  - lifecycle: `status` (`submitted` → `under_review` → `panel_review` → `decided` / `withdrawn` / `rejected_out_of_time`)
  - panel: `panel_id`, `assigned_to`, `hearing_date`
  - outcome: `decision` (`upheld`, `partially_upheld`, `dismissed`, `remitted`, `overturned_to_approved`), `decision_rationale`, `decided_at`, `decided_by`
  - deadline: `appeal_deadline` (refusal date + configurable window, default 30 days), `filed_at`
- `license_appeal_panels` + `license_appeal_panel_members` — regulator-side appeal panel register (mirrors `fp_committees`).
- `license_appeal_events` — human-readable history (filed, acknowledged, panel assigned, hearing scheduled, decided).
- GRANTs + RLS on all new tables: applicant sees only their own appeals; internal staff gated by `has_permission('license_appeals', <action>)` plus existing entity/sector scoping helpers; `service_role` full.
- Validation trigger (not a CHECK): appeal only allowed against an application whose status is `rejected`, only within the deadline, and only one open appeal per application.

### 2. Permissions
New permission module `license_appeals` with actions: `view`, `create`, `edit`, `assign_panel`, `decide`, `manage_config`, `view_all_entities`. Seeded onto `super_admin`/`admin` by default; other roles configurable in Role Management. No changes to existing modules' actions.

### 3. Applicant experience
- On the application detail page, when the application status is `rejected` and within the appeal window, show an "Appeal this decision" card with the deadline countdown and a lodge-appeal dialog (grounds, relief sought, document upload via the existing upload component).
- After lodging: a read-only "Appeal" card showing reference, status stepper (Filed → Under review → Panel → Decision), and outcome once decided.
- New applicant page `/appeals` listing their appeals with status.

### 4. Regulator experience
- New register page `/admin/license-appeals`: stat cards (Filed, Under review, Panel review, Decided, Overdue), filters by status/decision/sector, searchable table, row expansion with grounds, documents, timeline.
- Actions (permission-gated): acknowledge, assign panel + hearing date, record decision with mandatory rationale, withdraw/reject-out-of-time.
- Panel configuration screen under Admin for `license_appeal_panels` and members.
- Every action writes to `license_appeal_events` and the existing audit log.

### 5. Notifications
Reuse the existing dispatcher: seed `notification_event_configs` entries for `license_appeal.filed` (to regulator), `license_appeal.acknowledged`, `license_appeal.panel_assigned`, `license_appeal.decided` (to applicant), each with in-app + email channels. No changes to dispatch logic.

## Navigation
Add "Appeals" under the Licensing group in `src/config/navigation.tsx`, module-gated to `license_appeals`; applicant portal gets an "Appeals" item. Fit & Proper's existing Appeals entry is untouched.

## Technical notes
- Migrations run first (tables → GRANTs → RLS → policies → triggers → permission seed); code changes follow after types regenerate.
- New files only for the appeals UI (`src/pages/appeals/*`, `src/components/appeals/*`, `src/hooks/useLicenseAppeals.ts`); the only edits to existing files are the navigation config, route registration, and an additive appeal card block in `ApplicationDetail.tsx`.
- No change to application/licence workflow, statuses, or any Fit & Proper behaviour. An "overturned_to_approved" decision records the outcome and raises a task/notification — it does not silently mutate the application state.

## Out of scope
Automatic re-opening of the original application, appeal fees, and external tribunal integration.
