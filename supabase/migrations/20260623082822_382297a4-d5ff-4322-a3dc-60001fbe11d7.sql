
CREATE TABLE public.application_ai_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  model_provider text NULL,
  model_name text NULL,
  rule_check_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  routing_recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NULL,
  missing_information jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score numeric NULL,
  source_payload_hash text NULL,
  prompt_version text NOT NULL DEFAULT 'v1',
  error_message text NULL,
  generated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_application_ai_assessments_application_id
  ON public.application_ai_assessments(application_id);
CREATE INDEX idx_application_ai_assessments_created_at
  ON public.application_ai_assessments(created_at DESC);

GRANT SELECT ON public.application_ai_assessments TO authenticated;
GRANT ALL ON public.application_ai_assessments TO service_role;

ALTER TABLE public.application_ai_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff can view AI assessments"
  ON public.application_ai_assessments
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'analyst'::app_role)
    OR public.has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE OR REPLACE FUNCTION public.set_application_ai_assessments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_application_ai_assessments_updated_at
  BEFORE UPDATE ON public.application_ai_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_application_ai_assessments_updated_at();
