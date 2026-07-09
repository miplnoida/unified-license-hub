-- ─────────────────────────────────────────────────────────────────────────────
-- Disambiguate the public Fit & Proper Declaration form from the pre-existing
-- internal "Fit & Proper — Personal Questionnaire (PQ)" seed form.
--
-- Both share form_type = 'fit_and_proper', so get_fp_declaration_form_public()
-- (which orders by fv.version DESC with no other filter) could return either
-- one depending on insert order — the seed form uses service='pq' for exactly
-- this kind of disambiguation (see fp_pin_pq_form_on_insert()), so the
-- declaration form now does the same with service='declaration'.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.form_templates
SET service = 'declaration'
WHERE form_type = 'fit_and_proper'
  AND name = 'Fit and Proper Declaration'
  AND (service IS NULL OR service = '');

CREATE OR REPLACE FUNCTION public.get_fp_declaration_form_public()
RETURNS TABLE(template_id UUID, version_id UUID, schema_snapshot JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ft.id, fv.id, fv.schema_snapshot
  FROM public.form_templates ft
  JOIN public.form_versions fv ON fv.template_id = ft.id
  WHERE ft.form_type = 'fit_and_proper' AND ft.service = 'declaration'
  ORDER BY fv.version DESC
  LIMIT 1;
$$;
