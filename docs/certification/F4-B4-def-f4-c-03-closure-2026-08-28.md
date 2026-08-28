# F4-B4 — DEF-F4-C-03 CLOSURE (Notification Write-Contract Defect)

**Date:** 2026-08-28
**Scope:** remediation of DEF-F4-C-03 and its whole defect category. No F4-C run, no F5.
**Verdict:** **DEF-F4-C-03 CLOSED — READY TO RETRY F4-C**

---

## 1. Instance repair — `process-notification-outbox`

`supabase/functions/process-notification-outbox/index.ts` wrote the non-existent
columns `related_entity_type` / `related_entity_id` on `public.notifications`, so
**every** `in_app` outbox row failed, retried and dead-lettered. Repaired to the
canonical contract:

```ts
entity_type: row.entity_type ?? null,
entity_id: row.entity_id ? String(row.entity_id) : null,
dedupe_key: `outbox:${row.id}`,      // idempotency via uq_notifications_dedupe_key
...
if (insErr && (insErr as any).code !== "23505") throw insErr;  // 23505 = already delivered
```

`entity_id` is cast to `text` (the canonical column type). Idempotency is now
structural: a re-delivery hits the dedupe unique index and settles the row as
`sent` without creating a duplicate notification.

The functions were redeployed (`process-notification-outbox`, `bulk-intake`,
`dispatch-license-certificate`, `sign-license-certificate`, `fp-cycle-scheduler`);
the empirical proof below runs against the live deployed worker.

## 2. Category closure — permanent gate `verify:write-contract`

`verify:audit-contract` covers **DB routines only**, which is exactly why a stale
Edge Function writer survived. New permanent gate
`scripts/verify-write-contract.mjs` (`npm run verify:write-contract`) statically
extracts every literal `.from("<table>").insert/update/upsert({...})` payload key
across `supabase/functions/**` and `src/**` and compares it with
`information_schema.columns`. Non-literal payloads are reported as
unverifiable-by-design, not silently ignored.

First run caught **7 additional stale runtime references** (all against
`audit_logs`) beyond the reported defect:

| File | Stale keys | Fixed to |
|---|---|---|
| `bulk-intake/index.ts` | `new_values` | `new_value` |
| `dispatch-license-certificate/index.ts` | `resource_type`, `resource_id` | `entity_type`, `entity_id` |
| `sign-license-certificate/index.ts` | `resource_type`, `resource_id` | `entity_type`, `entity_id` |
| `fp-cycle-scheduler/index.ts` | `new_values`, `module` | `new_value`, metadata |

Gate now reports **0 stale runtime table-write column references**.

## 3. Harness repair

`scripts/certify-f4c.sql` notification-evidence probes (L624, L792) used the same
stale column names and now read `entity_id` / `entity_type`.

## 4. Privilege hole found and closed

While proving the outbox path, `public.notification_outbox` was found open to
`anon` and `authenticated` (DML) and the `claim` / `reap` SECURITY DEFINER
routines were executable by `PUBLIC`. Migration revokes all anonymous access and
restricts DML/EXECUTE to `service_role`, retaining read-only visibility for staff
admins. Covered by gate assertions F-01…F-03 below.

## 5. Empirical proof — `npm run verify:outbox-delivery` (28/28 PASS)

`scripts/verify-f4b4-outbox.mjs` drives the **real deployed worker** end to end.

| Series | Coverage | Result |
|---|---|---|
| A-01…A-11 | success path: worker credential accepted, row → `sent`, `sent_at` set, retry not incremented, claim released, canonical `notifications` row with correct `user_id`, `entity_type`/`entity_id`, event key, correlation id, title/channel, provenance metadata | PASS |
| B-01…B-03 | idempotency: sent rows not re-claimed, repeated delivery creates no duplicate notification, row still settles `sent` | PASS |
| C-01…C-06 | failure/retry: missing recipient fails instead of delivering, retry counter increments, reason recorded, backoff pushes `next_attempt_at` forward, no notification created | PASS |
| D-01…D-03 | dead-letter: max attempts → `dead` (retry=6), final count retained, never re-claimed | PASS |
| E-01…E-02 | reaping: stuck `processing` row reaped, delivered, notification produced | PASS |
| F-01…F-03 | security: no browser write grants on the outbox, claim/reap not executable by browser roles, worker endpoint returns 401 without the worker credential | PASS |

Residue after the run: **0** (`CERT-F4B4%` rows in both tables).
`public.notifications` is append-only for all browser/harness roles; the harness
removes only its own synthetic probe rows through the service-role Data API, so
the append-only guard itself was never weakened or disabled.

## 6. Category census — writers to `public.notifications`

All writers now use the canonical `entity_type` / `entity_id` contract:
`process-notification-outbox` (repaired), `dispatch-notification-event` (2),
`send-notification` (2), `send-correspondence`, `notification-retry`,
`toggle-user-status`, `RaiseRfiDialog.tsx`, `ApplicationRfiTab.tsx`. No DB
routine writes stale columns (`verify:audit-contract` PASS) and no runtime writer
does either (`verify:write-contract` PASS).

## 7. Full regression battery

| Gate | Result |
|---|---|
| `verify:write-contract` | PASS — 0 stale runtime writers |
| `verify:audit-contract` | PASS — 0 stale audit writers |
| `verify:coordination-lifecycle` | PASS — 26/26 |
| `verify:outbox-delivery` | PASS — 28/28, residue 0 |
| `verify:f4b` | PASS |
| `certify:f3c` | PASS — 39 assertions, rollback-clean |
| `verify:f3b` | PASS — 38 TESTED_PASS / 0 FAIL |
| `verify:f2b` | PASS — 63 TESTED_PASS / 0 FAIL |
| `verify:f1c` | PASS — 96 TESTED_PASS / 0 FAIL |
| `verify:f0c` | PASS — 34 TESTED_PASS / 0 FAIL |
| `verify:permission-refs` | PASS (DEF-F3-C-01 gate) |
| `verify:hardening` | PASS — 31 passed / 0 failed |
| `verify:edge-authz` | PASS — user=47 worker=28 webhook=1 machine=1 public=7 |
| `verify:anon-execute` | PASS — 7 allowlisted, 0 defects |
| `verify:definer-guards` | PASS |
| `verify:breadcrumbs` | PASS — 339 covered / 0 uncovered |
| `verify:service-completeness` | PASS |
| Frontend suite | PASS — 141 files / 1293 tests |
| RBAC parity / action coverage | PASS — 46/46 scope tuples |
| Typecheck | PASS |
| Build | PASS |

Note: `verify:f2b` reported one transient `42501` on assertion S1 P-05
(allowlisted public read of `registration_journey_types`) when run inside the
batch; re-run in isolation returned 63/63 TESTED_PASS with `00000`. No schema,
grant or policy on that table was changed in this pass.

## 8. Verdict

**DEF-F4-C-03 CLOSED.** The instance is repaired, the whole category is now
structurally gated (`verify:write-contract`), the harness is corrected, an
unrelated outbox privilege hole is closed, and outbox delivery — success,
idempotency, retry, dead-letter, reaping and authorization — is empirically
proven against the live worker with zero residue. F0–F3 remain certified and
frozen with no regression. **Ready to retry F4-C.** F5 not started.
