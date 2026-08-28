# F5-B1 — POST-LICENSING PRIVILEGE & CONFIGURATION LOCKDOWN

Date: 2026-08-29
Scope: GAP-F5-08 (CRITICAL), GAP-F5-09 (HIGH), GAP-F5-10 (HIGH) only.
Authoritative discovery: `docs/certification/F5-post-licensing-discovery-2026-08-29.md`
Frozen contracts preserved: F0, F1, F2, F3, F4.

Out of scope this pass (unchanged): F5 post-approval effect engine (F5-B3), F5
service catalogue business configuration, F6.

---

## 1. Pre-remediation live census

| Table | anon | authenticated | PUBLIC-derived | service_role | RLS | Frontend writes | Edge writes | DB routine writes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `regulatory_request_types` | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE | none | ALL | enabled, single `USING (true)` read policy, no write policy | none | none | read-only resolution only |
| `license_lifecycle_configs` | none | SELECT, INSERT, UPDATE, DELETE | none | ALL | disabled | none | none | `license_lifecycle_config_resolve` (read) |
| `license_renewals` | none | SELECT, INSERT, UPDATE | none | ALL | disabled | none | none | `license_lifecycle_action` (governed writer) |

Key findings:

- Broad table GRANTs meant `anon` could destroy regulatory reference data on
  `regulatory_request_types` regardless of the permissive read policy — RLS was
  not compensating for the GRANT surface.
- No admin screen, hook or Edge Function performed direct DML against any of the
  three tables, so revocation removed no live functionality. The only governed
  writer that had to be preserved was `public.license_lifecycle_action` for
  `license_renewals`.
- `license_management.manage_config` is the canonical configuration permission
  for the licence lifecycle estate.

## 2. Forward remediation (single migration)

1. Revoked `INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`
   from `anon` and `authenticated` on all three tables.
2. Revoked all `anon` access (including `SELECT`) on `regulatory_request_types`
   and `license_lifecycle_configs` — neither is public reference data.
3. Retained `authenticated` `SELECT` on all three tables (required by product
   read paths) and `service_role`/trusted lifecycle access.
4. Enabled RLS on `license_lifecycle_configs` and `license_renewals`; dropped
   permissive write policies on `regulatory_request_types`.
5. Added governed admin RPCs (SECURITY DEFINER, fixed `search_path`, `anon`
   EXECUTE denied):
   - `public.admin_upsert_license_lifecycle_config(uuid, jsonb)`
   - `public.admin_set_license_lifecycle_config_active(uuid, boolean, text)`

   Both derive the actor from `auth.uid()`, require
   `license_management.manage_config` (or super-admin), validate the lifecycle
   matter vocabulary (renewal, variation, surrender, transfer, reinstatement,
   name change, cessation), validate regulator scope, require a reason for
   retirement/reactivation, and write old/new evidence to
   `public.config_change_log` (`CREATE`/`UPDATE`/`RETIRE`/`REACTIVATE`) and
   `public.compliance_audit_logs`.

## 3. Post-remediation privilege census

| Table | anon | authenticated | RLS |
| --- | --- | --- | --- |
| `regulatory_request_types` | none | SELECT | enabled |
| `license_lifecycle_configs` | none | SELECT | enabled |
| `license_renewals` | none | SELECT | enabled |

(`app_certification_runner` and `sandbox_exec` are internal verification roles,
not browser roles.)

## 4. Permanent gates

- New: `scripts/verify-f5b1-privileges.sql`, registered as `npm run verify:f5b1`
  — **51 PASS / 0 FAIL**, idempotent and re-runnable (temp fixtures dropped on
  entry and exit so it cannot collide with other gates under session pooling).

  Sections:
  - A — ACL census: zero external write/structural privileges, no PUBLIC writes,
    trusted lifecycle access retained, RLS enabled.
  - B — governed RPC surface: definer, fixed `search_path`, no PUBLIC/`anon`
    EXECUTE.
  - C — empirical negative tests (role-switched): `anon` and an ordinary
    authenticated user cannot INSERT/UPDATE/DELETE regulatory request types,
    cannot mutate lifecycle configuration, cannot fabricate or advance a renewal
    record, and cannot invoke the governed admin mutations.
  - D — empirical positive path inside an always-rolled-back subtransaction:
    authorised admin create (D-01) and edit (D-02) succeed; invalid vocabulary
    (D-03), unknown regulator scope (D-04) and reason-less retirement (D-05) are
    refused; governed retirement succeeds (D-06); three audit + three
    config-change-log rows written (D-07); zero residue after rollback (D-08).
  - E — residue proof and wider F5-sensitive privilege regression census.

- Extended: `scripts/verify-hardening.sql` with a permanent F5-B1 block
  (4 PASS / 0 FAIL) asserting no browser-role DML across the wider F5 estate
  (`regulatory_request_types`, `license_lifecycle_configs`, `license_renewals`,
  `license_terms`, `license_variations`, `license_variation_items`,
  `license_lifecycle_matters`, `regulatory_service_tasks`), no `anon` read on
  governed post-licensing configuration, presence/guarding of the new RPCs, and
  RLS still enabled on the three locked-down tables.

## 5. Regression results

| Gate | Result |
| --- | --- |
| verify:f5b1 | 51 PASS / 0 FAIL |
| F5 discovery census | PASS |
| verify:license-terms | 7/7 PASS |
| verify:write-contract | PASS |
| verify:audit-contract | PASS (0 violations) |
| verify:coordination-lifecycle | 26/26 PASS |
| verify:outbox-delivery | PASS |
| verify:f4b | PASS |
| certify:f3c | PASS |
| verify:f3b | PASS |
| verify:f2b | PASS |
| verify:f1c | PASS |
| verify:f0c | PASS |
| verify:permission-refs | PASS |
| verify:hardening (incl. F5-B1 block) | PASS |
| verify:anon-execute | PASS |
| verify:definer-guards | PASS |
| verify:breadcrumbs | PASS |
| verify:service-completeness | PASS |
| Frontend tests | 141 files / 1293 tests PASS |
| RBAC coverage (`src/test/rbac`) | 70/70 PASS |
| typecheck | PASS |
| build | PASS |

Housekeeping: `license_management.manage_config` is now referenced by the new
governed RPCs, so its stale row was removed from
`docs/rbac/permission-disposition.json` (172 → 171 rows) to keep the catalogue
integrity gate truthful. No F0–F4 regression observed.

## 6. Gap status

| Gap | Severity | Status |
| --- | --- | --- |
| GAP-F5-08 — `regulatory_request_types` open DML to `anon`/`authenticated` | CRITICAL | CLOSED — all external write and `anon` read privileges revoked; RLS enforced; proven empirically. |
| GAP-F5-09 — `license_lifecycle_configs` browser DML | HIGH | CLOSED — browser DML revoked, RLS enabled, governed admin RPCs with permission checks, vocabulary/scope validation and audit evidence. |
| GAP-F5-10 — `license_renewals` browser DML | HIGH | CLOSED — browser INSERT/UPDATE revoked; only the trusted `license_lifecycle_action` path may mutate renewals. Renewal approval effect remains deferred to F5-B3. |

---

## Verdict

**F5-B1 CLOSED — READY FOR F5-B2**
