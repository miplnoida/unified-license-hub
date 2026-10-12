## Verification
- **Byte-identical output:**
  - The streamed CSV must exactly match the existing `toCsv` output on the baseline fixtures.
  - It must also match on formula cells, quotes, commas, newlines, JSON, unicode and empty values.
- **Paging tests:**
  - Keyset order with tied `created_at` values: no duplicates and no gaps.
  - Edge sizes: 0, 1,000, 1,001, the 100,000-row limit, and limit+1 (marked truncated).
  - Rows inserted during the export are excluded by `snapshot_at`.
  - A page error marks the job failed.
- **Benchmarks** with realistic compliance rows (about 2.3 KB, matching the live average):
  - Sizes: 1,000, 20,000, 74,000 and 100,000 rows.
  - Measured: peak RSS, heap, elapsed time and output size, for both the old method and the new one.
  - Database latency is simulated per page. Live round-trip time is estimated from read-only `EXPLAIN` on the keyset query.
- **Time limits:**
  - Compare the projected time against the published Edge Function limits: wall-clock, CPU time and memory.
  - If the 100,000-row export cannot fit safely, stop and propose alternatives, such as a lower limit or a split export, without building them.
- **Regression and compatibility:**
  - Full Vitest suite, app typecheck, function typecheck and build.
  - The Audit Export screen renders both old and new job records.

## Report
Update `docs/audit/phase1-predeployment-readiness.md` with:
- the root cause and the files changed,
- before and after measurements,
- evidence that the output is correct and the test results,
- remaining risks: hard kill leaving a job running, no true snapshot, a large upload over a slow network,
- a GO or NO-GO recommendation.

Nothing is deployed. Phase 1 is not marked complete.
