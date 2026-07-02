
ALTER TABLE public.complaint_types
  ADD COLUMN IF NOT EXISTS sla_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS licensee_id UUID REFERENCES public.licensees(id),
  ADD COLUMN IF NOT EXISTS enforcement_action_id UUID REFERENCES public.enforcement_actions(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='complaints_severity_chk') THEN
    ALTER TABLE public.complaints ADD CONSTRAINT complaints_severity_chk
      CHECK (severity IN ('low','medium','high','critical'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.complaint_investigation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_investigation_tasks TO authenticated;
GRANT ALL ON public.complaint_investigation_tasks TO service_role;
ALTER TABLE public.complaint_investigation_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage complaint tasks" ON public.complaint_investigation_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer') OR has_role(auth.uid(),'analyst'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer') OR has_role(auth.uid(),'analyst'));
CREATE TRIGGER trg_complaint_tasks_updated BEFORE UPDATE ON public.complaint_investigation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.complaint_correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound','internal_note')),
  subject TEXT,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  author_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_correspondence TO authenticated;
GRANT ALL ON public.complaint_correspondence TO service_role;
ALTER TABLE public.complaint_correspondence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage complaint correspondence" ON public.complaint_correspondence
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer') OR has_role(auth.uid(),'analyst'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer') OR has_role(auth.uid(),'analyst'));
CREATE POLICY "Complainant reads own correspondence" ON public.complaint_correspondence
  FOR SELECT TO authenticated
  USING (
    direction <> 'internal_note'
    AND EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.complainant_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.complaint_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  file_upload_id UUID REFERENCES public.file_uploads(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  description TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_evidence TO authenticated;
GRANT ALL ON public.complaint_evidence TO service_role;
ALTER TABLE public.complaint_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage complaint evidence" ON public.complaint_evidence
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer') OR has_role(auth.uid(),'analyst'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer') OR has_role(auth.uid(),'analyst'));

CREATE INDEX IF NOT EXISTS idx_complaint_tasks_complaint ON public.complaint_investigation_tasks(complaint_id);
CREATE INDEX IF NOT EXISTS idx_complaint_corr_complaint ON public.complaint_correspondence(complaint_id);
CREATE INDEX IF NOT EXISTS idx_complaint_evidence_complaint ON public.complaint_evidence(complaint_id);
