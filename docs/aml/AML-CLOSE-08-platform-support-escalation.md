# AML-CLOSE-08 — Platform Support Escalation (F6 reproduction)

Baseline: see `AML-CLOSE-08-infrastructure-stall-support-pack.md` (F1: REST peak 19.19 s, Auth 504 after 45.4 s, pooler `EAUTHQUERY auth_query secret check timed out`).

## New reproduction — 2026-10-07 (AML-CLOSE-08F6, Spec 15 run 3)
- Window: run 3 19:16:51–19:22:38 UTC; anomaly sample **19:20:11 UTC**.
- Probe: anonymous `GET /rest/v1/regulators?select=id&limit=1`, ~4 s interval, 15 s client timeout.
- Result: HTTP 200 after **7.60 s** (stop limit 5 s). Other elevated samples in run 3: 4.80 s (19:18:05), 4.09 s (19:22:06), 2.32 s (19:21:05). Run 2 peak 4.50 s (19:16:06). Run 1 peak 0.19 s.
- 5xx: 0. Auth/login failures: 0. Test runner not blocked (Spec 15 9/9 incl. setup/teardown).
- DB at anomaly: 34/60 connections, 0 active client statements, 0 lock waits, longest active SQL 0 s. Slow request therefore not explained by database work.
- Correlation IDs (`sb-request-id`, `cf-ray`): NOT CAPTURED (probe recorded status/time only) — UNKNOWN.
- Gateway/edge, Auth, pooler logs for window: analytics queries returned no rows — NOT EXPOSED / UNKNOWN. `EAUTHQUERY` in window: UNKNOWN.

## Request to provider
Investigate gateway/PostgREST/pooler latency for this project around 2026-10-07 19:16–19:23 UTC (and F1 window), where trivial REST reads took 4–7.6 s while the database was idle.
