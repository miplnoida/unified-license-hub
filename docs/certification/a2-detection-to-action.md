# Package A2 — Prudential Detection-to-Action Certification

Engine version: `a2.canonical.v1` · Detection is triggered only by acceptance of a
canonical return filing version. No manual seeding of breaches, warnings or actions.

## 1. Frozen detection semantics

| Element | Definition |
| --- | --- |
| Trigger | `tg_prudential_detect_on_acceptance` on canonical filing acceptance |
| Run register | `prudential_detection_runs` (engine version + full threshold/EWI snapshot per run) |
| Threshold resolution | `prudential_resolve_threshold` — exact, case-sensitive metric key match, versioned |
| Outcome register | `return_threshold_breaches`, append-only, unique per `(detection_run_id, regulatory_metric_id, level)` |
| Authoritative surface | `public.v_prudential_current_breaches` — latest completed run per filing version, withdrawn filings excluded |
| Acknowledgement | `return_threshold_breach_acknowledgements` side-table; outcome rows are never mutated |

Thresholds in force for the certified metrics (version 1):

- `CAPITAL_ADEQUACY_RATIO` — warn below 12.0, breach below 10.0
- `NPL_RATIO` — warn above 5.0, breach above 10.0

## 2. SEED_START_STATE — the three scenarios

All figures below are derived by the engine from accepted canonical filings; none were
written by hand.

### S1 — Normal (no supervisory consequence)
Entity: **Atlantic Commercial Bank Ltd**

| Filing | Period end | CAR | NPL | Engine outcome |
| --- | --- | --- | --- | --- |
| A2-S1-20260331 | 2026-03-31 | 18.4 | 3.1 | within tolerance, 0 breaches |
| A2-S1-20260630 | 2026-06-30 | within tolerance | within tolerance | 0 breaches |

Detection ran and completed (`status = COMPLETED`, `metrics_evaluated = 2`) and produced
no breach rows — the absence of consequence is itself an engine result, not a gap.

### S2 — Pre-breach early warning
Entity: **Nevis Investment Management Ltd**

| Filing | Period | Metric | Observed | Threshold | Level |
| --- | --- | --- | --- | --- | --- |
| A2-S2-20260930 | A2-S2-Q3 | CAPITAL_ADEQUACY_RATIO | 11.5 | 10.0 (warn 12.0) | warn |

### S3 — Hard breach with deterioration
Entity: **Federation Credit Finance Ltd**

| Filing | Period | Metric | Observed | Threshold | Level |
| --- | --- | --- | --- | --- | --- |
| A2-S3-20260331 | Q1 | CAPITAL_ADEQUACY_RATIO | 11.8 | 10.0 | warn |
| A2-S3-20260331 | Q1 | NPL_RATIO | 6.2 | 10.0 | warn |
| A2-S3-20260630 | Q2 | CAPITAL_ADEQUACY_RATIO | 8.5 | 10.0 | breach |
| A2-S3-20260630 | Q2 | NPL_RATIO | 12.4 | 10.0 | breach |
| A2-S3-20260930 | Q3 | CAPITAL_ADEQUACY_RATIO | 8.2 | 10.0 | breach |
| A2-S3-20260930 | Q3 | NPL_RATIO | 13.1 | 10.0 | breach |

## 3. Supervisory visibility

Assigned prudential supervisor: **Mohit Rana** (supervisory officer of record on all three
entities). Reading `v_prudential_current_breaches` as that supervisor returns exactly the
7 outcome rows above and nothing else. Each row carries entity, filing reference, reporting
period, metric key, observed value, comparator, threshold value and version, detection run
id, detected timestamp and acknowledgement state — with direct links to Entity 360 and to
the specific filing version in the Breach Inbox.

## 4. Governed consequence

| Step | Result |
| --- | --- |
| Acknowledge S2 warn (CAR 11.5) | accepted — monthly capital monitoring recorded |
| Acknowledge S3 breach (CAR 8.2, Q3) | accepted — escalation rationale recorded |
| Acknowledgement note under 10 characters | rejected (`22023`) |
| Re-acknowledging an acknowledged breach | rejected (`55000`, already acknowledged) |
| Supervisory action on S3 breach | issued as **PA-2026-000009**, `capital_restoration_directive`, severity critical, evidence required, due 2026-10-31, response due 2026-10-15, breach after 14 days, linked `source_type = return_breach` → the Q3 CAR breach id |

## 5. Authority certification (negative paths)

| Persona | Read breaches | Acknowledge | Issue action |
| --- | --- | --- | --- |
| Prudential supervisor (assigned) | 7 rows | allowed | allowed |
| Conduct supervisor (other domain) | 0 rows | 403 `prudential_supervision.review_returns` | 403 `prudential_supervision.initiate_supervisory_action` |
| Licensee applicant | 0 rows | 403 | 403 |
| Analyst / auditor | 0 rows | 403 | 403 |

## 6. Audit trail

Every consequence is recorded in `compliance_audit_logs`:

- `WORKFLOW_TRANSITION` on `return_threshold_breach` for each acknowledgement, with metric
  key, level, observed value, threshold value, detection run id and the supervisor's
  rationale as justification.
- `CREATE` on `prudential_action` for PA-2026-000009, with the directive text as
  justification and the acting supervisor as user.

Detection runs themselves are self-auditing: each row stores engine version, trigger kind,
resolved thresholds, per-metric evaluations and counts, so any outcome can be replayed.
