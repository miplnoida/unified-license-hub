CREATE OR REPLACE FUNCTION public.ai_governance_model_save(
  _id uuid,
  _provider text,
  _technical_identifier text,
  _model_key text,
  _display_name text,
  _regulatory_purpose text,
  _model_version text DEFAULT NULL::text,
  _known_limitations text DEFAULT NULL::text,
  _data_handling_class text DEFAULT 'INTERNAL_REGULATORY_FACTS'::text,
  _external_data_capable boolean DEFAULT false,
  _governance_display_name text DEFAULT NULL::text,
  _governance_version_label text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _out uuid; _state public.ai_gov_lifecycle; _label text;
BEGIN
  _uid := public.ai_gov_require(ARRAY['create','edit']);
  _label := COALESCE(NULLIF(btrim(COALESCE(_governance_display_name,'')),''), _display_name);
  IF _id IS NULL THEN
    INSERT INTO public.ai_governance_models
      (provider, model_key, technical_identifier, model_version, display_name, regulatory_purpose,
       known_limitations, data_handling_class, external_data_capable, lifecycle_state, created_by,
       governance_display_name, governance_version_label)
    VALUES (_provider, _model_key, _technical_identifier, NULLIF(btrim(COALESCE(_model_version,'')),''),
            _display_name, _regulatory_purpose, _known_limitations,
            _data_handling_class, COALESCE(_external_data_capable,false), 'DRAFT', _uid,
            NULLIF(btrim(COALESCE(_governance_display_name,'')),''),
            NULLIF(btrim(COALESCE(_governance_version_label,'')),''))
    RETURNING id INTO _out;
    PERFORM public.ai_gov_log_event('MODEL', _out, _label, 'CREATED', NULL, 'DRAFT', _uid, NULL, '{}'::jsonb);
  ELSE
    SELECT lifecycle_state INTO _state FROM public.ai_governance_models WHERE id = _id;
    IF _state IS NULL THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002'; END IF;
    IF _state NOT IN ('DRAFT','TESTING') THEN
      RAISE EXCEPTION 'immutable_released_configuration: register a new model entry instead of editing a % model', _state
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.ai_governance_models
       SET provider = _provider, model_key = _model_key, technical_identifier = _technical_identifier,
           model_version = NULLIF(btrim(COALESCE(_model_version,'')),''), display_name = _display_name,
           regulatory_purpose = _regulatory_purpose, known_limitations = _known_limitations,
           data_handling_class = _data_handling_class,
           external_data_capable = COALESCE(_external_data_capable,false),
           governance_display_name = COALESCE(NULLIF(btrim(COALESCE(_governance_display_name,'')),''), governance_display_name),
           governance_version_label = COALESCE(NULLIF(btrim(COALESCE(_governance_version_label,'')),''), governance_version_label),
           updated_at = now()
     WHERE id = _id;
    _out := _id;
    PERFORM public.ai_gov_log_event('MODEL', _out, _label, 'UPDATED', _state::text, _state::text, _uid, NULL, '{}'::jsonb);
  END IF;
  RETURN _out;
END $function$;