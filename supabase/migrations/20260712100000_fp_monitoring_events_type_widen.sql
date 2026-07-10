-- ─────────────────────────────────────────────────────────────────────────────
-- fp_monitoring_events.event_type — the "Trigger Event" dialog (and its
--    matching filter dropdown) on /fpa/monitoring has always offered
--    media_alert / complaint / assessment_due / regulatory_notice /
--    self_report — a vocabulary for manually reporting an externally-sourced
--    trigger (a call-in, a media report, a complaint) that was never added
--    to the underlying CHECK constraint. Only 'role_change' of the UI's six
--    options ever overlapped with the real column values
--    (recheck_ok/recheck_hit/condition_due/condition_overdue/role_change/
--    manual_flag, all written by fp-monitoring-sweep and fp-screening-run) —
--    every other manual trigger has always failed with a check violation.
--    Widen the constraint to include the UI's vocabulary rather than gut a
--    screen that's otherwise fully built and demo-script-aligned.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fp_monitoring_events DROP CONSTRAINT IF EXISTS fp_monitoring_events_event_type_check;
ALTER TABLE public.fp_monitoring_events ADD CONSTRAINT fp_monitoring_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'recheck_ok','recheck_hit','condition_due','condition_overdue','role_change','manual_flag',
    'media_alert','complaint','assessment_due','regulatory_notice','self_report'
  ]::text[]));
