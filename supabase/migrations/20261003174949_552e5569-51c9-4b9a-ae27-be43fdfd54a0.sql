-- AML-CLOSE-02B: content fingerprint (cfp1) excludes lifecycle metadata. Legacy hash function unchanged.
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_legacy_hash_with_status(_component_type text, _component_id uuid, _status text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t text := upper(btrim(COALESCE(_component_type,''))); _h text;
BEGIN
  IF _component_id IS NULL THEN RETURN NULL; END IF;
  IF _t = 'METHODOLOGY' THEN
    SELECT md5(m.id::text||'|'||m.code||'|'||m.version||'|'||_status||'|'||COALESCE(m.definition::text,''))
      INTO _h FROM public.supervisory_methodology m WHERE m.id = _component_id;
  ELSIF _t = 'CALCULATION_CONFIG' THEN
    SELECT md5(c.id::text||'|'||c.config_version::text||'|'||_status||'|'||
               COALESCE((SELECT string_agg(b.band_kind||b.band_code||b.min_score||b.max_score, ',' ORDER BY b.sort_order)
                           FROM public.supervisory_calculation_band b WHERE b.config_id = c.id),''))
      INTO _h FROM public.supervisory_calculation_config c WHERE c.id = _component_id;
  ELSIF _t = 'ASSESSMENT_PROGRAMME' THEN
    SELECT md5(s.id::text||'|'||s.code||'|'||s.set_version||'|'||_status)
      INTO _h FROM public.supervisory_assessment_programme_set s WHERE s.id = _component_id;
  ELSE
    SELECT md5(c.id::text||'|'||c.code||'|'||c.component_version||'|'||_status||'|'||c.content::text)
      INTO _h FROM public.supervisory_policy_component c WHERE c.id = _component_id;
  END IF;
  RETURN _h;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_fingerprint(_component_type text, _component_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t text := upper(btrim(COALESCE(_component_type,''))); _c jsonb;
BEGIN
  IF _component_id IS NULL THEN RETURN NULL; END IF;
  -- jsonb has canonical key ordering, so serialization order cannot change the result.
  IF _t = 'METHODOLOGY' THEN
    SELECT jsonb_build_object('id',m.id,'code',m.code,'version',m.version,'definition',m.definition)
      INTO _c FROM public.supervisory_methodology m WHERE m.id = _component_id;
  ELSIF _t = 'CALCULATION_CONFIG' THEN
    SELECT jsonb_build_object('id',c.id,'version',c.config_version,
             'bands',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',b.band_kind,'code',b.band_code,'min',b.min_score,'max',b.max_score) ORDER BY b.band_kind,b.band_code)
                       FROM public.supervisory_calculation_band b WHERE b.config_id = c.id),'[]'::jsonb))
      INTO _c FROM public.supervisory_calculation_config c WHERE c.id = _component_id;
  ELSIF _t = 'ASSESSMENT_PROGRAMME' THEN
    SELECT jsonb_build_object('id',s.id,'code',s.code,'version',s.set_version)
      INTO _c FROM public.supervisory_assessment_programme_set s WHERE s.id = _component_id;
  ELSE
    SELECT jsonb_build_object('id',c.id,'type',c.component_type,'code',c.code,'version',c.component_version,'content',c.content)
      INTO _c FROM public.supervisory_policy_component c WHERE c.id = _component_id;
  END IF;
  IF _c IS NULL THEN RETURN NULL; END IF;
  RETURN 'cfp1:' || md5(_c::text);
END $$;

COMMENT ON FUNCTION public.supervisory_policy_component_content_fingerprint(text, uuid) IS
'cfp1 content fingerprint: md5 of canonical jsonb of substantive content only; excludes status, approval/activation timestamps and actors.';
COMMENT ON FUNCTION public.supervisory_policy_component_content_hash(text, uuid) IS
'Legacy record-state hash (includes lifecycle status). Values stored in snapshots are historical and must not be rewritten; use supervisory_policy_component_content_fingerprint for content immutability.';

-- Read-only: proves each pinned component's content is unchanged since stamping, without rewriting history.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_policy_basis_integrity(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _snap public.supervisory_assessment_policy_snapshot; _rows jsonb := '[]'::jsonb; _x jsonb; _st text; _m text; _ok boolean := true;
BEGIN
  IF NOT public.can_access_supervision_domain(auth.uid(), 'AML_CFT') AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;
  IF _snap.id IS NULL THEN RETURN jsonb_build_object('status','NO_SNAPSHOT'); END IF;
  FOR _x IN SELECT * FROM jsonb_array_elements(_snap.components) LOOP
    _m := NULL;
    FOREACH _st IN ARRAY ARRAY['APPROVED','ACTIVE','SUPERSEDED','RETIRED','PUBLISHED'] LOOP
      IF public.supervisory_policy_component_legacy_hash_with_status(_x->>'component_type', (_x->>'component_id')::uuid, _st) = _x->>'content_hash' THEN
        _m := _st; EXIT; END IF;
    END LOOP;
    IF _m IS NULL THEN _ok := false; END IF;
    _rows := _rows || jsonb_build_array(jsonb_build_object(
      'component_type', _x->>'component_type', 'component_id', _x->>'component_id',
      'component_version', _x->>'component_version', 'stored_hash', _x->>'content_hash',
      'current_legacy_hash', public.supervisory_policy_component_content_hash(_x->>'component_type', (_x->>'component_id')::uuid),
      'content_unchanged', _m IS NOT NULL, 'status_at_stamp', _m,
      'content_fingerprint', public.supervisory_policy_component_content_fingerprint(_x->>'component_type', (_x->>'component_id')::uuid)));
  END LOOP;
  RETURN jsonb_build_object('status', CASE WHEN _ok THEN 'CONTENT_UNCHANGED' ELSE 'CONTENT_CHANGED' END,
    'snapshot_content_hash', _snap.content_hash, 'fingerprint_algorithm','cfp1', 'components', _rows);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_component_legacy_hash_with_status(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_content_fingerprint(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_content_fingerprint(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_basis_integrity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_policy_basis_integrity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_legacy_hash_with_status(text, uuid, text) TO service_role;