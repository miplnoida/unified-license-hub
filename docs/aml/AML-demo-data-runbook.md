# AML/CFT demonstration data runbook

Non-production only. Every script refuses to run on a production deployment.

The demonstration dataset is **permanent, not disposable**: once a governed AML/CFT risk movement is
recorded for a demo entity, the platform's append-only risk history makes removal impossible without
bypassing an immutability guard. Full reversibility is therefore **not** claimed.

## Modes

| Mode | Command | Behaviour |
|------|---------|-----------|
| BOOTSTRAP | `psql -X -q -f scripts/demo/seed-aml-demo-dataset.sql` | Creates the 24 demo institutions, canonical licences, supervision assignments and perimeter determinations once. Registry and licence fixtures are pure upserts. When immutable risk movements already exist the governed pipeline is skipped instead of duplicated. |
| REFRESH | `psql -X -q -f scripts/demo/seed-aml-demo-current-workflow.sql` | Adds only the missing additive current-workflow scenarios, keyed by fixture key. Convergent: a second run creates nothing. |
| VERIFY | `psql -X -q -f scripts/demo/verify-aml-demo.sql` | Rollback-only behavioural integrity gates `INTEGRITY-00 … 18` and `CURRENT-01 … 06`. |
| CLEANUP-PREFLIGHT | `psql -X -q -f scripts/demo/cleanup-aml-demo-dataset.sql` inside an explicit `BEGIN; … ROLLBACK;` | Reports whether complete removal is possible. |
| CLEANUP | `psql -X -q -f scripts/demo/cleanup-aml-demo-dataset.sql` | Removes the entire fixture, or removes **nothing** and reports a blocked result when immutable dependent history exists. Partial cleanup is impossible by construction. |

## Proven properties

- BOOTSTRAP is convergent — re-running leaves the published dataset unchanged.
- REFRESH is convergent — second run reported `0 created, 5 already present`.
- CLEANUP refusal is atomic — the rehearsal emitted the refusal notice and left all 24 demo
  institutions, 22 risk states and 25 risk movements intact.
- Immutable history is preserved — no risk movement, approval decision, publication record or audit
  entry is ever updated or deleted.

## What the scripts never do

Disable foreign keys, triggers or RLS; weaken constraints; write directly to a table that has a
governed operation; backdate technical timestamps; touch the operational AML/CFT methodology
(v1.0 ACTIVE, v1.1 DRAFT / MIPL_REFERENCE); create or activate a calculation policy.
