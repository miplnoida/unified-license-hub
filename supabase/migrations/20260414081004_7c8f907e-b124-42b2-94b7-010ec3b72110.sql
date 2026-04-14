-- Add date range columns to form_versions for version scheduling
ALTER TABLE public.form_versions
ADD COLUMN effective_from timestamp with time zone,
ADD COLUMN effective_until timestamp with time zone;

-- Index for efficient lookup of active versions
CREATE INDEX idx_form_versions_effective_range ON public.form_versions (template_id, status, effective_from, effective_until);