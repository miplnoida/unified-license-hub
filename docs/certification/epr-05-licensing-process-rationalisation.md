# EPR-05 — P03 Licensing & Authorisation Process Rationalisation

**Status: implemented.** Licensing now runs on one server-owned spine.

## 1. Target spine

```text
Initiation → Submission → Intake → Sufficiency → Review → RFI → Decision → Authorisation → History
```

Stage keys derived by the server: `PREPARATION`, `SUBMITTED_INTAKE`, `SUFFICIENCY_REVIEW`,
`AWAITING_APPLICANT`, `REGULATORY_REVIEW`, `DECISION`, `AUTHORISATION`, `CLOSED`.

## 2. Server read models (canonical)

| Object | Source |
|---|---|
| Case state | `public.v_application_case_state` (security_invoker) — stage, status, owner, priority + source, SLA due/state, waiting-on, sufficiency, open RFIs, workflow step, licence outcome, canonical href |
| Work queue | `public.application_work_queue(...)` — server filtering, server sort, server paging (`total_count`), header-contract columns, blockers, next action |
| Queue KPIs | `public.application_work_queue_counts(...)` — same filtered source as the rows |
| Single case | `public.application_case(_application_id, _audience)` — header + workflow + sufficiency + RFIs + forms package + payments + licence + (internal only) blockers, decision gates, F&P gate, decision evidence |
| Facts / rules | `application_blockers`, `application_next_action`, `application_fp_gate`, `application_open_rfi_count`, `application_rfi_pauses_sla`, `licensing_default_sla_hours`, `app_actor_display_name`, `app_applicant_org_name` |

Applicant callers receive only the applicant-safe subset from `application_case`; RLS on the
underlying tables still applies (the view and the case function are `SECURITY INVOKER`).

## 3. Client semantics retired

`ApplicationQueue.tsx` previously computed SLA age (15-day fallback), effective priority,
on-hold state and sorting in the browser over a 500-row capped fetch. That logic is gone:

- rows and KPI counts come from the same server-filtered source;
- priority, priority reason/source, SLA due/state, waiting-on, blockers and next action are read, never derived;
- filters are deep-linkable query params (`tab`, `sla`, `priority`, `owner`, `sector`, `sort`, `q`, `page`);
- paging is server-side, 25 rows per page, total from `total_count`.

## 4. Case workspace

- `ApplicationCaseHeader` renders the standard case header contract from `application_case`.
- The former "Workflow" tab is now **Current Step** and is the only lifecycle controller;
  `ApplicationCurrentStepSummary` states the stage, next required action, outstanding
  prerequisites (with `?from=current` detour links), sufficiency, open RFIs and decision gates.
- Governed transitions remain in `WorkflowPanel` / `ConfigurableDecisionActions` /
  `perform-workflow-action`; no free-choice status control was introduced.

## 5. Verification

- `application_work_queue` / `_counts`: stage tabs, SLA and priority buckets, unassigned count,
  server paging and search verified against the certification dataset (`CERT-APP-*`).
- `application_case`: verified in the live workspace for `CERT-APP-25` — header, stage,
  breached SLA, F&P blocker ("1 pending, 0 adverse"), sufficiency `sufficient`, decision gates clear.
- Queue and case workspace agree on stage, priority, SLA state, blockers and next action
  (both read `v_application_case_state`).
