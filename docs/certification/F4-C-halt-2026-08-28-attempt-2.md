# F4-C RETRY (Attempt 2) — HALT

**Date:** 2026-08-28
**Tested HEAD:** `0b19347ad09aa96b3e3b33bb421bd8d8b7cbb945`
**Scope:** certification only (no remediation performed)
**Verdict:** **F4 NOT CERTIFIED — RETURN TO F4-B**

---

## 1. Rebaseline — ALL GREEN (no F0–F3 regression)

| Gate | Result |
|---|---|
| `verify:audit-contract` | PASS — 0 stale audit writers |
| `verify:coordination-lifecycle` | PASS — 26/26 |
| `verify:f4b` | PASS — 33 passed / 0 failed |
| `certify:f3c` | PASS — 39 assertions, rollback-clean |
| `verify:f3b` | PASS — 38 TESTED_PASS / 0 FAIL / 0 N-A |
| `verify:f2b` | PASS — 63 TESTED_PASS / 0 FAIL / 0 N-A |
| `verify:f1c` | PASS — 96 TESTED_PASS / 0 FAIL / 0 N-A |
| `verify:f0c` | PASS — 34 TESTED_PASS / 0 FAIL / 0 N-A |
| `verify:permission-refs` | PASS (DEF-F3-C-01 gate) |
| `verify:hardening` | PASS — 31 passed / 0 failed / 0 skipped |
| `verify:edge-authz` | PASS — user=47 worker=28 webhook=1 machine=1 public=7, every function gated |
| `verify:anon-execute` | PASS — 7 allowlisted, 0 defects |
| `verify:definer-guards` | PASS |
| `verify:breadcrumbs` | PASS — 339 covered / 0 uncovered |
| `verify:service-completeness` | PASS — 0 incoherent service dimensions |
| Frontend suite | PASS — 141 files / 1293 tests |
| RBAC action coverage / parity | PASS — 46/46 scope tuples, 0 missing |
| Typecheck | PASS |
| Build | PASS |

Rebaseline therefore permitted the F4-C run to start from Section A.

---

## 2. F4-C run 1 — halted in Section D/E notification-evidence probe

`scripts/certify-f4c.sql` was executed complete from the beginning (fixtures
created, Sections A–C executed inside the rollback transaction). Execution
stopped with:

```
psql:scripts/certify-f4c.sql:638: ERROR:  column "related_entity_id" does not exist
QUERY: SELECT count(*) FROM public.notifications
       WHERE related_entity_id = v_full::text AND title ILIKE 'Application Approved%'
```

Investigation shows this is **not only** a harness column-name mistake; the same
stale contract exists in production runtime code.

---

## 3. DEF-F4-C-03 — PRODUCT DEFECT (new runtime defect)

**Classification:** PRODUCT_DEFECT — stale write contract against
`public.notifications` in a production worker.

**Location:** `supabase/functions/process-notification-outbox/index.ts` (in-app
channel branch, ~L61–L70) inserts:

```ts
await admin.from("notifications").insert({
  user_id, title, message, type: "system",
  related_entity_type: row.entity_type,   // column does not exist
  related_entity_id: row.entity_id,       // column does not exist
  metadata: { ... },
});
```

**Empirical proof (rolled back):**

```
SELECT count(*) FROM information_schema.columns
 WHERE table_name='notifications'
   AND column_name IN ('related_entity_id','related_entity_type');  -> 0

INSERT INTO public.notifications (... related_entity_type, related_entity_id ...)
ERROR: column "related_entity_type" of relation "notifications" does not exist
```

The canonical columns are `entity_type` and `entity_id` (text).

**Impact:** every `in_app` outbox row processed by
`process-notification-outbox` fails its insert, so the row is counted as
`failed`, retried, and ultimately dead-lettered — no in-app notification is
ever delivered through the outbox worker. This directly defeats the F4
"audit / history / notification evidence" assertion for licence issuance and
the outbox "failure → retry → dead-letter vs success" distinction, because the
success path cannot succeed.

**Category census (writers to `public.notifications`):** all other writers use
the canonical `entity_type`/`entity_id` contract —
`dispatch-notification-event` (2 sites), `send-notification` (2 sites),
`send-correspondence`, `notification-retry`, `toggle-user-status`,
`RaiseRfiDialog.tsx`, `ApplicationRfiTab.tsx`. `process-notification-outbox`
is the only defective writer. No `public` DB routine writes the stale columns
(`verify:audit-contract` covers DB routines only — it does **not** cover Edge
Function writers, which is the structural gap that allowed this to survive).

**Secondary (harness) item:** `scripts/certify-f4c.sql` L638 uses the same
stale column names and must be corrected to `entity_id` in the same F4-B pass.

**Not patched.** Per the F4-C protocol, no remediation was performed during
this certification pass.

---

## 4. Required F4-B (attempt 4) work before F4-C can be retried

1. Repair `process-notification-outbox` to the canonical
   `entity_type` / `entity_id` contract (DEF-F4-C-03).
2. Extend the audit/notification contract census to **Edge Function writers**
   (static column-list extraction for `from("<table>").insert({...})` against
   `information_schema.columns`) and register it as a permanent gate
   (e.g. `verify:write-contract`), so this whole category is structurally
   prevented rather than fixed instance-by-instance.
3. Correct the `certify-f4c.sql` notification-evidence probe column names.
4. Prove empirically (rolled back) that an `in_app` outbox row is delivered:
   `notifications` row created, outbox row marked sent, no dead-letter.
5. Re-run the full F0–F4 regression battery, then restart F4-C from Section A.

---

## 5. Residue check

The F4-C run executes inside a single transaction; the failure aborted it and
`ROLLBACK` was issued by the script epilogue. Post-run checks:

- `CERT-F4C%` residue: none (transaction aborted and rolled back).
- No synthetic application, licence, coordination case, audit or outbox rows
  persisted.

---

## 6. Verdict

**F4 NOT CERTIFIED — RETURN TO F4-B**

Open defect: **DEF-F4-C-03** (PRODUCT_DEFECT, High —
in-app notification delivery via the outbox worker is inoperable).
F0–F3 remain certified and frozen; no regression was observed in any frozen
gate. F5 has not been started.
