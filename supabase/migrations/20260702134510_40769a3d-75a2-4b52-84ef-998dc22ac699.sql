
-- 4.3 Inspection scheduling + findings
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS lead_inspector_id uuid REFERENCES auth.users(id);

-- Backfill scheduled_date from date_conducted where missing
UPDATE public.inspections
   SET scheduled_date = date_conducted
 WHERE scheduled_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_inspections_scheduled_date ON public.inspections(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections(status);

CREATE TABLE IF NOT EXISTS public.inspection_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  description text NOT NULL,
  recommended_action text,
  follow_up_owner text,
  follow_up_due date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  escalated_enforcement_id uuid REFERENCES public.enforcement_actions(id) ON DELETE SET NULL,
  escalated_at timestamptz,
  escalated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_findings TO authenticated;
GRANT ALL ON public.inspection_findings TO service_role;

ALTER TABLE public.inspection_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read inspection findings"
  ON public.inspection_findings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert inspection findings"
  ON public.inspection_findings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update inspection findings"
  ON public.inspection_findings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete inspection findings"
  ON public.inspection_findings FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inspection_findings_inspection ON public.inspection_findings(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_findings_open ON public.inspection_findings(status) WHERE status <> 'closed';

CREATE OR REPLACE FUNCTION public.update_inspection_findings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspection_findings_updated_at ON public.inspection_findings;
CREATE TRIGGER trg_inspection_findings_updated_at
  BEFORE UPDATE ON public.inspection_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_inspection_findings_updated_at();
