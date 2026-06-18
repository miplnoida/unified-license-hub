
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS sla_warning_threshold_percent INTEGER DEFAULT 80,
  ADD COLUMN IF NOT EXISTS sla_pause_on_rfi BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_warning_template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_breach_template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL;

ALTER TABLE public.approval_steps
  DROP CONSTRAINT IF EXISTS approval_steps_sla_warning_threshold_percent_check;
ALTER TABLE public.approval_steps
  ADD CONSTRAINT approval_steps_sla_warning_threshold_percent_check
  CHECK (sla_warning_threshold_percent IS NULL OR (sla_warning_threshold_percent BETWEEN 1 AND 100));
