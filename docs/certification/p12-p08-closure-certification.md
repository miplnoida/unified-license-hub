# P12 / P08 Closure Certification Pass

Date: 2026-08-21. Scope: correspondence & RFI convergence (P12) and conduct/complaints
closure delta (P08). This pass was a certification exercise, not a feature phase.

## A. Closure decision

**NOT YET CERTIFIED** — two runtime-blocking defects were found and fixed during this pass,
and one journey leg (entity-side parity) cannot be executed because no external portal user
is mapped to any licensee in this environment.

P12 and P08 are **implementation-complete and functionally certified on the regulator side**.
Closure is withheld until the entity-side leg is executed.

## B. Verification performed

Executed against the live database as a signed-in internal staff user (claims impersonation),
using purpose-seeded certification fixtures.

| Journey leg | Result |
| --- | --- |
| Work queue loads, server-paged, server-counted | PASS after fix (see C) |
| Bucket counts reconcile against the queried set (`total` 38, `total_open` 12, `breached` 1, `awaiting_response` 1, `unread` 2) | PASS |
| Queue → canonical thread href (`/correspondence/:id`) | PASS |
| Queue → related case href (complaint and conduct investigation) | PASS |
| Canonical thread workspace returns case header, SLA state, waiting-on, next action | PASS after fix |
| Related case round-trip from the thread (`related_case` with reference + href) | PASS |
| Delivery evidence honesty — `delivered` (provider-confirmed), `bounced` (with reason), `queued` (never claimed as sent) | PASS |
| `delivery_confirmed` true only with provider/delivered proof | PASS |
| SLA breach reflected as `breached` with `waiting_on = entity` | PASS |
| Deterministic paging (tie-broken by id) | PASS |
| Authoritative browser DML on correspondence tables = 0 | PASS |
| `anon` access to correspondence tables | NONE (revoked) |
| Legacy screens retired (`CorrespondenceManager`, `CorrespondenceDetail`, `ConductEntityProfile`) | PASS (automated) |
| Entity-side view parity with regulator view | **UNVERIFIED — no external portal user exists** |

## C. Changes made in this pass

1. **Work queue was non-functional.** `public.correspondence_work_queue` was declared `STABLE`
   but created a temp table, so every call failed (`CREATE TABLE is not allowed in a
   non-volatile function`). Rewritten as a single CTE query with identical filters, buckets,
   counts, ordering and permission scoping.
2. **Both read models referenced a non-existent column** (`licensees.entity_name`), which failed
   the queue and the thread workspace. Corrected to `licensees.name`.
3. **Delivery evidence locked down.** `INSERT/UPDATE/DELETE` on `correspondence_dispatches`
   revoked from `authenticated`; all privileges revoked from `anon`; the staff `FOR ALL` policy
   replaced with a read-only staff policy. Dispatch records are written only by the governed
   send service.
4. **Certification fixtures seeded** (`is_demo = true`): a complaint-linked thread with
   delivered / bounced / queued dispatch evidence and a breached SLA, and a conduct
   investigation-linked internal thread.
5. **Automated evidence added**: `supabase/tests/correspondence/01_read_model_contract.sql`
   regression-guards the temp-table defect, the bad column reference, deterministic ordering,
   and zero browser DML / zero anon read on all five correspondence tables.

## D. Blockers to full closure

| Blocker | Impact | Needed to clear |
| --- | --- | --- |
| No external (entity portal) user is mapped to any licensee in this environment | Entity-side thread parity, internal-note invisibility and entity SLA view cannot be executed | Provision one entity primary user for a certification licensee |
| No live email/SMS provider configured | Provider webhook transitions (sent → delivered → opened → bounced) are proven only from seeded evidence, not from a real callback | Provider credentials in the certification environment |
| Correspondence SLA sweep not scheduled here | The at-risk → breached transition is proven by state, not observed live | Enable the SLA sweep schedule |

## E. Evidence

- `src/test/p12CorrespondenceConvergence.test.ts` — 9/9 passing (governed reads, server paging,
  no browser SLA arithmetic, canonical case header contract, legacy retirement, notification links).
- `supabase/tests/correspondence/01_read_model_contract.sql` — read-model and privilege contract.
- Live read-model outputs captured in this pass (queue rows with `related_href`, thread case with
  `related_case` and three-state delivery evidence).

## F. Deferred items

Carried in `docs/certification/deferred-enterprise-certification-register.md`: P12.2 (live SLA
transition), P12.3 (real provider delivery evidence), P12.4 (entity/regulator parity),
P12.5 (live RFI links), P08.32–P08.33 (full conduct chain in Related Cases).
