# CU-DEMO-2026 — making the demo usable (Rodney Bay only)

Scope: Rodney Bay Community Credit Union Ltd (`cc331000-0000-4000-8000-000000000001`). No new entities, no repeat inserts, no code/schema/security changes. Execution of this plan is read-only verification plus a written readiness report. Fee, workflow and registration changes are **recommendations only** until you approve them separately.

## Priority 1 — Screen-by-screen verification (read-only)

Done by signing in as an authorised staff user in the browser (needs your approval for a staff session, previously declined) or by you following the checklist. Confirmed pages exist: `/complaints`, `/complaints/:id`, `/conduct/entities/:id/360`, `/admin/returns/prudential`, `/admin/returns/prudential/ratios`, `/admin/fees`, `/admin/workflow-engine`, `/admin/registration-review`. Remaining URLs (Entity 360, Fit & Proper, supervisory plans, examinations, investigations, findings, enforcement) will be confirmed from the router before the checklist is issued.

| Session | Screen | Expected record | Expected status |
|---|---|---|---|
| 2 | Entity 360 `/entities/cc331…` → People | 5 fictional people, proposed appointments | Proposed |
| 2 | Fit & Proper queue | 4 cases `cd50/cd51/cd52/cd54…` | Open, undecided |
| 2 | Entity 360 → Documents | none yet (6 PDFs await officer upload) | — |
| 3 | Prudential assessments | `cd600001…` | Draft, no rating |
| 3 | Supervisory plans | `SP-CU-DEMO-2026-01` | Draft |
| 3 | Examinations | `EXM-CU-DEMO-2026-01`, 3 findings, 3 actions | Fieldwork / open |
| 4 | `/complaints` | `CMP-2026-000126`–`000130` | Per seeded status |
| 4 | Conduct investigations | `CI-CU-DEMO-2026-01` | Open |
| 4 | Conduct findings | `CF-CU-DEMO-2026-01`, `-02` | Draft/open |
| 4 | Enforcement | `ENF-CU-DEMO-2026-01` | Open referral |
| 4 | `/conduct/entities/cc331…/360` | complaints + investigation rolled up | — |

Relationship checks (read-only queries): each record's entity/registry link points to `cc331…` (not the party ID `cc330…`), regulator = Saint Lucia FSRA so regulator-scoped lists show it, assigned officer/owner present where queues filter by assignee, findings linked to their examination/investigation, referral linked to the investigation. Any gap is reported, not fixed.

## Priority 2 — Licensing prerequisites (steps only)

1. **Registration linked to existing entity** — `/register` → Start New Registration with new email (e.g. `rodneybay.registration@yopmail.com`), exact legal name. Stop if a provisional entity is proposed. Regulator resolves the possible-match case in `/admin/registration-review/:id` to registry `cc331…`, then approves; this produces the approved registration and hand-off. Adds one new user + membership; `rbc_primary_user` is untouched. Needs registration-review approve permission.
2. **Fee** — `/admin/fees`: one fee for Credit Unions → Credit Union, application type Pre-licence. Recommended fictional: **XCD 2,500 application fee** (payment via existing simulation, never marked paid manually).
3. **Workflow** — `/admin/workflow-engine`: one active workflow scoped to Credit Unions sector, 3 steps with existing roles: Licensing Officer (review) → Supervisor (recommend) → Admin (decide).

## Priority 3 — Prudential (after a real licence)

Licence issued via workflow → reporting obligations generated from `/admin/returns/schedule` / due dates → licensee files 4 quarterly returns at `/compliance/returns/submit` → officer validates in `/admin/returns/queue/:id` → ratios appear at `/admin/returns/prudential/ratios` (capital, liquidity, delinquency) once filings are accepted. Will confirm a CU return type and ratio definitions exist; if not, that is a further configuration blocker.

## Priority 4 — Readiness report

Delivered as a checklist in chat with four columns: Ready for recording / Created but not screen-verified / Blocked / Exact action needed. Expected blockers: documents not uploaded, registration hand-off, CU fee, CU workflow, licence, returns and ratios.
