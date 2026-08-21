# EPR-02 — P07 Prudential Process Rationalisation (certification)

## 1. Scope of the second half

The foundation (work queue, portfolio dashboard, entity state panel, engine operations
split, `CaseHeader`, `usePrudentialProcess`) was frozen. This package delivered:

| # | Item | Status |
|---|---|---|
| 1 | Assessment Case Workspace + Current step | DONE |
| 2 | Specialist queue disposition | DONE (documented below) |
| 3 | `/prudential/entities/:id` disposition | DONE — redirect to Entity 360 |
| 4 | Navigation rationalisation | DONE |
| 5 | RBAC / persona matrix | DONE (§5) |
| 6 | One real governed prudential transition | DONE — assessment lifecycle |
| 7 | Certification | this document |

## 2. Assessment Case Workspace

`/prudential/assessments/:id` is now `src/pages/prudential/AssessmentWorkspace.tsx`
(the legacy `AssessmentDetail.tsx` is deleted).

- Authoritative source: `public.prudential_assessment_case(_assessment_id)` — extended in
  this package with `filing`, `linked_actions`, `rating_guidance`, `evidence` and
  `completed_steps`, and repointed onto canonical routes (`/returns/filings/:id`,
  `/entities/:id?view=prudential`, `/correspondence/:id`).
- Standard header via the shared `CaseHeader`: reference, subject (links to Entity 360),
  stage, status, owner/team, priority, SLA state, waiting-on, next required action, blockers.
- Tabs: **Current step**, Risk assessment, Evidence, Supervisory actions, Related cases.
- One lifecycle controller: only **Current step** renders stage transitions. Supporting
  tabs save their own content (`Save assessment`) and never change the stage. Blocker
  "Resolve" links open the Risk assessment tab with `?from=current`, which shows a detour
  banner and a "Return to current step" control. After a transition the URL normalises
  back to `section=current`.
- Permitted transitions, whether a rationale is mandatory, and whether the action is
  enabled all come from `available_actions` (server). Blockers come from
  `prudential_assessment_finalisation_gaps()`; DB guards remain the ultimate authority.

### No client-side supervisory rating policy
The old page derived a rating from the worst breach severity in the browser
(`autoRating`, override justification) — that is removed. The workspace shows the
server's `rating_guidance`, which today reports **NO AUTOMATED RATING SUGGESTION**
because no rating methodology is configured on the platform. The overall rating remains a
human-governed determination.

### No raw return-id editing
The free-text "Linked return id" input is removed. Evidence is the canonical EPR-01
filing resolved server-side (`filing.filing_reference`, period, accepted version, link to
`/returns/filings/:id`); metric facts, breaches and stress events come from
`prudential_filing_metric_facts()` keyed on that filing. Stress *evaluation* is not
runnable here — it stays at `/admin/prudential/operations`.

## 3. Specialist queue disposition

| Surface | Disposition | Rationale |
|---|---|---|
| `/prudential/work` | PROCESS QUEUE | the single cross-type prudential inbox |
| `/supervision/breaches` | SPECIALIST_REGISTER | breach acknowledgement is a domain-specific bulk act on signals, not case work; every breach also appears in the work queue as a `BREACH` item |
| `/supervision/early-warnings` | SPECIALIST_REGISTER | EWI analytics register; work items surface as `EWI` |
| `/prudential/actions`, `/prudential/escalations` | SPECIALIST_REGISTER | ledgers of consequences; the actionable subset is in the work queue |
| `/prudential/assessments`, `/prudential/examinations` | CASE REGISTER → workspace | list → canonical case workspace |
| `/prudential/entities/:id` | COMPATIBILITY_REDIRECT | see §4 |
| `/prudential/analysis/:id` | JUSTIFIED_ANALYTICS_ONLY | ratio trends, peer comparison, heatmaps, AI analysis reports |
| `/admin/prudential/operations` | ENGINE OPERATIONS | sweeps, stress evaluation, recomputes |

## 4. `/prudential/entities/:id`

Redirects (`src/routes/PrudentialEntityRedirect.tsx`) to
`/entities/:id?view=prudential`, i.e. Entity 360 with the prudential section, so the
regulated entity has one profile. Cross-module links were repointed to the canonical
route (financial group members, entity register rows, escalation rows, risk-score
explainer, action source links). AI report deep links point at
`/prudential/analysis/:id`.

**DUPLICATE PRUDENTIAL ENTITY PROFILE = 0** (the retained analysis surface carries no
identity/licence master data and no operational actions).

## 5. RBAC / persona matrix

| Persona | Work queue | Assessment workspace | Transitions | Engine operations |
|---|---|---|---|---|
| Super admin | full | full | full | full |
| Prudential supervisor (`prudential_supervision.workflow_action`) | full | full | submit / review / return / approve / close as offered by the server | no |
| Prudential analyst (`prudential_supervision.edit`) | full | edit risk assessment content, no transition button rendered | none | no |
| Read-only / assignment-only | read | read-only tabs | none | no |
| Platform admin | read | read | none | full |

Enforcement layers: `PermissionGate` on every workspace action (module/action derived from
the server-declared `permission`), `M module="prudential_supervision"` route guard, and
the governed RPCs (`prudential_assessment_transition`, `prudential_assessment_save_draft`)
which re-check permission server-side and write the compliance audit trail.

## 6. Governed transition evidence

Every stage change in the workspace calls
`public.prudential_assessment_transition(_assessment_id, _to, _reason)` — a governed RPC
that derives the actor server-side, enforces `prudential_supervision.workflow_action`,
validates the transition and writes the audit row. The browser holds no direct DML on
`prudential_assessments`.

## 7. Exit gates

| Gate | Result |
|---|---|
| Assessment case workspace on the canonical read model | YES |
| Single lifecycle controller (Current step) | YES |
| Client-side rating policy | 0 |
| Raw return-id editing | 0 |
| Duplicate prudential entity profile | 0 |
| Engine controls outside `/admin/prudential/operations` | 0 |
| Governed transitions only | YES |

**EPR-02 COMPLETE: YES**
