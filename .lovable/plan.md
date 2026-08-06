# Formal Investigation — Closure & Discontinuation (Market Conduct)

## Current state (verified)

- `conduct_investigations` has only `status`, `outcome`, `closure_reason`, `closed_by`, `closed_at`. There is no discontinuation path, no closure report, no approval gate, no enforcement referral link, and no post-closure monitoring record.
- `/conduct/investigations/:id` closes a case with a single SweetAlert asking for a 10-character outcome, applied by a direct table update from the client (`useUpdateInvestigation`). No supervisory review, no documentation artefact.
- Notification events exist only for `conduct_investigation_opened/assigned/closed`. Nothing for discontinuation, closure requests, or monitoring activation.
- Interviews, evidence, and supervisory actions already exist and stay untouched.

## What gets built

**1. Closure determination record**
- A versioned closure record per investigation capturing: determination type (`closure_with_enforcement`, `closure_no_further_action`, `discontinuation`), summary of findings, breaches substantiated (with regulatory provisions), evidence relied upon, rationale, and recommended next steps.
- Discontinuation requires a discontinuation ground (insufficient evidence, no breach found, matter resolved by entity, duplicate of another case, out of jurisdiction, entity ceased operations, other + free text) plus a justification.
- Closure with enforcement requires a linked or newly created enforcement referral.

**2. Closure approval gate**
- Lifecycle: `draft` → `pending_approval` → `approved` / `rejected`. Only after approval does the investigation move to `closed` or `discontinued`.
- Investigator submits; a supervisor with the conduct manage permission approves or rejects with a mandatory reason. Rejection returns the record to draft with the reason visible.
- Readiness check surfaced in the UI before submission: unfinalised interviews, evidence items without classification, open supervisory actions, and missing enforcement link for enforcement-track closures. Blocking items can be overridden only with a recorded justification.
- Direct status jumps to `closed` from the status selector are removed and routed through this gate; existing statuses keep working, with `discontinued` added.

**3. Enforcement referral**
- On enforcement-track closure, create an `enforcement_actions` case pre-populated from the investigation (entity, allegation, findings, evidence references) or link an existing case, recorded on the closure record and in `enforcement_case_events`.

**4. Post-closure monitoring activation**
- A monitoring directive per closure: focus areas, monitoring frequency (monthly/quarterly/semi-annual), start and review-end dates, owner, thresholds/indicators to watch, and required entity reporting.
- Directive becomes active on closure approval, appears on the entity conduct profile, and generates a scheduled review task; overdue reviews raise a conduct alert through the existing alert path.

**5. Closure documentation artefact**
- Printable closure/discontinuation memorandum generated from the approved record (mirrors the thematic review report preview): header, determination, findings, breaches, evidence relied on, enforcement referral, monitoring directive, approvals with names and timestamps.
- Optional notification letter to the entity for discontinuation and no-further-action outcomes, dispatched via the existing correspondence/notification path.

**6. Audit and notifications**
- Every submit/approve/reject/override/referral/monitoring action written to the compliance audit log with justification and visible in the existing History drawer.
- New event configs (idempotent upsert): `conduct_investigation.closure_requested`, `closure_approved`, `closure_rejected`, `discontinued`, `monitoring_activated`, `monitoring_review_due`.

**Where it appears**
- New "Closure" tab in the investigation workspace beside Evidence and Interviews, plus a determination badge on the overview card.
- A supervisor closure-approval queue listing pending closure requests across investigations, reachable from conduct navigation.
- Monitoring directives listed on the conduct entity profile.

## Technical approach

- Migration adding `conduct_investigation_closures`, `conduct_closure_breaches`, `conduct_post_closure_monitoring`, and `conduct_monitoring_reviews`; each with GRANTs for `authenticated` and `service_role`, RLS enabled, and policies mirroring `conduct_investigations` (`is_super_admin` OR `has_scoped_permission(..., 'market_conduct_investigation', ...)` resolved through the parent investigation). `discontinued` added to the investigation status set with `discontinuation_ground` / `discontinued_at` columns. `updated_at` uses the existing `_touch_conduct_updated_at` trigger.
- SECURITY DEFINER RPCs, following the `thematic_*` pattern, own all state transitions: `conduct_closure_submit`, `conduct_closure_approve`, `conduct_closure_reject`, `conduct_closure_readiness`, `conduct_closure_link_enforcement`, `conduct_monitoring_directive_upsert`, `conduct_monitoring_review_record`. Each enforces permission, mandatory-reason and gate rules, writes the audit row, and enqueues notification events atomically. A guard trigger blocks direct client writes to closure state after approval.
- Frontend: `src/hooks/useInvestigationClosure.ts` (React Query wrappers), `ClosurePanel.tsx` (determination form, readiness checklist, approval actions, printable memo preview), `PostClosureMonitoringPanel.tsx`, and `ClosureApprovalQueue.tsx` page wired into `dashboardRoutes.tsx` and `navigation.tsx`. Buttons carry `data-rbac="market_conduct.edit"` / `market_conduct.approve` consistent with existing controls.
- Overdue monitoring reviews evaluated inside the existing `evaluate-conduct-monitoring` function so no new scheduler is introduced.
- No changes to interviews, evidence, actions, alerts, or thematic reviews beyond additive tab wiring.

## Verification before claiming done

- pgTAP suite `supabase/tests/conduct/02_investigation_closure.sql`: table/column/GRANT/RLS presence; discontinuation without a ground rejected; enforcement-track closure without a referral rejected; approval by a non-supervisor rejected; approved closure immutable; monitoring directive activated on approval.
- `bunx tsgo --noEmit` and the vitest suite.
- Browser walkthrough on a real investigation: draft a discontinuation (blocked without ground, then accepted), submit for approval, reject with reason, resubmit, approve as supervisor, confirm the investigation reads `discontinued`, the memo renders, the monitoring directive is active on the entity profile, and audit entries appear in the History drawer. Repeat for the enforcement track and confirm the enforcement case is created and linked.
