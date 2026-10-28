# Monitoring review — 2026-10-28

## Result
Nine confirmed findings corrected; two stale findings and one false-positive cause resolved; four confirmed issues remain for approval. No app publication, security scan, AML certification, policy changes, or protected-record writes.

| # | Finding | Outcome / direct evidence |
|---|---|---|
| 1 | Overdue conduct actions | Fixed: schema-qualified pgcrypto SHA-1 keeps the existing dedupe algorithm. Rolled-back trigger regression exposed additional CHECK rejections of `action_overdue` and `overdue_trigger`; additive vocabulary correction applied. Worker no longer attempts a second invalid alert insert with a different key. Regression proves overdue marking, one alert after repeated updates, and terminal preservation. Worker deployed; scheduled execution not invoked. |
| 2 | Registration upload verification | Confirmed, pending security-aware journey redesign. Current page binds journey email only when verified; default OTP is on declarations; disabled/update-mode OTP excludes verification UI, while issue requires a registration OTP from last 24 hours. Verification was not bypassed. |
| 3 | AML entity links | Fixed in all three client link sites using canonical `/entities/:id`. Authorized Super Admin browser opened an entity from portfolio and due-review lists successfully. Historical SQL response routes were not rewritten; current consumers no longer use those entity URLs. |
| 4 | Methodology question edit | Stale: current dialog seeds and submits response_options, requires_observation, sort_order and exposes their controls. No change. |
| 5 | Risk recompute import boot failure | Claimed cause false-positive: installed 2.95.3 exports `./cors`; hosted 2026-10-28 logs show successful boots (31–80ms). Historical 503 cause and successful recomputation remain unverified, not claimed resolved. No change. |
| 6 | Executive AI RPC | Fixed argument names `_window_days` and `_sector_id`; isolated executable fact-assembly regression proves caller-scoped client and exact arguments. Function deployed; complete paid AI generation not invoked, hosted logs absent. |
| 7 | Billing amounts | Fixed using existing governed base-currency fallback because hosted fee_components has **no currency column**. Totals sum raw numeric amounts rather than formatted strings. Configured-currency regression passes. Billing component pages are not currently routed; no browser claim for these pages. Payment status heuristics unchanged. |
| 8 | Returns governed writes registry | Stale: hosted registry contains all six named tables, each bound to returns_management. No registry or permissions changed. |
| 9 | Scan lifecycle dispatch | Confirmed missing queue bridge: current upload paths write pending_scan; hosted file_uploads has audit and scan-guard triggers only, no enqueue trigger; queue worker needs external provider. Scanner commissioning/configuration not verified; fail-closed release retained. |
| 10 | Expired-licence renewal | Confirmed: current create_application_draft uses can_act_on_specific_license → entity_license_entitlements new-activity eligibility, excluding past-grace licences; UI starts external renewal only past grace. Requires a renewal-only server authorization design, not a blanket entitlement relaxation. |
| 11 | Board Pack statuses | Fixed: paged RLS-scoped records counted exhaustively, errors no longer become zero. Browser: licences 119=116+1+2, applications 56=19+19+4+12+2, returns 96=91+2+1+2, complaints 22=11+7+4, findings 9=7+2. |
| 12 | Catalogue render loops | Fixed: undefined catalogues do not allocate dependency arrays or initialize policy rows; isolated loading/unavailable component tests pass. No calculation, policy or assessment mutation. |
| 13 | Missing supervision menu | Confirmed: hosted navigation has portfolio intelligence but neither cited detection/management assurance record. Route guards use cross-domain supervisory authority; requires aligning DB navigation permission metadata with that authority and package visibility, not hardcoded menu fallback. Pending approval plan. |
| 14 | Examination filters | Fixed read-only alias inclusion without relaxing canonical writes. Hosted rows: 13 full_scope, 2 targeted, 15 TARGETED_ONSITE; browser filters show 13 and 17 rows respectively. |
| 15 | Page-size selector | Fixed controlled/local ownership and inclusion of custom size 15; selector remains available after reducing to one page. Unit test 15→50 passes; real Notification Templates browser selected 50/page successfully. |
| 16 | Examination schedule | Fixed canonical examinations/fieldwork_start and detail links. Authorized browser shows Rodney Bay on October 12 and opens its real examination detail. Only one of 30 existing examinations has fieldwork_start; unscheduled records are not fabricated. Local date keys avoid timezone day shift. |

## Verification
- Targeted Vitest: **54/54**, nine files; no full AML suite or certification runs.
- SQL trigger regression: `supabase/tests/conduct_overdue_digest.sql` completed DO then ROLLBACK; no probe retained.
- Preview compilation: latest available entry **build OK**, 2026-10-28 00:08:42 UTC.
- Browser used injected authorized Super Admin session on localhost, never an assumed applicant/staff session.
- Browser screenshots and scripts under `/tmp/browser/monitoring/`; UI flows listed above verified without mutations.
- Functions deployed: generate-supervisory-ai-analysis and overdue-action-sweep. Frontend not published.

## Remaining approval work
Registration OTP/upload sequencing, malware scan dispatch/provider commissioning, renewal-specific authorization, and database-driven menu registration. These findings remain open. Existing unrelated demo roadmap blockers remain unchanged.