# AML-CLOSE-08 — Infrastructure stall support pack

Prepared 2026-10-07 UTC under AML-CLOSE-08F2. Evidence below is the recorded F1 observation, not a new reproduction. No request-load test, capacity change, publication or external support message was performed in F2.

## A. Architecture constraint
TEST and the published application share one Lovable Cloud managed backend/server. Any compute change affects both; a future experiment requires separate shared-environment authorisation and a low-traffic window.

## B. Idle baseline
F1 source commit `32b0693b9`, 20 samples, 2026-10-07 13:13–13:14 UTC.

| Request | Median | p95 / maximum |
|---|---:|---:|
| site_settings | 104 ms | 184 ms |
| Auth token | 203 ms | 278 ms |
| sec_get_user_context | 161 ms | 412 ms |
| supervisory_dashboard_operational_summary | 757 ms | 1,465 ms |
| sup_dashboard_summary | 468 ms | 649 ms |
| supervisory_work_queue | 513 ms | 783 ms |

Baseline connections 16/60; memory 58% (snapshot). Invalid HTTP-400 comparison probe excluded. Cheap control `GET /rest/v1/regulators?select=id&limit=1`: 20 idle samples at 13:25 UTC, HTTP 200 throughout; median 109 ms, p95 139 ms, maximum 625 ms.

## C. Failure window
All dates below are 2026-10-07 UTC. F1 Spec 12 ran alone: run 1 13:25:42–13:32:15, 9/9 passed; run 2 13:32:28–13:39:19, 9/9 passed; run 3 13:39:25–13:43:09 failed in journey B, with five later tests not run and teardown failure. Third run did not achieve the deterministic gate.

| Window | Observation |
|---|---|
| 13:41:21–13:41:58 | Journey B officer login; token HTTP 200 at 13:41:53 in 1.03 s; cheap reads 0.10–1.06 s |
| 13:42:00 / app reads at 13:42:09 | Cheap REST 15.59 s; profiles 9.72 s; user_dynamic_roles 6.98 s |
| 13:42:19 | New assessment control absent; security context/entitlement/entity/notification calls unfinished at the 20 s page timeout |
| 13:42:20–13:42:48 | Teardown sign-in; cheap REST 4.61, 18.89 and 19.19 s, HTTP 200; Auth token HTTP 504 after 45.4 s |

The source report gives a window, not an independently established completion timestamp for every request. Do not invent more precise event ordering. Cheap control maximum by window: before run 0.15 s; run 1 2.03 s; run 2 4.90 s; run 3 19.19 s.

## D. Database evidence
535 approximately two-second samples, 13:25:12–13:42:48. Peak DB connections 40/60; pool clients 1/200 (health observation, not continuous pool telemetry). No active client statement other than the monitor, no observed long-running SQL and no waits during the failure window. One blocked-session sample occurred at 13:32:00, outside the failure window.

No matching active SQL was observed for the 9.72 s profiles request. Sampling cannot prove zero execution time or the exact upstream layer: short SQL may fall between samples. Cumulative statement statistics include older count queries up to ~8 s; these are not attributable to this window. Post-run health at 13:44: memory 76%, connections 32/60, no exhaustion alert.

## E. Pooler evidence
At **2026-10-07 13:37:30 UTC**, during run 2 (not the final journey B failure), the monitor connection received:

`FATAL (EAUTHQUERY) auth_query secret check timed out`

This is a pooler authentication-lookup timeout. It does not establish PostgreSQL as root cause or expose connection secrets.

## F. Background jobs
103 scheduled executions in 13:24–13:44 succeeded. Maximum observed startup delay 8 s; not attributed to a specific failed request. No job-startup timeout in that window.

## G. Observability gap
Unavailable: CPU/DB CPU time series, I/O/network saturation, gateway queue time, PostgREST concurrency/queue time, Auth internal queue/latency, pooler internal processing, and hidden managed project concurrency/resource limits. Window-specific gateway/Auth/PostgreSQL log queries returned no rows. Memory is two snapshots, not saturation proof. Connections never reached their limit. Internal-service causal attribution remains unknown.

## H. Minimum safe reproduction — documentary only
Not authorised to execute in F2. If separately authorised with support instrumentation: run Spec 12 alone, monitor the cheap read every ~1–2 seconds and sample DB activity, preserve UTC request timings, safe request IDs and redacted traces, and stop at the first stall. Observe TEST/live traffic jointly because the server is shared. Govern TEST fixtures through screens and preserve pinned assessments. Do not introduce parallel suites, resizing or timeout changes without separate approval.

## I. Questions for managed-platform support
1. Which service owns the observed delay before SQL becomes visible?
2. What triggers `EAUTHQUERY auth_query secret check timed out`, and which dependency timed out at 13:37:30 UTC?
3. Were gateway/Auth/PostgREST/pooler requests queued or throttled at 13:37:30 and 13:42:00–13:42:48 UTC?
4. Are there hidden project CPU/request-concurrency/resource limits, and were any reached?
5. Would database compute resizing affect this particular path, or is another managed-service limit responsible?
6. Which logs/metrics expose queue time before SQL and correlate requests across these services?

## Conclusion
**SHARED_PROJECT_CAPACITY (probable) with OBSERVABILITY_GAP. UPGRADE_NOT_YET_JUSTIFIED.** PostgreSQL is not a proven root cause; no saturation metric demonstrates that extra compute relieves the failure path. No capacity change or external communication occurred. AML-CLOSE-08 remains CONDITIONAL PASS.

Evidence source: `AML-CLOSE-08-supervisory-response-actions-sla-escalation.md`, F1 DH–DT; F2 read-only verification and browser cleanup logs `/tmp/browser/aml08f2/`. Local diagnostic paths are evidence locations, not guarantees of permanent support access. Supply redacted raw traces separately if retained and requested; do not share sessions or credentials.
