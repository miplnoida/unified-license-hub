
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL DEFAULT 'application',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage workflow templates"
ON public.workflow_templates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read workflow templates"
ON public.workflow_templates
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.touch_workflow_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_workflow_templates_updated_at
BEFORE UPDATE ON public.workflow_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_workflow_templates_updated_at();
