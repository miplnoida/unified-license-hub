-- Ensure form_templates.form_type CHECK constraint permits 'internal_license_action'.
-- Idempotent: drops existing constraint (if any) and re-adds with the full allowed list.
ALTER TABLE public.form_templates DROP CONSTRAINT IF EXISTS form_templates_form_type_check;

ALTER TABLE public.form_templates
  ADD CONSTRAINT form_templates_form_type_check
  CHECK (form_type = ANY (ARRAY[
    'pre_license'::text,
    'post_license'::text,
    'internal'::text,
    'internal_license_action'::text,
    'registration'::text,
    'renewal'::text,
    'return'::text,
    'returns'::text,
    'complaint'::text,
    'fit_and_proper'::text
  ]));

COMMENT ON CONSTRAINT form_templates_form_type_check ON public.form_templates IS
  'Allowed form_type values. internal_license_action is used by the License Action Forms feature.';