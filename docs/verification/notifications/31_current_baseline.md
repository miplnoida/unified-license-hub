# Notifications & Communications — Recalculated Baseline

Generated: 2026-08-03T10:56:02.268Z
Generator: `scripts/notification-closure-report.mjs` (live database queries only)
Approved scope: In-App + Email. SMS is excluded from implementation, testing and every percentage.

## Measures

| Measure | Value |
| --- | --- |
| active event configs | 212 |
| inactive event configs | 2 |
| active no trigger call site | 0 |
| active no recipient rules | 0 |
| active no published version | 0 |
| active never dispatched | 156 |
| active exercised | 56 |
| active exercised versioned | 4 |
| dispatch rows | 826 |
| dispatch versioned | 38 |
| dispatch legacy unversioned | 788 |
| dispatch fallback rendered | 0 |
| dispatch unresolved placeholder rows | 0 |
| dispatch rendered token leak | 1 |
| dispatch poisoned | 0 |
| notifications rows | 963 |
| notifications route resolved | 32 |
| notifications route resolvable legacy | 750 |
| notifications route legacy none | 181 |
| correspondence threads | 0 |
| correspondence messages | 0 |
| escalations | 13 |
| escalation tier events | 13 |
| queue rows | 12 |
| template versions | 419 |
| event channel bindings | 398 |

## Delivery records by channel and status

| Channel | Status | Count |
| --- | --- | --- |
| email | sent | 390 |
| in_app | delivered | 28 |
| in_app | sent | 408 |

## Event queue by status

| Status | Count |
| --- | --- |
| dispatched | 12 |

## Audit records by action (notification domain)

| Action | Count |
| --- | --- |
| NOTIFICATION_CREATED | 56 |

Machine-readable copy: `31_current_baseline.csv`.
