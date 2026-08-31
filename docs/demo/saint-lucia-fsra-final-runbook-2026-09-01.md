# Saint Lucia FSRA — Click-by-Click Demonstration Runbook
**Demo ID:** DEMO_SLU_FSRA_2026 · **Environment:** RC1 certification (non-production) · **Duration:** 45 minutes

Before the meeting, run:

```bash
npm run seed:st-lucia-demo     # idempotent, safe to re-run
npm run verify:st-lucia-demo   # must print "21/21 GATES PASSED"
```

Log in as `super_admin@mishainfotech.com`. Keep this runbook open on a second screen.
Every URL below is absolute from the application root.

---

## Act 1 — The regulated universe (5 min)

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 1 | Open the executive dashboard | `/executive` | Portfolio counts across the nine FSRA sectors; supervisory workload tiles |
| 2 | Open the entity register | `/entities` | Licensees list; use search for `SAINT-LUCIA-FSRA-DEMO` to show the ten prepared demonstration organisations across nine FSRA sectors (VASP, credit union, registered agent, insurance, international bank, fund administration, MSB and pensions), plus one non-financial group member |
| 3 | Open one non-bank entity | `/entities/5c1a0001-0000-4000-8000-000000000001` | "Hewanorra Nexus Digital Finance Ltd" — sector, sub-sector, lifecycle stage, identity status, appointments, addresses |

Say: *"One register, nine sectors, one taxonomy. Every record you see is the same canonical entity object."*

## Act 2 — Ownership, control and group structure (7 min)

These are **two separate stories**. Do not mix the percentages.

### Story A — Ownership network and effective beneficial interest (Hewanorra Nexus)

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 4 | Open the entity | `/entities/5c1a0001-0000-4000-8000-000000000001` | Hewanorra Nexus Digital Finance Ltd |
| 5 | Open its ownership/network view | same screen → ownership tree / `/intelligence/network` | Declared direct holders: Nexus Caribbean Holdings 60%, Daniel Mercer 25%, Alicia Joseph 15%; above Nexus Caribbean Holdings: Alicia 65%, Daniel 35% |

Expected effective ownership, traversed through the upper holding layer:
**Alicia Joseph 54%** (15 + 60 × 65%), **Daniel Mercer 46%** (25 + 60 × 35%).

Say: *"The system does not store an effective percentage — it derives it by walking the ownership chain, so it cannot silently go stale."*

Do **not** open the UBO determination panel: no UBO policy is configured in this environment (see fallbacks).

### Story B — Supervisory financial group and consolidation treatment (Piton)

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 6 | Open the holding entity | `/entities/5c1a0002-0000-4000-8000-000000000002` → Group Structure | Piton Community Credit Union Ltd, group **SLU-GROUP-001**, relationship *Ultimate holding company*, link into the group profile |
| 7 | Open the financial group | `/prudential/groups/5c210001-0000-4000-8000-000000000001` | "Piton Financial Cooperative Group" — holding entity plus two subsidiaries under it: Piton Finance Services (100%, **full consolidation**) and Piton Property Holdings (75%, **excluded**) |

Say: *"A financial group is a supervisory perimeter, not another licence. Legal ownership of 75% and exclusion from prudential consolidation are two different facts, and the platform keeps both."*

Note the honest limitation: the Piton members have no accepted returns, so no consolidated position is computed for this group; consolidated ratio mechanics are shown on the Coral Harbour Bank prudential analysis screen instead.


## Act 3 — Licensing and fit & proper (7 min)

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 7 | Application queue | `/applications` | Queue with statuses, priority, assignment |
| 8 | An application in review | `/applications/b4069cc6-3d0a-48b4-ba47-62d6d1a77bb8` | Submitted application, forms, sufficiency, workflow panel, audit trail |
| 9 | An approved application | `/applications/aa6cdba1-c2ca-4159-8535-62b07c104270` | Terminal approval and the licence it provisioned |
| 10 | Fit & proper assessment | `/fpa/assessments/4c16364c-2ccf-4336-ab28-338c2cb3dbbe` | Probity questionnaire, evidence, committee, recorded determination |

Say: *"Every state change here is a governed function call with an actor, a timestamp and a rationale — not a free-text status field."*

## Act 4 — Returns and prudential ratios (8 min)

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 11 | Returns oversight | `/returns/queue` | Filing periods, obligations, submission and review states |
| 12 | The accepted filing | `/entities/5855bf85-9fde-4cf8-a082-7ea904d46184` → Returns tab | Coral Harbour Bank Limited, filing **CV2-E02-2025-Q3**, status **ACCEPTED** |
| 13 | Prudential analysis | `/prudential/analysis/5855bf85-9fde-4cf8-a082-7ea904d46184` | Header tiles: latest accepted return, worst breach **Breach**, open actions and open escalations counts |
| 14 | "Ratios & Trends" tab | same screen | CAR **12.50%**, liquidity **14.50%**, NPL **5.80%**, cost/income **74.00%** |
| 15 | "Peer Comparison" tab | same screen | The bank positioned against sector peers on the same metrics |

Prove the arithmetic live if asked: capital 150m ÷ RWA 1,200m = 12.50%; liquid assets 87m ÷ short-term liabilities 600m = 14.50%; NPL 55.68m ÷ gross loans 960m = 5.80%; operating expenses 44.4m ÷ net interest income 60m = 74.00%.

Say: *"There is exactly one store of metric truth. Ratios are read from the accepted filing — there is no second spreadsheet of numbers anywhere in the platform."*

## Act 5 — Breach, acknowledgement, action, closure (10 min) — the centrepiece

On the Breaches tab, filter to **2025 / Q3** first. Older 2025-Q4 detections against a superseded filing version remain on record because detection evidence is append-only — say so if asked; nothing in this platform is deleted.

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 16 | "Breaches" tab (filtered 2025 / Q3) | `/prudential/analysis/5855bf85-9fde-4cf8-a082-7ea904d46184` | Liquidity 14.50% vs 15.00% floor (**breach, not yet acknowledged**); NPL 5.80% vs 5.00% (**warning**, acknowledged); cost/income 74.00% vs 65.00% (**warning**) |
| 17 | **Live action:** acknowledge the liquidity breach | same tab | Enter the rationale below, submit, and show the recorded actor, timestamp and rationale |
| 18 | Try to acknowledge it a second time | same tab | The platform refuses — one acknowledgement per breach |
| 19 | "Actions" tab | same screen | **PA-2026-0001** liquidity remediation plan (2025-Q3 liquidity ratio 14.5%) — in progress, 40%, due 30 Apr 2026, awaiting review; **PA-2026-0002** NPL explanation — completed, 100%, closed 20 Mar 2026, review accepted. Rows titled *"[Superseded record retained on file]"* are the retained 2025-Q4 originals |
| 20 | Open PA-2026-0002 | Actions ledger | Closure notes, who closed it, when, and the supervisory review that accepted the closure |

Rationale to type at step 17:
> Liquid asset ratio of 14.5% is below the 15.0% supervisory floor for 2025-Q3. Acknowledged by prudential supervision; remediation to be pursued under prudential action PA-2026-0001.

Say: *"Detection is automatic. Acknowledgement, escalation and closure are human decisions — and every one of them is signed and timestamped."*


## Act 6 — Supervisory work, conduct and communication (5 min)

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 21 | Examination in remediation | `/prudential/examinations` → EXM-2026-00009 | Scope, team, information requests, workpapers, findings, remediation stage |
| 22 | A live complaint | `/complaints/a3a79bc6-b27d-45db-aa26-5d39ee5c4ed5` | CMP-2026-000103 "Unauthorised debits from my savings account", submitted, triage available |
| 23 | A closed complaint | `/complaints/36725bd3-0593-41e0-9def-229e081125f5` | CMP-2026-000099, closed with recorded outcome |
| 24 | Notifications | `/notifications` | System-generated supervisory notifications |
| 25 | My work | `/my-work` | Personal queue: what this officer owes and by when |

## Act 7 — Intelligence, AI and auditability (3 min)

| # | Action | URL | What must appear |
|---|--------|-----|------------------|
| 26 | "AI Analysis Reports" tab | `/prudential/analysis/5855bf85-9fde-4cf8-a082-7ea904d46184` | Generated analytical narrative with its confidence and human review state |
| 27 | AI insights hub | `/analytics/ai-insights` | Model governance: review queue, modification and rejection rates, thresholds |
| 28 | Audit log | `/admin/audit-logs` | Filter by today: the acknowledgement performed at step 17 appears with actor, object, event and timestamp |
| 29 | Reports | `/reports` | Exportable supervisory reporting |

Say: *"AI drafts. A named human decides. Both facts are on the record."*

## Act 8 — Governance and separation of duties (optional, 3 min)

Open a second browser profile and sign in as:

- `returns_officer@mishainfotech.com` → visit `/admin/returns/prudential/thresholds` → **access is refused**: returns authority does not confer prudential configuration authority.
- `prudential_analyst@mishainfotech.com` → visit `/prudential/analysis/5855bf85-9fde-4cf8-a082-7ea904d46184` → **read-only**; no configuration controls.
- `licensee_primary_user@mishainfotech.com` → the licensee sees only its own entity; no other institution's data is visible.

Say: *"Least privilege is enforced in the database, not merely hidden in the menu."*
