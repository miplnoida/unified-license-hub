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

---

## 6. Final convergence run (EPR-05 certification, in progress)

**EPR-05 COMPLETE = NO.** Server-authority gates pass; the live end-to-end regulatory
journeys (happy path, RFI, RBAC personas, licence handoff) are not yet executed.

### 6.1 Defects found and fixed this run

| # | Defect | Fix |
|---|---|---|
| 1 | `application_resolve_form_set` required a full sector+sub-sector+category triple, so sector- and sub-sector-level applicability could never resolve | Ladder now starts at the deepest known level (category → sub-sector → sector) |
| 2 | Resolver only considered `pre_license`/`application` templates, so post-licence application forms never resolved | `form_type` filter now follows the requested application category |
| 3 | `application_fp_gate` inferred assessments from `applications.entity_id` (i.e. "the entity's assessments"), never an explicit assessment linkage | New `public.application_fp_links` (application ↔ `fp_assessments.id`, `is_required`, role note). When explicit links exist they are the *only* assessments evaluated; otherwise the gate reports `linkage = entity_inferred` |
| 4 | `decision_gate_status` (the canonical gate source consumed by `perform-workflow-action`) had no F&P gate | F&P added as a **blocking** gate, carrying the full gate evidence payload |
| 5 | `authenticated` held INSERT/UPDATE/DELETE on `public.licenses` and `public.application_form_requirements` | Revoked; both are written only by governed server routines (no client writes existed) |
| 6 | No invariant preventing a second licence for one application | `uq_licenses_application` unique index on `licenses(application_id)` |

### 6.2 Evidence

**Form applicability (gates 1, 4, 16)** — `application_resolve_form_set`:

| Case | Result |
|---|---|
| Category-level (Commercial Bank) | `resolved=true, source=template_taxonomy, scope=category`, published version pinned |
| Sub-sector-level (Approval of MLRO, post-licence) | `resolved=true, scope=sub_sector` |
| Sector-level | no sector-only template configured in the certification dataset — **N/A (no configuration)** |
| NEG unknown sector | `NO_APPLICABLE_FORMS` |
| NEG wrong regulator | `NO_APPLICABLE_FORMS` |
| NEG wrong application category (`pre_license` against a post-licence form) | `NO_APPLICABLE_FORMS` |
| NEG no taxonomy at all | `INCOMPLETE_TAXONOMY` |

The browser cannot inject a form set: `ApplicationDetail` no longer contains
`resolveMatchedTemplateIds`, `NewApplication` renders the RPC payload, and the pinned
requirement rows are no longer writable by `authenticated`.

**F&P explicit linkage (gate 9, central negative test)** — `CERT-APP-02` belongs to entity
`f40bdb14…`, which owns assessment A (`3247a516…`) for Marcella Duncan. Assessment B
(`8586464d…`, still `submitted`) is explicitly linked to the application. Result:

```text
linkage = explicit
linked  = [ 8586464d… (Proposed Director, stage submitted, licensing_blocker true) ]
pending = 1, adverse = 0, blocking = true
```

A is **not** substituted. `CERT-APP-25` behaves identically with its own explicit link.
Note: a favourable determination could not be seeded on A because
`fp_check_determination_finalize()` enforces committee quorum — governance correctly refused
the shortcut, which is itself evidence for F&P determination authority.

**Decision gates (gates 10, 11)** — `decision_gate_status('CERT-APP-25')` returns
`ready=false, blocking_unmet=1` with gates `sufficiency_blockers` (passed),
`open_rfis` (passed), `fit_and_proper` (**failed**, "1 pending, 0 adverse (explicit linkage)")
and advisory `payment`. `perform-workflow-action` refuses final approval with
`DECISION_GATES_UNMET` from this same function (`supabase/functions/perform-workflow-action/index.ts:205`),
so the F&P block is now server-enforced, not merely hidden in the UI.

**Queue parity (gate 18)** — `application_work_queue` rows vs `total_count`:
all filters `2/2` (open), `2/2` (breached SLA), `1/1` (unassigned), `1/1` (search `CERT-APP-25`).
`application_work_queue_counts` reconciles: `total_open 2`, `under_review 2`, `breached 2`,
`unassigned 1`, `by_stage REGULATORY_REVIEW 2`, `by_priority critical 2`, `closed 25`.

**External contract (gate 7)** — `application_case(id,'external')` contains none of
`owner_user_id`, `owner_name`, `team`, `priority`, `priority_reason`, `sla_due_at`,
`sla_state`, `blockers`, `decision_gates`, `fit_and_proper`. The only lifecycle object present
is `workflow` (step id/name/order only — no comments or deliberation).

**Direct browser DML (gate 13)** — `authenticated`/`anon` privileges:
`applications` SELECT only; `approval_actions`, `approval_step_actions`, `decision_artifacts`
SELECT only; `licenses` and `application_form_requirements` reduced to SELECT this run.
Authoritative browser DML = **0**.

**Duplicate licence issuance (gate 14)** — `licenses` with `application_id`: 23 rows / 23
distinct applications; `uq_licenses_application` now makes a second issuance impossible at the
database level (not client button state). The live re-invoke test is still outstanding.

**Guardrails (gate 27)** — `src/test/epr05LicensingGuardrails.test.ts` (5 tests, passing) blocks
reintroduction of `SLA_TARGET_DAYS`, client effective-priority, capped operational queue fetch,
client form applicability, licence/approval/regulatory-column DML and locally recomputed gates.

### 6.3 Outstanding before EPR-05 closure

These require driving real regulatory transactions as authenticated personas and were not
executed in this run:

- gate 5 real sufficiency progression (insufficient + warning-only cases)
- gates 6 / 26 real RFI journey (waiting-on and SLA pause/resume across issue → response → closure)
- gate 8 external ownership isolation probes as two applicants
- gates 14 / 25 live happy path through governed approval to licence issuance, plus the re-invoke idempotency probe
- gates 20 / 21 maker–checker and the ten-persona RBAC matrix
- gate 17 decision attempt with an outstanding required fee (currently configured advisory)
- gate 3 publish-a-newer-version-after-submission probe (code path reads pinned `form_version_ids`; not yet proven live)
