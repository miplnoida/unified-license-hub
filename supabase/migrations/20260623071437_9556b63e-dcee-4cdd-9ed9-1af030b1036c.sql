ALTER TABLE public.approval_workflows
  ADD COLUMN IF NOT EXISTS sub_sector_id uuid REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_approval_workflows_sub_sector_id ON public.approval_workflows(sub_sector_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_service_id ON public.approval_workflows(service_id);