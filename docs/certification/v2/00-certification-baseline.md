# Certification V2 — Wave 0 Environment Baseline

Programme: Enterprise SupTech Certification V2
Cycle: CLEAN → SEED → INTEGRITY CHECK → EXECUTE → VERIFY SIDE EFFECTS → GAP → FIX → RESEED → REPLAY → CERTIFY
Baseline captured: 2026-08-23 (UTC), against the current non-production backend.

## 1. Environment classification

| Item | Observed | Evidence |
|------|----------|----------|
| Environment | Non-production | `cert_nonproduction_guard`: `environment = non_production`, `reset_enabled = true` |
| Destructive operations | Permitted, but only through the governed harness | `public.cert_v2_guard_ok()` returns `true`; every `cert_v2_*` function calls `cert_v2_assert_allowed()` first |
| Migrations applied | 924 (pre-Wave 1) + Wave 1 harness migrations | migration history |

No destructive statement is executed outside `cert_v2_reset()`, and that function refuses to run when the guard row is absent or `reset_enabled` is false.

## 2. Security and access baseline

| Dimension | Count |
|-----------|------:|
| Roles in catalogue (`sec_roles`) | 60 |
| Navigation items (`sec_navigation_items`) | 257 |
| Registered routes (`sec_routes`) | 134 |

Role tiers present: external, operational, supervisory, oversight, admin.

## 3. Workflow and notification baseline

| Dimension | Observed |
|-----------|----------|
| Approval workflows (total) | 11 |
| Approval workflows (active) | 6 |
| Published workflows (v1) | Pre License Approval, Pre Licensee Approval, Registration, Return |
| Notification event configs (active) | 246 |

## 4. Integration and provider baseline

| Dimension | Observed |
|-----------|----------|
| Integration connections registered | 15 (AI, screening, payments) |
| Connections with `provider_verified = true` | 0 |
| SMTP / SMS provider environment variables | None present |

Consequence for certification: notification assertions are evidenced from
`notification_dispatch_log` rendered content and recipient resolution, not from
live third-party delivery. This is recorded as an environment constraint, not a
defect.

## 5. Business population baseline (pre-purge)

| Population | Rows |
|------------|-----:|
| parties | 77 |
| organizations | 27 |
| licensees | 21 |
| licenses | 23 |
| entity_licenses | see registry report |
| applications | 28 |
| return_filings | 124 |
| return_filing_versions | 141 |
| complaints | 13 |
| correspondence_threads | 38 |
| fp_assessments | 17 |
| examinations | 9 |
| enforcement_actions | 8 |
| conduct_investigations | 1 |
| pre_license_users | 38 |
| profiles | 21 |
| audit_logs | 505 |
| compliance_audit_logs | 1,611 |
| notification_dispatch_log | 368 |

## 6. Existing fixture provenance

`certification_seed_manifest` holds 25 rows for `CERTIFICATION_DATASET_V1`
(20 regulated entities E01–E20 plus 5 supporting organizations H1–H5). This is
the only pre-existing provenance ledger; every other population must be
classified by dependency, not by name.

## 7. Wave 0 conclusion

The environment is fit for a governed certification cycle:

- non-production guard is in place and asserted by the harness;
- a provenance ledger already exists for the V1 dataset;
- V2 introduces its own registry (`cert_fixture_runs` / `cert_fixture_objects`)
  so that every seeded record is attributable and reversible;
- audit and notification-delivery history is classified KEEP and is never purged.

Open environment constraint carried into later waves: no verified email/SMS
provider, so channel delivery is certified at render-and-dispatch level only.
