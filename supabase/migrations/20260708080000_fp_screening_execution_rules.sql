-- ─────────────────────────────────────────────────────────────────────────────
-- Automatic Screening Execution configuration
--
-- Lets admins map a business trigger event (e.g. "declaration received for
-- assessment type X") to a screening process (fp_screening_configs row) that
-- should run automatically when that event occurs. New trigger_event values
-- can be added later (e.g. via a follow-up ALTER of the CHECK constraint)
-- without changing this table's shape.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fp_screening_execution_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('declaration_received', 'board_member_added', 'director_added')),
  -- Used when trigger_event = 'declaration_received'; NULL matches any assessment type.
  assessment_type TEXT,
  -- Used when trigger_event IN ('board_member_added', 'director_added'); NULL matches any sector.
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  screening_config_id UUID NOT NULL REFERENCES public.fp_screening_configs(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_screening_execution_rules TO authenticated;
GRANT ALL ON public.fp_screening_execution_rules TO service_role;
ALTER TABLE public.fp_screening_execution_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fp_ser_trigger
  ON public.fp_screening_execution_rules(trigger_event, assessment_type, sector_id)
  WHERE is_active = true;

DROP POLICY IF EXISTS "authenticated read fp screening execution rules" ON public.fp_screening_execution_rules;
CREATE POLICY "authenticated read fp screening execution rules"
  ON public.fp_screening_execution_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff manage fp screening execution rules" ON public.fp_screening_execution_rules;
CREATE POLICY "staff manage fp screening execution rules"
  ON public.fp_screening_execution_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE OR REPLACE FUNCTION public._fp_ser_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_fp_ser_touch ON public.fp_screening_execution_rules;
CREATE TRIGGER trg_fp_ser_touch BEFORE UPDATE ON public.fp_screening_execution_rules
  FOR EACH ROW EXECUTE FUNCTION public._fp_ser_touch();

-- Allow a run_type of 'auto' for screening runs kicked off by these rules.
ALTER TABLE public.fp_screening_runs DROP CONSTRAINT IF EXISTS fp_screening_runs_run_type_check;
ALTER TABLE public.fp_screening_runs ADD CONSTRAINT fp_screening_runs_run_type_check
  CHECK (run_type = ANY (ARRAY['initial'::text, 'manual'::text, 'manual_rerun'::text, 'monitoring'::text, 'ai_media'::text, 'scheduled'::text, 'auto'::text]));
