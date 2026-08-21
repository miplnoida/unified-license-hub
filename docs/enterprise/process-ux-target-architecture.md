# Process UX Target Architecture

**Mode:** discovery only. This is the standard to build against later.

## 1. The five-surface process pattern

```text
PROCESS DASHBOARD   portfolio health, volumes, SLA breaches, ageing   (read model only)
        ↓
WORK QUEUE          server-filtered, server-counted, next-action bearing
        ↓
CASE WORKSPACE      one case, standard header + standard tabs
        ↓
CURRENT STEP        the ONLY place a stage advances (Examination pattern)
        ↓
DECISION / OUTCOME  governed transition + rationale + artifact
        ↓
HISTORY             immutable timeline, decisions, communications, audit
```

Rules:
- A process dashboard never mutates.
- A queue never mutates business state beyond assignment/claim.
- A case workspace mutates only through the current step or a panel-local save.
- No screen offers a free-choice status control.

## 2. Standard case header contract

Server-supplied (one RPC per domain, same shape):

| Field | Notes |
|---|---|
| `reference` | human case reference, never a UUID |
| `subject` | Entity/individual name + canonical entity link |
| `stage` | current stage key + label |
| `status` | current status within the stage |
| `owner` / `team` | assigned user and team |
| `priority` | from server triage rules |
| `sla_due_at` / `sla_state` | `on_track` \| `due_soon` \| `breached` \| `paused` |
| `waiting_on` | `regulator` \| `entity` \| `third_party` \| `system` |
| `next_action` | label + target href + permission key |
| `blockers[]` | mandatory prerequisites for the next action |

The UI renders this; it never computes it. This retires the client-side SLA, priority and
eligibility sites listed in `screen-data-source-audit.md` §4.

## 3. Standard supporting tabs

`Overview · Current Step · Evidence · Communications · Related Cases · Decision · History`

- `Current Step` is the sole lifecycle controller (`mode: 'current-step'`).
- All other tabs are `mode: 'supporting'` — local actions only.
- Blocker "Resolve" links open a supporting tab with `?from=current`, show a detour banner
  and a "Return to current step" action (already proven in Examination).

## 4. My Work model (read-only, cross-domain)

A **view/RPC over existing source-of-truth tables**. It must not store business state, must
not be writable, and must be RLS-scoped to the caller.

```sql
-- proposal only
create or replace function public.my_work(
  _limit int default 200,
  _domains text[] default null
) returns table (
  domain            text,   -- applications | fp | returns | prudential | conduct
                            -- | examinations | enforcement | approvals | correspondence
  object_type       text,
  object_id         uuid,
  reference         text,
  title             text,
  subject_entity_id uuid,
  subject_name      text,
  stage             text,
  status            text,
  assigned_user_id  uuid,
  assigned_team     text,
  priority          text,
  sla_due_at        timestamptz,
  sla_state         text,
  waiting_on        text,
  blockers          jsonb,
  next_action       jsonb,   -- { label, href, permission }
  canonical_href    text,
  last_activity_at  timestamptz
) language sql stable security invoker;
```

Source mapping (union of existing tables/read models — no new state):

| Domain | Source |
|---|---|
| Applications | `applications` + `approval_steps` / `approval_actions` |
| F&P | F&P assessment tables + manual tasks + committee items |
| Returns | `return_filings` + `return_filing_versions` + `reporting_periods` |
| Prudential | `v_prudential_current_breaches`, prudential actions/escalations |
| Conduct | `conduct_alerts`, `conduct_investigations`, `complaints` |
| Examinations | `examinations` + `examination_findings` + data requests |
| Enforcement | `enforcement_actions` / `enforcement_obligations` |
| Approvals | `approval_steps` awaiting the caller's role |
| Correspondence | `correspondence_threads` + `application_rfis` / `complaint_rfis` |

Surface: one `/my-work` page (grouped by domain, sortable by SLA state) plus a header
counter. Every row links to `canonical_href` from the route register.

## 5. Queue contract

Every operational queue must:
1. read rows and KPI counts from the **same** server-side filtered source;
2. expose the header contract columns (subject, reference, stage, status, owner/team,
   priority, SLA, waiting-on, blocker, last activity, next action);
3. support server-side paging — never derive a total from a capped page;
4. keep filters in query params (deep-linkable), per `docs/13_ROUTE_STANDARD.md`.

## 6. Sequenced adoption (proposal)

1. **P06 Returns** — collapse to one spine, retire legacy reads, first standard header +
   current-step implementation.
2. **P07 Prudential** — repoint onto canonical returns truth and the read models.
3. **P11 Enforcement** — generic `source_kind` lifecycle, decoupled from complaints.
4. **P05 Fit & Proper** — introduce the Assessment Case workspace, bind all sub-screens to
   `assessment_id`.
5. **P03 Licensing** + **P08 Conduct** — current-step panels.
6. **My Work** last, once each domain exposes a header contract to aggregate.
