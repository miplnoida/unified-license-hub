# Certification V2 — Wave 1.5: Clean Slate & Baseline Reconciliation

Status: **CERTIFIED (clean baseline established)**
Environment: non-production Lovable Cloud database (guarded by `cert_nonproduction_guard`)
Harness: `scripts/cert-v2/01b-wave15-harness.sql`
Ledger run: `LEGACY-BASELINE-PURGE` (`cert_fixture_runs` / `cert_fixture_objects`)

---

## 1. Objective

Remove all vendor/demo/V1-certification business data, repair broken web-user
relationships, reconcile the configuration inventory, and prove — with queries —
that the platform starts Wave 2 from a defect-free baseline **without** losing
configuration or audit history.

---

## 2. Provenance tracing (what was classified as non-authentic)

| Population | Count | Verdict |
| --- | --- | --- |
| `pre_license_users` | 38 | Vendor test registrations — purge |
| `parties` (PERSON + ORG) | 177 | V1 fixture residue — purge |
| `licensees` | 25 | V1 certification universe — purge |
| `licenses` | 912 | Generated from fixture applications — purge |
| `applications` | 42 | V1 fixtures — purge |
| `return_filings` (+ versions, metric values) | 600 | V1 filing universe — purge |
| Complaints / conduct / enforcement / examinations / F&P / correspondence / escalations / resolution cases / workflow instances | 170 | V1 fixtures — purge |
| **Root objects registered before purge** | **416** | Ledgered in `cert_fixture_objects` |

Configuration, security, notification and audit data were classified as
**authentic and retained**.

---

## 3. Purge execution (`cert_v2_reset('LEGACY-BASELINE-PURGE')`)

| Table | Rows deleted |
| --- | --- |
| `workflow_instances` | 10 |
| `escalations` | 3 |
| `return_filings` | 600 |
| `enforcement_actions` | 35 |
| `conduct_investigations` | 1 |
| `complaints` | 20 |
| `examinations` | 18 |
| `fp_assessments` | 25 |
| `correspondence_threads` | 43 |
| `applications` | 42 |
| `licenses` | 912 |
| `entity_resolution_cases` | 15 |
| `pre_license_users` | 38 |
| `licensees` | 25 |
| `parties` | 177 |

Deletion is FK-aware and recursive (`cert_v2_cascade_delete`), driven from
`pg_constraint`, with a depth limit and an explicit protected-table list
(`cert_v2_protected_tables`) covering audit, security-event and access-log
tables — those are never deleted; incoming references are nullified instead.

### 3.1 Append-only history guards

Eleven tables carry append-only triggers that intentionally reject `DELETE`
(e.g. `escalation_tier_events`, `return_filing_versions`, `return_metric_values`,
`application_acknowledgements`, `sufficiency_determinations`, `fp_determinations`).
For fixture removal the harness calls `cert_v2_exec_unguarded`, which suspends
**USER** triggers on the target table for the statement's duration inside the
harness transaction. FK/system triggers remain active, so referential integrity
is still enforced, trigger state is restored transactionally, and the function is
executable only by `service_role` behind the non-production guard. No production
immutability rule was weakened or dropped.

---

## 4. Web-user reconciliation (`cert_v2_repair_web_user_links`)

| Repair | Rows |
| --- | --- |
| `profiles.licensee_id` cleared (entity missing) | 0 |
| `profiles.entity_name` cleared (unresolvable label) | 7 |
| `entity_user_access` deactivated (entity missing) | 0 |
| `entity_user_memberships` revoked (revoked / entity missing) | 0 |
| `ppoc_entity_mappings` deactivated (invalid entity or user) | 0 |

`entity_user_memberships` and `entity_user_access` were already empty; the only
real defect was stale free-text entity labels on 7 external profiles.

---

## 5. Configuration reconciliation

| Inventory | Baseline | After purge | Result |
| --- | --- | --- | --- |
| Security roles (`sec_roles`) | 60 | 60 | preserved |
| Navigation items (`sec_navigation_items`) | 257 | 257 | preserved |
| Notification templates | 426 | 426 | preserved |
| Active notification events | 246 | 244 | 2 deactivated (below) |
| Form templates | 55 | 55 | preserved |
| Approval workflows / steps | 11 / 35 | 11 / 35 | preserved |
| `audit_logs` | 505 | 505 | preserved |
| `compliance_audit_logs` | 1,661 | 1,661 | preserved |

Role inventory composition: 44 template-keyed governed roles + 15 legacy roles +
1 break-glass administrator.
Route inventory: ~305 React route elements, 134 database-registered routes
(116 permission-mapped), 257 navigation items.

### 5.1 Notification events without emitters

`complaint.rfi_due_reminder` and `conduct_investigation.monitoring_review_due`
had no code path capable of emitting them. Both are now `is_active = false`;
their templates are retained so they can be re-enabled when the corresponding
schedulers are built.

---

## 6. Business-data baseline (post-purge counts)

`licensees`, `parties`, `applications`, `licenses`, `return_filings`,
`complaints`, `pre_license_users` = **0**.
`profiles` = 21 (internal staff and repaired external users, all link-clean).

---

## 7. Integrity gate — `cert_v2_integrity_gate()`

| Check | Count | Status |
| --- | --- | --- |
| active_application_missing_entity | 0 | PASS |
| active_license_missing_entity | 0 | PASS |
| active_workflow_missing_definition | 0 | PASS |
| active_workflow_missing_target | 0 | PASS |
| canonical_filing_missing_entity | 0 | PASS |
| duplicate_business_identity | 0 | PASS |
| duplicate_primary_web_user_per_entity | 0 | PASS |
| invalid_active_membership | 0 | PASS |
| invalid_active_ppoc_relationship | 0 | PASS |
| orphan_active_user_entity_relationship | 0 | PASS |
| stale_active_web_user_entity_link | 0 | PASS |

**Gate result: 11/11 PASS — Wave 2 seeding is unblocked.**

---

## 8. Reproducibility

1. Apply `scripts/cert-v2/01b-wave15-harness.sql`.
2. `SELECT public.cert_v2_register_legacy_baseline('LEGACY-BASELINE-PURGE');`
3. `SELECT * FROM public.cert_v2_reset('LEGACY-BASELINE-PURGE');`
4. `SELECT * FROM public.cert_v2_repair_web_user_links();`
5. `SELECT * FROM public.cert_v2_integrity_gate();` — must return 11 PASS rows.

All harness functions abort via `cert_v2_assert_allowed()` unless the
non-production guard is set, are `service_role`-only, and are covered by the
pgTAP assertions under `supabase/tests/`.
