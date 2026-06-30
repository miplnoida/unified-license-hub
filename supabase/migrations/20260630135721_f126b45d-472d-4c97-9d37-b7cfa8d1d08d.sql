
-- Dedupe existing names (keep newest, rename older)
WITH ranked AS (
  SELECT id, name,
         row_number() OVER (PARTITION BY lower(name) ORDER BY created_at DESC, id) AS rn
  FROM public.workflow_templates
)
UPDATE public.workflow_templates t
   SET name = t.name || ' (duplicate ' || r.rn || ')'
  FROM ranked r
 WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_templates_name_lower_uniq
  ON public.workflow_templates (lower(name));
