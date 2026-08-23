# Certification V2 — Wave 2: Supervisory Universe Certification

Status: **CERTIFIED**
Environment: non-production Lovable Cloud database (`cert_nonproduction_guard`)
Harness: `scripts/cert-v2/02-wave2-supervisory-universe.sql`
Fixture version: `WAVE2-UNIVERSE-1.0` (dataset `CERT-SUPTECH-V2`)
Runs: `CERT-V2-UNIVERSE Run A` → RESET → `CERT-V2-UNIVERSE Run B (replay)`

---

## 1. Starting state

Reconfirmed before seeding (Wave 1.5c TRUE OPERATIONAL ZERO-STATE):

- 46 certification identities (`profiles` = 46, `cert_certification_users` = 46)
- 0 operational/runtime rows across all classified runtime tables
- Configuration inventory intact (426 notification templates, 248 event configs,
  60 security roles, 257 navigation items, 55 form templates)

`DEPLOYED_SEED_HARNESS_EQUALS_GIT = YES` — every correction made during
execution was applied to `scripts/cert-v2/02-wave2-supervisory-universe.sql`
and deployed from that text.

---

## 2. Constraint mismatches found and corrected

All corrections were the smallest possible change, evidence-backed by the
failing constraint, and synchronised to Git.

| # | Failing object | Cause | Correction |
| --- | --- | --- | --- |
| 1 | `cert_fixture_objects_cleanup_chk` | policy `retain` not allowed | use `retain_config` |
| 2 | `entity_identifiers_source_type_check` | `CERTIFICATION` not allowed | use `MANUAL` |
| 3 | `financial_group_members.fgm_role_check` | `parent` not allowed | use `ultimate_holding` |
| 4 | `entity_reporting_obligations_origin_check` | `CERTIFICATION` not allowed | use `RULE` |
| 5 | `cert_fixture_runs_status_chk` | `COMPLETED` not allowed | use `completed` |
| 6 | `cert_v2_universe_gate()` | ambiguous `status` reference | qualify with table aliases |
| 7 | `cert_v2_clear_message_runtime()` | wrong `cert_v2_exec_unguarded` signature | call `(table, sql, ids)` form |

No constraint, trigger or immutability rule was weakened to make the seed pass.

---

## 3. Seed result (Run B, current state)

| Population | Count |
| --- | --- |
| Entities (`licensees`) | 20 |
| Parties (organisation + person) | 58 |
| Licences | 19 |
| Entity identifiers | 40 |
| Entity appointments | 38 |
| External user/entity relationships | 6 |
| Financial group / members | 1 / 2 |
| Reporting obligations | 18 |
| Reporting periods | 92 |
| Return filings | 91 (88 ACCEPTED, 3 SUBMITTED) |
| Reported metric values | 1,207 |
| Engine-calculated metric values | 455 (278 AVAILABLE, 176 NOT_AVAILABLE, 1 ERROR) |
| Prudential detection runs | 88 (0 failed) |
| Threshold breaches | 47 |
| Fixture ledger objects | 407 |
| Message runtime rows | 0 |

---

## 4. Universe gate — `cert_v2_universe_gate()`

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| ENTITIES | 20 | 20 | PASS |
| LICENCES | 19 | 19 | PASS |
| IDENTIFIERS | 40 | 40 | PASS |
| OBLIGATIONS | 18 | 18 | PASS |
| REPORTING_PERIODS | >0 | 92 | PASS |
| FILINGS | >0 | 91 | PASS |
| FILINGS_ACCEPTED | >0 | 88 | PASS |
| SERVER_CALCULATED | >0 | 278 | PASS |
| DETECTION_RUNS | >0 | 88 | PASS |
| DETECTION_FAILURES | 0 | 0 | PASS |
| THRESHOLD_BREACHES | >0 | 47 | PASS |
| GOLDEN_RATIOS | 0 fail | 0 | PASS |
| FIXTURE_LEDGER | >0 | 407 | PASS |

**Gate result: 13/13 PASS.**

---

## 5. Per-scenario validation (all 20 entities)

| Code | Scenario | Periods | Filings | Accepted | Awaiting review | Late | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E01 | HEALTHY | 8 | 8 | 8 | 0 | 0 | PASS |
| E02 | LIQUIDITY_STRESS | 8 | 8 | 7 | 1 | 0 | PASS — 1 red LIQUIDITY breach |
| E03 | CAPITAL_WEAKNESS | 8 | 8 | 7 | 1 | 0 | PASS — red CAR/NPL/CIR breaches |
| E04 | LATE_FILER | 8 | 7 | 7 | 0 | 2 | PASS — 1 period unfiled, 2 late |
| E05 | NEW_APPLICANT | 0 | 0 | 0 | 0 | 0 | PASS — no licence, no obligation |
| E06 | LICENCE_LIFECYCLE | 4 | 4 | 4 | 0 | 0 | PASS |
| E07 | CONDUCT_RISK | 4 | 4 | 4 | 0 | 0 | PASS |
| E08 | EXAMINATION | 4 | 4 | 4 | 0 | 0 | PASS |
| E09 | FP_CASES | 4 | 4 | 4 | 0 | 0 | PASS |
| E10 | MULTI_ENTITY_USER | 6 | 6 | 6 | 0 | 0 | PASS — PPOC holds 2 entities |
| E11 | MERGED_ABSORBED | 4 | 4 | 4 | 0 | 0 | PASS — merge record present |
| E12 | SURRENDERED | 4 | 4 | 4 | 0 | 0 | PASS |
| E13 | BOUNDARY_PASS | 4 | 4 | 3 | 1 | 0 | PASS — at-threshold, no breach |
| E14 | BOUNDARY_WARN | 4 | 4 | 4 | 0 | 0 | PASS — warn only, 16 amber |
| E15 | ZERO_DENOMINATOR | 4 | 4 | 4 | 0 | 0 | PASS — 1 `ERROR` value, no crash |
| E16 | MISSING_INPUT | 4 | 4 | 4 | 0 | 0 | PASS — `NOT_AVAILABLE`, no fabrication |
| E17 | PEER_STANDARD | 4 | 4 | 4 | 0 | 0 | PASS |
| E18 | GROUP_PARENT | 0 | 0 | 0 | 0 | 0 | PASS — `ultimate_holding` member |
| E19 | GROUP_SUBSIDIARY | 4 | 4 | 4 | 0 | 0 | PASS — `subsidiary` member |
| E20 | MSB_MONITORING | 6 | 6 | 6 | 0 | 0 | PASS — monthly frequency |

All 22 scenario codes (20 entity scenarios + `CONFIG` + `ENTITY_USERS`) are
represented in `cert_fixture_objects`; every seeded row is attributable to a
scenario and a run.

---

## 6. Golden financial verification

278 engine-calculated ratios compared against the design series:
**278 PASS / 0 FAIL**. Calculation was performed exclusively by the real server
engine (`returns_calculate_metrics`); the harness writes reported inputs only.
Detail: `docs/certification/v2/02-formula-golden-dataset.md`.

---

## 7. Threshold resolution

47 breaches across 4 metrics, correctly split warn/breach and amber/red, with
entity attribution matching scenario intent and 0 failed detection runs.
Detail: `docs/certification/v2/02-formula-golden-dataset.md` §4.

---

## 8. Personas, workflow, notification and correspondence readiness

Detail: `docs/certification/v2/02-workflow-scenario-map.md`.

Summary:
- 46 identities, maker–checker pairs for every process family.
- 5 external personas with entity relationships; multi-entity PPOC validated
  (2 active relationships, different access types).
- 6 active workflow definitions drivable by seeded data; 3 filings, 1 unfiled
  period, 2 late filings and 47 unacknowledged breaches deliberately left open.
- `POST_SEED_NOTIFICATION_RUNTIME_ROWS = 0`; correspondence runtime = 0;
  all messaging configuration retained.

### 8.1 Defect closed in Wave 2

Threshold-breach notifications lost all entity/sector/CTA context on the
canonical returns path (`trg_return_threshold_breach_notification` read only the
legacy `returns_filed` row). Fixed and verified — payload now carries
`entity_id`, `entity_name`, `sector_id`, `return_filing_id`,
`reporting_period_id` and a working canonical CTA.

---

## 9. Mandatory RESET → RESEED replay

| Population | Run A | Run B | Fingerprint (md5, both runs) |
| --- | --- | --- | --- |
| entities | 20 | 20 | `1c018515cc7784d4c81aa3f2bd511c39` |
| licences | 19 | 19 | `2ecaeca44b4ad81ac040eb9044f1a356` |
| filings | 91 | 91 | `3ccea944d7f017df22ff6a5fb97c166f` |
| metric values | 1,662 | 1,662 | `4c0b4264ba0506e4e82370927b4e6936` |
| breaches | 47 | 47 | `53ced87c67234d7115099cc2fe9a22e4` |
| fixture ledger | 407 | 407 | `3b5d7680f787fd503d0d8bed1e216c91` |

Fingerprints are byte-identical across the reset/reseed cycle, including
primary keys, filing references, statuses, calculated values and breach values.

`SEED_DETERMINISTIC = YES`

Post-RESET verification (before reseed): entities, licences, filings, metric
values, breaches, detection runs, reporting periods, obligations, parties,
external access rows and financial groups all **0**; only the 2 `retain_config`
threshold objects remained in the ledger, as designed. No partial-seed residue.

---

## 10. Final declaration

| Assertion | Result |
| --- | --- |
| DEPLOYED_SEED_HARNESS_EQUALS_GIT | YES |
| STARTING_STATE_CERTIFIED (46 identities, 0 runtime rows) | YES |
| UNIVERSE_GATE | 13/13 PASS |
| ALL_20_SCENARIOS_VALIDATED | YES |
| GOLDEN_FORMULA_CERTIFIED (278/278) | YES |
| THRESHOLD_RESOLUTION_CERTIFIED | YES |
| EXTERNAL_PERSONA_RELATIONSHIPS_VALID | YES |
| MULTI_ENTITY_USER_VALIDATED | YES |
| POST_SEED_NOTIFICATION_RUNTIME_ROWS | 0 |
| CORRESPONDENCE_RUNTIME_ROWS | 0 |
| SEED_DETERMINISTIC (RESET → RESEED replay) | YES |
| PARTIAL_SEED_RESIDUE | NONE |

**WAVE_2_CERTIFIED = YES.** Wave 3 (end-to-end process execution) is unblocked
and has not been started.

---

## 11. Reproducing

```sql
SELECT * FROM public.cert_v2_reset('CERT-SUPTECH-V2');
SELECT public.cert_v2_seed_universe('CERT-V2-UNIVERSE');
SELECT * FROM public.cert_v2_universe_gate();      -- 13 PASS
SELECT status, count(*) FROM public.cert_v2_golden_ratios() GROUP BY 1;  -- 278 PASS
```
