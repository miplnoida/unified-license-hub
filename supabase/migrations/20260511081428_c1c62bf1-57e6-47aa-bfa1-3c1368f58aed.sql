ALTER TABLE public.form_versions
ADD COLUMN IF NOT EXISTS branched_from_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_versions_template_status_branched_from
ON public.form_versions (template_id, status, branched_from_version_id);