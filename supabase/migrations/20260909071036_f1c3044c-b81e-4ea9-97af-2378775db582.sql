-- ===================================================================
-- Assessment Programme Studio — governed create capability + fuller compare
-- Additive only. No table, policy or data change.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_create_options()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _scope jsonb; _domains jsonb := '[]'::jsonb;
        _d record; _ok boolean; _reg uuid; _reason text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  _scope := public.supervisory_authorised_regulator_options(NULL, NULL);
  _reg := NULLIF(_scope->'active_regulator'->>'id','')::uuid;

  -- A domain is offered only where the server would actually accept the write.
  FOR _d IN SELECT domain_code FROM public.supervisory_domain_authority ORDER BY domain_code LOOP
    IF NOT public.supervisory_domain_valid(_d.domain_code) THEN CONTINUE; END IF;
    _ok := false;
    BEGIN
      IF _reg IS NULL THEN
        PERFORM public.supervisory_domain_require_manage(_d.domain_code);
      ELSE
        PERFORM public.supervisory_domain_require_manage_for_regulator(_d.domain_code, _reg);
      END IF;
      _ok := true;
    EXCEPTION WHEN OTHERS THEN _ok := false; _reason := COALESCE(_reason, SQLERRM); END;
    IF _ok THEN _domains := _domains || to_jsonb(_d.domain_code); END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'can_create', jsonb_array_length(_domains) > 0
                  AND COALESCE((_scope->>'selectable_count')::int,0) > 0,
    'reason', CASE
       WHEN COALESCE((_scope->>'selectable_count')::int,0) = 0 THEN _scope->>'reason'
       WHEN jsonb_array_length(_domains) = 0
         THEN COALESCE(_reason,'You do not hold authority to configure supervisory assessment programmes.')
       END,
    'domains', _domains,
    'origin', 'REGULATOR_AUTHORED',
    'status', 'DRAFT',
    'regulators', COALESCE(_scope->'regulators','[]'::jsonb),
    'selectable_regulator_count', COALESCE(_scope->'selectable_count','0'::jsonb),
    'cross_regulator_allowed', COALESCE(_scope->'cross_regulator_allowed','false'::jsonb),
    'active_regulator', COALESCE(_scope->'active_regulator','null'::jsonb),
    'regulator_scope_reason', _scope->'reason');
END $$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_programme_create_options() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_assessment_programme_create_options() FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_programme_create_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_programme_create_options() TO service_role;

-- ---------- comparison: package details, programmes and triggers ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_compare(_set_id uuid, _baseline_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment_programme_set; _b public.supervisory_assessment_programme_set;
        _fields text[] := ARRAY['name','description','effective_from','effective_to','notes','domain_code'];
        _f text; _set_diff jsonb := '[]'::jsonb; _av jsonb; _bv jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment_programme_set WHERE id=_set_id;
  SELECT * INTO _b FROM public.supervisory_assessment_programme_set WHERE id=_baseline_id;
  IF _a.id IS NULL OR _b.id IS NULL THEN
    RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE='22023'; END IF;
  IF NOT (public.supervisory_methodology_regulator_scope_readable(_a.domain_code,_a.regulator_id)
      AND public.supervisory_methodology_regulator_scope_readable(_b.domain_code,_b.regulator_id)) THEN
    RAISE EXCEPTION 'not_authorized: outside your authorised regulator scope' USING ERRCODE='42501'; END IF;

  FOREACH _f IN ARRAY _fields LOOP
    _av := to_jsonb(_a)->_f; _bv := to_jsonb(_b)->_f;
    IF _av IS DISTINCT FROM _bv THEN
      _set_diff := _set_diff || jsonb_build_object('field',_f,'subject',_av,'baseline',_bv);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'subject', jsonb_build_object('id',_a.id,'code',_a.code,'set_version',_a.set_version,'status',_a.status),
    'baseline', jsonb_build_object('id',_b.id,'code',_b.code,'set_version',_b.set_version,'status',_b.status),
    'set_changes', _set_diff,
    'programmes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'programme_code', COALESCE(x.programme_code, y.programme_code),
        'label', COALESCE(x.label, y.label),
        'change', CASE WHEN y.programme_code IS NULL THEN 'ADDED'
                       WHEN x.programme_code IS NULL THEN 'REMOVED'
                       WHEN (to_jsonb(x) - 'id' - 'programme_set_id' - 'created_at' - 'updated_at' - 'created_by')
                          IS DISTINCT FROM
                            (to_jsonb(y) - 'id' - 'programme_set_id' - 'created_at' - 'updated_at' - 'created_by')
                         OR x.trigger_fingerprint IS DISTINCT FROM y.trigger_fingerprint
                         THEN 'CHANGED' ELSE 'UNCHANGED' END,
        'field_changes', CASE WHEN x.programme_code IS NULL OR y.programme_code IS NULL THEN '[]'::jsonb ELSE (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('field',k,'subject',to_jsonb(x)->k,'baseline',to_jsonb(y)->k)),'[]'::jsonb)
              FROM unnest(ARRAY['label','description','assessment_type','recurrence_months','period_rule','period_value',
                                'end_offset_days','allow_manual_override','requires_prior_assessment',
                                'requires_trigger_signal','summary_required','question_class_scope',
                                'included_dimension_codes','excluded_dimension_codes','guidance','is_active']) k
             WHERE to_jsonb(x)->k IS DISTINCT FROM to_jsonb(y)->k) END,
        'trigger_changes', CASE WHEN x.programme_code IS NULL OR y.programme_code IS NULL THEN '[]'::jsonb ELSE (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                     'trigger_code', COALESCE(tx.trigger_code, ty.trigger_code),
                     'change', CASE WHEN ty.trigger_code IS NULL THEN 'ADDED'
                                    WHEN tx.trigger_code IS NULL THEN 'REMOVED'
                                    WHEN tx.is_default IS DISTINCT FROM ty.is_default
                                      OR tx.is_active IS DISTINCT FROM ty.is_active
                                      OR tx.requires_signal IS DISTINCT FROM ty.requires_signal
                                      OR tx.requires_prior_assessment IS DISTINCT FROM ty.requires_prior_assessment
                                      OR tx.guidance IS DISTINCT FROM ty.guidance
                                      THEN 'CHANGED' ELSE 'UNCHANGED' END,
                     'subject_default', tx.is_default, 'baseline_default', ty.is_default)
                   ORDER BY COALESCE(tx.trigger_code, ty.trigger_code)),'[]'::jsonb)
              FROM (SELECT * FROM public.supervisory_assessment_programme_trigger WHERE programme_id=x.id) tx
              FULL OUTER JOIN (SELECT * FROM public.supervisory_assessment_programme_trigger WHERE programme_id=y.id) ty
                ON ty.trigger_code = tx.trigger_code) END,
        'subject', to_jsonb(x), 'baseline', to_jsonb(y))
        ORDER BY COALESCE(x.programme_code,y.programme_code)),'[]'::jsonb)
      FROM (SELECT p.*, (SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'id' - 'programme_id' - 'created_at' - 'updated_at' - 'created_by'
                                          ORDER BY t.trigger_code),'[]'::jsonb)
                           FROM public.supervisory_assessment_programme_trigger t WHERE t.programme_id=p.id) AS trigger_fingerprint
              FROM public.supervisory_assessment_programme p WHERE p.programme_set_id=_a.id) x
      FULL OUTER JOIN
           (SELECT p.*, (SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'id' - 'programme_id' - 'created_at' - 'updated_at' - 'created_by'
                                          ORDER BY t.trigger_code),'[]'::jsonb)
                           FROM public.supervisory_assessment_programme_trigger t WHERE t.programme_id=p.id) AS trigger_fingerprint
              FROM public.supervisory_assessment_programme p WHERE p.programme_set_id=_b.id) y
        ON y.programme_code = x.programme_code));
END $$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_programme_compare(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_assessment_programme_compare(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_programme_compare(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_programme_compare(uuid, uuid) TO service_role;