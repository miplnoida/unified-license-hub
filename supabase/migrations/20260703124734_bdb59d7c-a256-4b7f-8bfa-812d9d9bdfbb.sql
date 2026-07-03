
-- 1. Widen subject_type check
ALTER TABLE public.coordination_cases DROP CONSTRAINT IF EXISTS coordination_cases_subject_type_check;
ALTER TABLE public.coordination_cases ADD CONSTRAINT coordination_cases_subject_type_check
  CHECK (subject_type = ANY (ARRAY[
    'application','license','entity','other',
    'complaint','prudential_return','prudential_finding','fp_assessment','enforcement_action'
  ]));

-- 2. Primary regulator column
ALTER TABLE public.coordination_cases
  ADD COLUMN IF NOT EXISTS primary_regulator_id uuid REFERENCES public.regulators(id) ON DELETE SET NULL;

-- 3. Escalations table
CREATE TABLE IF NOT EXISTS public.coordination_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.coordination_cases(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'lead',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  raised_by uuid NOT NULL,
  assigned_to uuid,
  resolution_outcome text,
  resolution_rationale text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coord_esc_tier_check CHECK (tier = ANY (ARRAY['lead','executive','chair','joint_board'])),
  CONSTRAINT coord_esc_status_check CHECK (status = ANY (ARRAY['open','in_review','resolved','withdrawn'])),
  CONSTRAINT coord_esc_outcome_check CHECK (resolution_outcome IS NULL OR resolution_outcome = ANY (ARRAY[
    'cleared','conditionally_cleared','blocked','remitted','withdrawn'
  ]))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordination_escalations TO authenticated;
GRANT ALL ON public.coordination_escalations TO service_role;

ALTER TABLE public.coordination_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read escalations"
  ON public.coordination_escalations FOR SELECT
  TO authenticated
  USING (
    is_coordination_participant(case_id, auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Participants raise escalations"
  ON public.coordination_escalations FOR INSERT
  TO authenticated
  WITH CHECK (
    raised_by = auth.uid()
    AND (is_coordination_participant(case_id, auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Raiser assignee owner or admin update"
  ON public.coordination_escalations FOR UPDATE
  TO authenticated
  USING (
    raised_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM public.coordination_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admin deletes escalations"
  ON public.coordination_escalations FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_coord_esc_case ON public.coordination_escalations(case_id, status);
CREATE INDEX IF NOT EXISTS idx_coord_esc_assignee ON public.coordination_escalations(assigned_to) WHERE assigned_to IS NOT NULL;

-- 4. Trigger: touch updated_at + require rationale on resolve/withdraw + stamp resolver
CREATE OR REPLACE FUNCTION public.coord_escalation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status IN ('resolved','withdrawn') AND
     (OLD IS NULL OR OLD.status <> NEW.status) THEN
    IF NEW.resolution_rationale IS NULL OR length(trim(NEW.resolution_rationale)) < 10 THEN
      RAISE EXCEPTION 'Resolution rationale (min 10 chars) required when marking an escalation as % ', NEW.status;
    END IF;
    IF NEW.resolved_at IS NULL THEN NEW.resolved_at := now(); END IF;
    IF NEW.resolved_by IS NULL THEN NEW.resolved_by := auth.uid(); END IF;
    IF NEW.status = 'resolved' AND NEW.resolution_outcome IS NULL THEN
      RAISE EXCEPTION 'Resolution outcome required when marking an escalation as resolved';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coord_escalation_lifecycle ON public.coordination_escalations;
CREATE TRIGGER trg_coord_escalation_lifecycle
  BEFORE INSERT OR UPDATE ON public.coordination_escalations
  FOR EACH ROW EXECUTE FUNCTION public.coord_escalation_lifecycle();

-- 5. Seed ABC_PRUDENTIAL and FSC_CONDUCT (idempotent)
INSERT INTO public.regulators (code, name, description, status)
VALUES
  ('ABC_PRUDENTIAL', 'ABC Prudential Authority', 'Prudential regulator (Twin Peaks — safety & soundness)', 'active'),
  ('FSC_CONDUCT', 'FSC Conduct Authority', 'Market conduct regulator (Twin Peaks — consumer & market conduct)', 'active')
ON CONFLICT (code) DO NOTHING;
