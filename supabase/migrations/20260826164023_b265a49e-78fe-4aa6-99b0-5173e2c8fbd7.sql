CREATE OR REPLACE FUNCTION public.conduct_intervention_propose(
  _intervention_type text,
  _title text,
  _basis text,
  _licensee_id uuid DEFAULT NULL,
  _theme text DEFAULT NULL,
  _emerging_risk_id uuid DEFAULT NULL,
  _priority_score_id uuid DEFAULT NULL,
  _expected_outcome text DEFAULT NULL,
  _planned_start date DEFAULT NULL,
  _planned_end date DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid;
BEGIN
  _uid := public.market_conduct_require(ARRAY['run_conduct_analytics','manage_complaints']);

  IF length(btrim(COALESCE(_basis,''))) < 20 THEN
    RAISE EXCEPTION 'A supervisory basis of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _licensee_id IS NULL AND _emerging_risk_id IS NULL
     AND nullif(btrim(COALESCE(_theme,'')),'') IS NULL THEN
    RAISE EXCEPTION 'An intervention must name an entity, a theme or an emerging risk' USING ERRCODE = '22023';
  END IF;

  _sector := _sector_id;
  _reg := _regulator_id;
  IF _licensee_id IS NOT NULL THEN
    -- The regulator is a property of the sector, not of the entity record.
    SELECT COALESCE(_sector, l.sector_id), COALESCE(_reg, s.regulator_id)
      INTO _sector, _reg
      FROM public.licensees l
      LEFT JOIN public.sectors s ON s.id = l.sector_id
     WHERE l.id = _licensee_id;
  ELSIF _emerging_risk_id IS NOT NULL THEN
    SELECT COALESCE(_sector, r.sector_id), COALESCE(_reg, r.regulator_id)
      INTO _sector, _reg FROM public.conduct_emerging_risks r WHERE r.id = _emerging_risk_id;
  END IF;

  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'run_conduct_analytics',
               _reg, _sector, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: subject out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  _ref := 'CI-' || to_char(now(), 'YYYY') || '-' ||
          lpad(nextval('public.conduct_intervention_ref_seq')::text, 5, '0');

  INSERT INTO public.conduct_interventions(
    reference, regulator_id, sector_id, licensee_id, theme, emerging_risk_id,
    priority_score_id, intervention_type, title, basis, expected_outcome,
    planned_start, planned_end, owner_id, proposed_by)
  VALUES (_ref, _reg, _sector, _licensee_id, nullif(btrim(COALESCE(_theme,'')),''), _emerging_risk_id,
    _priority_score_id, _intervention_type, btrim(_title), btrim(_basis), _expected_outcome,
    _planned_start, _planned_end, _owner_id, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.conduct_intervention_events(intervention_id, event_type, to_status, rationale, actor_id)
  VALUES (_id, 'PROPOSED', 'PROPOSED', btrim(_basis), _uid);

  PERFORM public.log_compliance_audit('CREATE', 'conduct_intervention', _id, NULL,
    jsonb_build_object('reference', _ref, 'type', _intervention_type, 'status', 'PROPOSED'),
    'Supervisory intervention ' || _ref || ' proposed');

  RETURN jsonb_build_object('id', _id, 'reference', _ref, 'status', 'PROPOSED');
END $$;

REVOKE ALL ON FUNCTION public.conduct_intervention_propose(text, text, text, uuid, text, uuid, uuid, text, date, date, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_intervention_propose(text, text, text, uuid, text, uuid, uuid, text, date, date, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.conduct_intervention_propose(text, text, text, uuid, text, uuid, uuid, text, date, date, uuid, uuid, uuid) TO authenticated, service_role;
