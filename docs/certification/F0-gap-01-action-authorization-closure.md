# GAP-F0-01 — UI Action Authorization Closure (Pass B2)

HEAD baseline: 560f938b2 | Test gate: `src/test/rbac/actionCoverage.test.ts` = PASS

## Coverage

| Metric | Initial | Final |
|---|---|---|
| Action sites | 2040 | 2040 |
| Guarded | 1518 | 2040 |
| Unguarded | 522 | 0 |

Frontend regression: 136 files / 1258 tests PASS. Typecheck clean. Build OK.

## Disposition of the 522 sites

| Treatment | Count | Meaning |
|---|---|---|
| `<GuardedButton module/action>` (real enforcement) | 79 | Terminal / privilege-sensitive actions (approve, reject, revoke, delete, publish, waive, assign, close) |
| `data-rbac` marker on existing gated surface | 329 | Actions inside already-permission-gated pages/panels; marker records the canonical `module.action` and is asserted by the scanner |
| Scoped classification: non-mutating | 69 | Navigation / disclosure / filter / drill-down |
| Scoped classification: public-by-design | 18 | Registration, public services, captcha entry points |
| Scoped classification: own-record (RLS) | 13 | Own notification / own attachment / own acknowledgement |
| Scoped classification: scanner-artifact | 10 | Label is a JSX expression, not an action |

No wildcards and no directory-level exemptions were used: `SCOPED_ACTION_CLASSES` in `src/lib/rbac/audit.ts` lists 85 explicit `file + exact label` entries with a recorded reason kind.

## Permissions used (applied sites)

- `market_conduct.manage_complaints` — 96
- `complaint_management.edit` — 38
- `user_management.edit` — 34
- `settings.edit` — 28
- `prudential_supervision.edit` — 22
- `returns_management.edit` — 16
- `notification_management.dispatch` — 16
- `license_management.edit` — 16
- `licensee_management.edit` — 14
- `user_management.create` — 13
- `license_appeals.edit` — 13
- `ai_management.edit` — 13
- `application_management.edit` — 11
- `returns_management.create` — 7
- `form_management.create` — 7
- `form_management.edit` — 6
- `returns_management.submit` — 5
- `registration_management.edit` — 5
- `rule_engine.export` — 4
- `prudential_supervision.create` — 4
- `complaint_management.create` — 3
- `market_conduct.run_conduct_analytics` — 3
- `returns_management.workflow_action` — 2
- `license_appeals.create` — 2
- `application_management.approve` — 2
- `audit_management.export` — 2
- `complaint_management.submit` — 2
- `report_management.create` — 2
- `settings.view` — 2
- `support_management.update` — 2
- `ai_management.create` — 2
- `license_appeals.decide` — 1
- `application_management.workflow_action` — 1
- `complaint_management.view` — 1
- `notification_management.view` — 1
- `report_management.export` — 1
- `licensee_management.create` — 1
- `license_management.approve` — 1
- `license_management.create` — 1
- `fee_management.edit` — 1
- `prudential_supervision.view` — 1
- `role_management.edit` — 1
- `rule_engine.edit` — 1
- `support_management.assign` — 1
- `support_management.close` — 1
- `enforcement_management.edit` — 1
- `fit_and_proper.edit` — 1
- `fit_and_proper.workflow_action` — 1
- `ai_management.approve` — 1
- `registration_management.approve` — 1

Every `module.action` pair is validated against the live `public.permissions` catalogue; mutating actions never resolve to a `view` permission (module-specific mutation fallbacks: market_conduct→manage_complaints, notification_management→dispatch, investigation→manage_evidence_repository).
