# Fix: FP screening run insert violates run_type check

## Root cause
`fp_screening_runs.run_type` has a CHECK constraint that only allows:
`'initial' | 'manual_rerun' | 'monitoring'`

But the code inserts values outside that set:
- `FpScreeningPanel.tsx` calls the edge function with `run_type: 'manual'` → hits constraint error (the error you're seeing).
- `fp-ai-media-ingest/index.ts` inserts `run_type: 'ai_media'` → also would fail.
- `fp-monitoring-sweep` uses `'monitoring'` (OK).

## Fix
Widen the DB check constraint to match the values the app actually uses, rather than changing every call site (safer, backward-compatible).

### Migration
Drop and recreate the check constraint on `public.fp_screening_runs.run_type` to allow:
`'initial', 'manual', 'manual_rerun', 'monitoring', 'ai_media', 'scheduled'`

No data changes; no other tables touched. No other modules affected.

## Verification
- Trigger a manual screening run from the FP Screening panel → row inserts, status transitions to `completed`.
- Trigger AI adverse-media ingest → run row inserts with `run_type = 'ai_media'`.
- Existing monitoring sweep continues to work unchanged.
