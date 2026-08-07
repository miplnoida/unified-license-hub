-- 1) Ratio provenance must be written at insert time: the append-only guard on
--    return_calculated_ratios rejects every UPDATE, so the previous enrichment
--    update silently discarded null_reason / formula_snapshot / ratio_version.
CREATE OR REPLACE FUNCTION public.record_return_ratio(
  _return_id uuid,
  _ratio_key text,
  _label text,
  _value numeric,
  _display_format text,
  _computed_by uuid DEFAULT NULL::uuid,
  _null_reason text DEFAULT NULL::text,
  _ratio_version integer DEFAULT NULL::integer,
  _formula_snapshot text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_cfg uuid;
BEGIN
  SELECT return_configuration_id INTO v_cfg FROM public.returns_filed WHERE id = _return_id;
  INSERT INTO public.return_calculated_ratios(
    return_id, return_config_id, ratio_key, label, value, display_format, computed_by,
    null_reason, ratio_version, formula_snapshot)
  VALUES (_return_id, v_cfg, _ratio_key, _label, _value, _display_format,
          COALESCE(_computed_by, auth.uid()),
          CASE WHEN _value IS NULL THEN COALESCE(_null_reason, 'missing_input') ELSE NULL END,
          _ratio_version, _formula_snapshot)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- 2) Server-side finalisation gate for CAMELS assessments: every active
--    component (sector-specific set wins over the global set) must carry a
--    rating before the assessment may reach approved/closed.
CREATE OR REPLACE FUNCTION public.prudential_assessment_finalisation_gaps(_assessment_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sector uuid;
  v_codes text[];
  v_gaps text[];
BEGIN
  SELECT l.sector_id INTO v_sector
    FROM public.prudential_assessments a
    JOIN public.licensees l ON l.id = a.entity_id
   WHERE a.id = _assessment_id;

  SELECT ARRAY_AGG(code ORDER BY sort_order)
    INTO v_codes
    FROM public.prudential_assessment_components
   WHERE is_active
     AND sector_id IS NOT DISTINCT FROM v_sector;

  IF v_codes IS NULL THEN
    SELECT ARRAY_AGG(code ORDER BY sort_order)
      INTO v_codes
      FROM public.prudential_assessment_components
     WHERE is_active AND sector_id IS NULL;
  END IF;

  IF v_codes IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT ARRAY_AGG(c ORDER BY c)
    INTO v_gaps
    FROM UNNEST(v_codes) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.prudential_assessment_component_ratings r
      WHERE r.assessment_id = _assessment_id
        AND r.component_code = c
        AND r.rating IS NOT NULL
        AND btrim(r.rating) <> ''
   );

  RETURN COALESCE(v_gaps, ARRAY[]::text[]);
END $function$;

REVOKE ALL ON FUNCTION public.prudential_assessment_finalisation_gaps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_assessment_finalisation_gaps(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_prudential_assessment_finalise_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_gaps text[];
BEGIN
  IF NEW.status IN ('approved','closed') AND OLD.status NOT IN ('approved','closed') THEN
    v_gaps := public.prudential_assessment_finalisation_gaps(NEW.id);
    IF array_length(v_gaps, 1) > 0 THEN
      RAISE EXCEPTION 'assessment % cannot be finalised: unrated components %',
        NEW.id, array_to_string(v_gaps, ',')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_prudential_assessment_finalise_gate ON public.prudential_assessments;
CREATE TRIGGER trg_prudential_assessment_finalise_gate
  BEFORE UPDATE ON public.prudential_assessments
  FOR EACH ROW EXECUTE FUNCTION public.tg_prudential_assessment_finalise_gate();

-- 3) Overrides of an auto-suggested component rating require a justification and
--    must retain the original suggestion + actor.
CREATE OR REPLACE FUNCTION public.tg_pacr_override_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.auto_suggested_rating IS NOT NULL
     AND NEW.rating IS NOT NULL
     AND NEW.rating <> NEW.auto_suggested_rating
     AND COALESCE(btrim(NEW.override_justification), '') = '' THEN
    RAISE EXCEPTION 'override of suggested rating % for component % requires a justification',
      NEW.auto_suggested_rating, NEW.component_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.auto_suggested_rating IS NOT NULL
     AND NEW.auto_suggested_rating IS DISTINCT FROM OLD.auto_suggested_rating THEN
    RAISE EXCEPTION 'the original system suggestion for component % cannot be altered', OLD.component_code
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_pacr_override_guard ON public.prudential_assessment_component_ratings;
CREATE TRIGGER trg_pacr_override_guard
  BEFORE INSERT OR UPDATE ON public.prudential_assessment_component_ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_pacr_override_guard();