-- ===========================================================================
-- OS-02D defect fix: work-item provenance must name the underlying record.
-- ===========================================================================
DO $mig$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'supervisory_monitoring_provenance'
     AND pronamespace = 'public'::regnamespace;
  _def := replace(_def,
    E'\'source_table\',\'supervisory_work_item\',\'source_id\',NULL,',
    E'\'source_table\',COALESCE(w.source_object,\'supervisory_work_item\'),\'source_id\',w.source_id,');
  EXECUTE _def;
END $mig$;

-- ===========================================================================
-- 1. Signal identity, occurrence and lifecycle on the canonical signal object
-- ===========================================================================
ALTER TABLE public.supervisory_signal
  ADD COLUMN IF NOT EXISTS detector_code       text,
  ADD COLUMN IF NOT EXISTS fingerprint         text,
  ADD COLUMN IF NOT EXISTS first_detected_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_detected_at    timestamptz,
  ADD COLUMN IF NOT EXISTS occurrence_count    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS state               text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS resolved_at         timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_reason   text,
  ADD COLUMN IF NOT EXISTS source_table        text,
  ADD COLUMN IF NOT EXISTS source_id           uuid,
  ADD COLUMN IF NOT EXISTS source_reference    text,
  ADD COLUMN IF NOT EXISTS observed_value      numeric,
  ADD COLUMN IF NOT EXISTS threshold_value     numeric,
  ADD COLUMN IF NOT EXISTS comparator          text,
  ADD COLUMN IF NOT EXISTS materiality_reason  text,
  ADD COLUMN IF NOT EXISTS config_provenance   jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.supervisory_signal
   SET first_detected_at = COALESCE(first_detected_at, detected_at),
       last_detected_at  = COALESCE(last_detected_at, detected_at);

ALTER TABLE public.supervisory_signal
  ALTER COLUMN first_detected_at SET DEFAULT now(),
  ALTER COLUMN last_detected_at  SET DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.supervisory_signal
    ADD CONSTRAINT supervisory_signal_state_chk
    CHECK (state IN ('OPEN','RESOLVED')
           AND (state <> 'RESOLVED' OR resolved_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.supervisory_signal
    ADD CONSTRAINT supervisory_signal_occurrence_chk CHECK (occurrence_count >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Provenance stays mandatory; a governed detector proves it by naming the
-- canonical source table and record it read.
ALTER TABLE public.supervisory_signal DROP CONSTRAINT IF EXISTS supervisory_signal_provenance_chk;
ALTER TABLE public.supervisory_signal
  ADD CONSTRAINT supervisory_signal_provenance_chk CHECK (
    prudential_ewi_alert_id IS NOT NULL
    OR complaint_id IS NOT NULL
    OR conduct_signal_id IS NOT NULL
    OR fp_assessment_id IS NOT NULL
    OR examination_id IS NOT NULL
    OR (source_table IS NOT NULL AND source_id IS NOT NULL)
    OR (source_kind = 'OTHER_GOVERNED_SOURCE' AND external_reference IS NOT NULL)
  );

-- Deterministic identity: one OPEN signal per real underlying condition.
CREATE UNIQUE INDEX IF NOT EXISTS uq_supervisory_signal_open_fingerprint
  ON public.supervisory_signal (fingerprint)
  WHERE fingerprint IS NOT NULL AND state = 'OPEN';

CREATE INDEX IF NOT EXISTS ix_supervisory_signal_entity_domain_state
  ON public.supervisory_signal (entity_id, domain_code, state);
CREATE INDEX IF NOT EXISTS ix_supervisory_signal_detector
  ON public.supervisory_signal (detector_code, state);

-- ===========================================================================
-- 2. Occurrence history (repeat observation is history, never a new condition)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.supervisory_signal_occurrence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id        uuid NOT NULL REFERENCES public.supervisory_signal(id) ON DELETE CASCADE,
  observed_at      timestamptz NOT NULL DEFAULT now(),
  observed_value   numeric,
  threshold_value  numeric,
  severity         text,
  detector_run_id  uuid,
  source_table     text,
  source_id        uuid,
  source_reference text,
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_supervisory_signal_occurrence_signal
  ON public.supervisory_signal_occurrence (signal_id, observed_at DESC);

GRANT SELECT ON public.supervisory_signal_occurrence TO authenticated;
GRANT ALL ON public.supervisory_signal_occurrence TO service_role;
ALTER TABLE public.supervisory_signal_occurrence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisory_signal_occurrence_read ON public.supervisory_signal_occurrence;
CREATE POLICY supervisory_signal_occurrence_read
  ON public.supervisory_signal_occurrence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_signal s WHERE s.id = signal_id));

-- ===========================================================================
-- 3. Governed detector register (configuration ownership + effective dating)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.supervisory_detector (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL,
  name               text NOT NULL,
  description        text,
  domain_code        text NOT NULL CHECK (public.supervisory_domain_valid(domain_code)),
  source_object      text NOT NULL,
  source_kind        text NOT NULL,
  config_owner       text NOT NULL,
  execution_mode     text NOT NULL CHECK (execution_mode IN ('EVENT','SCHEDULED','DERIVED')),
  default_severity   text NOT NULL DEFAULT 'medium',
  params             jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_resolve       boolean NOT NULL DEFAULT true,
  is_active          boolean NOT NULL DEFAULT true,
  version            integer NOT NULL DEFAULT 1,
  effective_from     date NOT NULL DEFAULT CURRENT_DATE,
  effective_to       date,
  regulator_id       uuid REFERENCES public.regulators(id),
  created_by         uuid REFERENCES auth.users(id),
  updated_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);
CREATE INDEX IF NOT EXISTS ix_supervisory_detector_active
  ON public.supervisory_detector (is_active, effective_from);

GRANT SELECT ON public.supervisory_detector TO authenticated;
GRANT ALL ON public.supervisory_detector TO service_role;
ALTER TABLE public.supervisory_detector ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisory_detector_read ON public.supervisory_detector;
CREATE POLICY supervisory_detector_read
  ON public.supervisory_detector FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
           'prudential_supervision.view','aml_supervision.view',
           'market_conduct.run_conduct_analytics','system_configuration.view']));

DROP POLICY IF EXISTS supervisory_detector_write ON public.supervisory_detector;
CREATE POLICY supervisory_detector_write
  ON public.supervisory_detector FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR public.has_any_permission(auth.uid(), ARRAY['system_configuration.edit',
           'system_configuration.create']))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR public.has_any_permission(auth.uid(), ARRAY['system_configuration.edit',
           'system_configuration.create']));

DROP TRIGGER IF EXISTS trg_supervisory_detector_updated_at ON public.supervisory_detector;
CREATE TRIGGER trg_supervisory_detector_updated_at
  BEFORE UPDATE ON public.supervisory_detector
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- 4. Detector run log (idempotency, retries, observable failures, audit)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.supervisory_detector_run (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detector_code      text NOT NULL,
  detector_version   integer,
  trigger_kind       text NOT NULL DEFAULT 'scheduled',
  status             text NOT NULL DEFAULT 'RUNNING'
                     CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  rows_scanned       integer NOT NULL DEFAULT 0,
  signals_created    integer NOT NULL DEFAULT 0,
  signals_updated    integer NOT NULL DEFAULT 0,
  signals_resolved   integer NOT NULL DEFAULT 0,
  error_text         text,
  config_snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by       uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS ix_supervisory_detector_run_code
  ON public.supervisory_detector_run (detector_code, started_at DESC);

GRANT SELECT ON public.supervisory_detector_run TO authenticated;
GRANT ALL ON public.supervisory_detector_run TO service_role;
ALTER TABLE public.supervisory_detector_run ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisory_detector_run_read ON public.supervisory_detector_run;
CREATE POLICY supervisory_detector_run_read
  ON public.supervisory_detector_run FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
           'prudential_supervision.view','aml_supervision.view',
           'market_conduct.run_conduct_analytics','system_configuration.view']));
