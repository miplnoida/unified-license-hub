CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_lifecycle(
  _config_id uuid, _to_status text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid; _c public.supervisory_calculation_config; _to text := upper(btrim(_to_status)); _v jsonb;
        _pred public.supervisory_calculation_config;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _c.status = 'RETIRED' THEN
    RAISE EXCEPTION 'a retired configuration is final and cannot change status' USING ERRCODE = '22023';
  END IF;

  IF _to = 'REVIEW' THEN
    IF _c.status <> 'DRAFT' THEN RAISE EXCEPTION 'only a draft may be submitted for approval' USING ERRCODE = '22023'; END IF;
    _v := public.supervisory_calculation_config_validate(_config_id);
    IF NOT (_v->>'ok')::boolean THEN
      RAISE EXCEPTION 'the configuration is incomplete: %', (_v->'problems')::text USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'REVIEW', submitted_by = _uid, submitted_at = now() WHERE id = _config_id;

  ELSIF _to = 'APPROVED' THEN
    IF _c.status <> 'REVIEW' THEN RAISE EXCEPTION 'only a configuration under review may be approved' USING ERRCODE = '22023'; END IF;
    IF _uid = COALESCE(_c.submitted_by, _c.created_by) THEN
      RAISE EXCEPTION 'the approver must be a different person from the author' USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'APPROVED', approved_by = _uid, approved_at = now() WHERE id = _config_id;

  ELSIF _to = 'RETURNED' OR _to = 'DRAFT' THEN
    IF _c.status NOT IN ('REVIEW','APPROVED') THEN RAISE EXCEPTION 'only a submitted configuration may be returned' USING ERRCODE = '22023'; END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL,
           approved_by = NULL, approved_at = NULL WHERE id = _config_id;
    _to := 'DRAFT';

  ELSIF _to = 'ACTIVE' THEN
    IF _c.status <> 'APPROVED' THEN RAISE EXCEPTION 'only an approved configuration may be activated' USING ERRCODE = '22023'; END IF;
    IF _c.effective_from IS NULL THEN
      RAISE EXCEPTION 'a configuration cannot be activated without an effective-from date' USING ERRCODE = '22023'; END IF;
    SELECT * INTO _pred FROM public.supervisory_calculation_config
     WHERE methodology_id = _c.methodology_id AND status = 'ACTIVE' AND id <> _config_id
     ORDER BY effective_from DESC NULLS LAST LIMIT 1;
    IF _pred.id IS NOT NULL THEN
      IF _pred.effective_from IS NULL OR _pred.effective_from >= _c.effective_from THEN
        RAISE EXCEPTION 'the successor must take effect after the configuration it replaces (predecessor effective from %)', _pred.effective_from
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.supervisory_calculation_config
         SET status = 'SUPERSEDED', superseded_at = now(), effective_to = _c.effective_from
       WHERE id = _pred.id;
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'ACTIVE', activated_at = now() WHERE id = _config_id;

  ELSIF _to = 'RETIRED' THEN
    IF _c.status NOT IN ('DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED') THEN
      RAISE EXCEPTION 'a configuration in status % cannot be retired', _c.status USING ERRCODE = '22023';
    END IF;
    IF _c.status = 'ACTIVE' AND EXISTS (
         SELECT 1 FROM public.supervisory_assessment_calculation ac WHERE ac.config_id = _c.id) THEN
      RAISE EXCEPTION 'this configuration is in force and has already produced calculation outcomes, so it must be replaced by a successor configuration rather than retired'
        USING ERRCODE = '22023';
    END IF;
    -- Retirement is a lifecycle fact, not a re-dating of history: the recorded
    -- effective window is left exactly as authored, and a retired configuration
    -- is never resolved as the policy in force.
    UPDATE public.supervisory_calculation_config
       SET status = 'RETIRED'
     WHERE id = _config_id;
  ELSE
    RAISE EXCEPTION 'unsupported target status %', _to USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_config_id, 'LIFECYCLE', _c.status, _to, btrim(_rationale), _uid);
  RETURN _config_id;
END
$fn$;