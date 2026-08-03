# Notifications & Communications — Measured Baseline

Generated: 2026-08-03T10:19:54.025Z
Generator: `scripts/notification-trigger-scan.mjs` (queries the live database; no figures copied from earlier documents)
Approved scope: In-App + Email. SMS is excluded from implementation, testing and all percentages.

## Configuration and wiring

| Measure | Value |
| --- | --- |
| active event configs | 212 |
| inactive event configs | 2 |
| active no trigger call site | 0 |
| active wired never dispatched | 156 |
| active invalid recipient rules | 0 |
| active no in app binding | 0 |
| active no email binding | 0 |
| active no published version | 0 |
| dispatch rows | 826 |
| dispatch null template id | 788 |
| dispatch null template version | 788 |
| dispatch fallback rendered | 0 |
| dispatch unresolved placeholders | 1 |
| notifications rows | 963 |
| notifications missing source route | 931 |
| correspondence threads | 0 |
| correspondence messages | 0 |
| escalations | 13 |
| escalation tier events | 13 |
| queue rows | 12 |
| queue pending | 0 |
| queue dead | 0 |
| dispatch poisoned | 0 |
| template versions | 419 |
| event channel bindings | 398 |

## Email delivery records by status

| Status | Count |
| --- | --- |
| sent | 390 |

## Audit records by action (notification domain)

| Action | Count |
| --- | --- |
| NOTIFICATION_CREATED | 56 |

## Active events with no backend trigger call site

None. Every active event has a verified backend call site.

Machine-readable copy: `20_current_baseline.csv`.
