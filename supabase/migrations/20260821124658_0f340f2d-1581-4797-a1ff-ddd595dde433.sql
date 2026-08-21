-- ============================================================
-- EPR-04 Milestone 2 — Fit & Proper person / role governance
-- ============================================================

CREATE OR REPLACE FUNCTION public.fp_individual_create(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _row record;
  _name text := btrim(COALESCE(_payload->>'full_name',''));
  _nid  text := NULLIF(btrim(COALESCE(_payload->>'national_id','')),'');
  _mail text := NULLIF(btrim(COALESCE(_payload->>'email','')),'');
  _dup  record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','create');

  IF _name = '' THEN
    RAISE EXCEPTION 'full name is required' USING ERRCODE='22023';
  END IF;

  SELECT id, full_name, national_id, email INTO _dup
    FROM public.fp_individuals
   WHERE (_nid IS NOT NULL AND national_id = _nid)
      OR (_mail IS NOT NULL AND email = _mail)
   LIMIT 1;
  IF _dup.id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate subject: "%" is already registered (%)',
      _dup.full_name, COALESCE(_dup.national_id, _dup.email)
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.fp_individuals (
    full_name, national_id, passport_number, nationality, date_of_birth,
    email, phone, address, notes, status, created_by)
  VALUES (
    _name, _nid,
    NULLIF(btrim(COALESCE(_payload->>'passport_number','')),''),
    NULLIF(btrim(COALESCE(_payload->>'nationality','')),''),
    NULLIF(_payload->>'date_of_birth','')::date,
    _mail,
    NULLIF(btrim(COALESCE(_payload->>'phone','')),''),
    NULLIF(btrim(COALESCE(_payload->>'address','')),''),
    NULLIF(btrim(COALESCE(_payload->>'notes','')),''),
    'active', _uid)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.individual.created','fp_individual',_row.id, NULL,
    jsonb_build_object('full_name',_name,'national_id',_nid,'email',_mail),
    jsonb_build_object('individual_id',_row.id), NULL, 'CREATE');

  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_individual_update(
  _individual_id uuid, _patch jsonb, _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _before record; _row record; _k text;
  _allowed text[] := ARRAY['full_name','national_id','passport_number','nationality',
                           'date_of_birth','email','phone','address','notes'];
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');

  SELECT * INTO _before FROM public.fp_individuals WHERE id = _individual_id;
  IF _before.id IS NULL THEN
    RAISE EXCEPTION 'individual not found' USING ERRCODE='22023';
  END IF;

  FOR _k IN SELECT jsonb_object_keys(COALESCE(_patch,'{}'::jsonb)) LOOP
    IF NOT (_k = ANY(_allowed)) THEN
      RAISE EXCEPTION 'field "%" is not editable master data', _k USING ERRCODE='22023';
    END IF;
  END LOOP;

  IF _patch ? 'full_name' AND btrim(COALESCE(_patch->>'full_name','')) = '' THEN
    RAISE EXCEPTION 'full name is required' USING ERRCODE='22023';
  END IF;

  IF _patch ? 'national_id' AND NULLIF(btrim(_patch->>'national_id'),'') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.fp_individuals
                  WHERE national_id = btrim(_patch->>'national_id') AND id <> _individual_id) THEN
    RAISE EXCEPTION 'another subject already holds that national id' USING ERRCODE='23505';
  END IF;

  UPDATE public.fp_individuals SET
    full_name       = CASE WHEN _patch ? 'full_name' THEN btrim(_patch->>'full_name') ELSE full_name END,
    national_id     = CASE WHEN _patch ? 'national_id' THEN NULLIF(btrim(_patch->>'national_id'),'') ELSE national_id END,
    passport_number = CASE WHEN _patch ? 'passport_number' THEN NULLIF(btrim(_patch->>'passport_number'),'') ELSE passport_number END,
    nationality     = CASE WHEN _patch ? 'nationality' THEN NULLIF(btrim(_patch->>'nationality'),'') ELSE nationality END,
    date_of_birth   = CASE WHEN _patch ? 'date_of_birth' THEN NULLIF(_patch->>'date_of_birth','')::date ELSE date_of_birth END,
    email           = CASE WHEN _patch ? 'email' THEN NULLIF(btrim(_patch->>'email'),'') ELSE email END,
    phone           = CASE WHEN _patch ? 'phone' THEN NULLIF(btrim(_patch->>'phone'),'') ELSE phone END,
    address         = CASE WHEN _patch ? 'address' THEN NULLIF(btrim(_patch->>'address'),'') ELSE address END,
    notes           = CASE WHEN _patch ? 'notes' THEN NULLIF(btrim(_patch->>'notes'),'') ELSE notes END,
    updated_at      = now()
  WHERE id = _individual_id
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.individual.master_data.updated','fp_individual',_individual_id,
    to_jsonb(_before) - 'notes', _patch,
    jsonb_build_object('individual_id',_individual_id), _reason, 'UPDATE');

  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_individual_set_directory_status(
  _individual_id uuid, _status text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _before text; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');

  IF _status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'subject register status may only be active or inactive — suspension and prohibition are determination outcomes'
      USING ERRCODE='22023';
  END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE='22023';
  END IF;

  SELECT status INTO _before FROM public.fp_individuals WHERE id = _individual_id;
  IF _before IS NULL THEN
    RAISE EXCEPTION 'individual not found' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_individuals SET status = _status, updated_at = now()
   WHERE id = _individual_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.individual.status.changed','fp_individual',_individual_id,
    jsonb_build_object('status',_before), jsonb_build_object('status',_status),
    jsonb_build_object('individual_id',_individual_id), _reason, 'UPDATE');

  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_role_create(
  _individual_id uuid,
  _role_type text,
  _licensee_id uuid DEFAULT NULL,
  _is_current boolean DEFAULT true,
  _reassessment_cycle_months integer DEFAULT NULL,
  _effective_from date DEFAULT NULL,
  _role_title text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _row record; _next date;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','create');

  IF COALESCE(btrim(_role_type),'') = '' THEN
    RAISE EXCEPTION 'role type is required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fp_individuals WHERE id = _individual_id) THEN
    RAISE EXCEPTION 'individual not found' USING ERRCODE='22023';
  END IF;
  IF _licensee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _licensee_id) THEN
    RAISE EXCEPTION 'entity not found' USING ERRCODE='22023';
  END IF;
  IF _reassessment_cycle_months IS NOT NULL
     AND (_reassessment_cycle_months <= 0 OR _reassessment_cycle_months > 120) THEN
    RAISE EXCEPTION 'reassessment cycle must be 1-120 months' USING ERRCODE='22023';
  END IF;
  IF COALESCE(_is_current,true)
     AND EXISTS (SELECT 1 FROM public.fp_individual_roles
                  WHERE individual_id = _individual_id
                    AND role_type = btrim(_role_type)
                    AND COALESCE(licensee_id::text,'-') = COALESCE(_licensee_id::text,'-')
                    AND is_current) THEN
    RAISE EXCEPTION 'this subject already holds a current % appointment at that entity', btrim(_role_type)
      USING ERRCODE='23505';
  END IF;

  _next := CASE WHEN _reassessment_cycle_months IS NULL THEN NULL
                ELSE (CURRENT_DATE + (_reassessment_cycle_months || ' months')::interval)::date END;

  INSERT INTO public.fp_individual_roles (
    individual_id, role_type, role_title, licensee_id, is_current,
    effective_from, reassessment_cycle_months, next_reassessment_due, created_by)
  VALUES (
    _individual_id, btrim(_role_type), NULLIF(btrim(COALESCE(_role_title,'')),''),
    _licensee_id, COALESCE(_is_current,true),
    COALESCE(_effective_from, CURRENT_DATE), _reassessment_cycle_months, _next, _uid)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.role.created','fp_individual_role',_row.id, NULL, to_jsonb(_row),
    jsonb_build_object('individual_id',_individual_id,'role_id',_row.id), NULL, 'CREATE');

  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_role_set_reassessment_cycle(
  _role_id uuid, _months integer, _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _before record; _row record; _next date;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');

  SELECT * INTO _before FROM public.fp_individual_roles WHERE id = _role_id;
  IF _before.id IS NULL THEN
    RAISE EXCEPTION 'role not found' USING ERRCODE='22023';
  END IF;
  IF NOT _before.is_current THEN
    RAISE EXCEPTION 'a ceased appointment cannot carry a reassessment cycle' USING ERRCODE='22023';
  END IF;
  IF _months IS NOT NULL AND (_months <= 0 OR _months > 120) THEN
    RAISE EXCEPTION 'reassessment cycle must be 1-120 months' USING ERRCODE='22023';
  END IF;

  _next := CASE WHEN _months IS NULL THEN NULL
                ELSE (COALESCE(_before.last_reassessment_at::date, CURRENT_DATE)
                      + (_months || ' months')::interval)::date END;

  UPDATE public.fp_individual_roles
     SET reassessment_cycle_months = _months,
         next_reassessment_due = _next,
         updated_at = now()
   WHERE id = _role_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.role.reassessment_cycle.set','fp_individual_role',_role_id,
    jsonb_build_object('reassessment_cycle_months',_before.reassessment_cycle_months,
                       'next_reassessment_due',_before.next_reassessment_due),
    jsonb_build_object('reassessment_cycle_months',_months,'next_reassessment_due',_next),
    jsonb_build_object('individual_id',_before.individual_id,'role_id',_role_id), _reason, 'UPDATE');

  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_role_end(
  _role_id uuid, _reason text, _effective_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _before record; _row record; _open int;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');

  IF COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'a reason is required to cease an appointment' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _before FROM public.fp_individual_roles WHERE id = _role_id;
  IF _before.id IS NULL THEN
    RAISE EXCEPTION 'role not found' USING ERRCODE='22023';
  END IF;
  IF NOT _before.is_current THEN
    RAISE EXCEPTION 'appointment is already ceased' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO _open FROM public.fp_assessments
   WHERE role_id = _role_id AND status NOT IN ('determined','closed','withdrawn');
  IF _open > 0 THEN
    RAISE EXCEPTION 'cannot cease this appointment while % assessment(s) against it are still open', _open
      USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_individual_roles
     SET is_current = false,
         effective_to = COALESCE(_effective_to, CURRENT_DATE),
         reassessment_cycle_months = NULL,
         next_reassessment_due = NULL,
         updated_at = now()
   WHERE id = _role_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.role.ceased','fp_individual_role',_role_id, to_jsonb(_before), to_jsonb(_row),
    jsonb_build_object('individual_id',_before.individual_id,'role_id',_role_id), _reason, 'UPDATE');

  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_entity_fp_summary(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _out jsonb;
BEGIN
  IF NOT public.can_read_fp_licensee(_uid, _entity_id) THEN
    RAISE EXCEPTION 'not permitted to read fit & proper information for this entity'
      USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'entity_id', _entity_id,
    'counts', jsonb_build_object(
      'current_appointments', (
        SELECT count(*) FROM public.fp_individual_roles r
         WHERE r.licensee_id = _entity_id AND r.is_current),
      'open_assessments', (
        SELECT count(*) FROM public.fp_assessments a
         WHERE a.licensee_id = _entity_id
           AND a.status NOT IN ('determined','closed','withdrawn')),
      'reassessments_due', (
        SELECT count(*) FROM public.fp_individual_roles r
         WHERE r.licensee_id = _entity_id AND r.is_current
           AND r.next_reassessment_due IS NOT NULL
           AND r.next_reassessment_due <= CURRENT_DATE),
      'open_conditions', (
        SELECT count(*) FROM public.fp_conditions c
          JOIN public.fp_determinations d ON d.id = c.determination_id
          JOIN public.fp_assessments a ON a.id = d.assessment_id
         WHERE a.licensee_id = _entity_id AND c.status IN ('open','overdue','breached'))
    ),
    'appointments', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'person_name')
        FROM (
          SELECT jsonb_build_object(
                   'role_id', r.id,
                   'individual_id', r.individual_id,
                   'person_name', i.full_name,
                   'role_type', r.role_type,
                   'is_current', r.is_current,
                   'effective_from', r.effective_from,
                   'reassessment_cycle_months', r.reassessment_cycle_months,
                   'next_reassessment_due', r.next_reassessment_due) AS x
            FROM public.fp_individual_roles r
            JOIN public.fp_individuals i ON i.id = r.individual_id
           WHERE r.licensee_id = _entity_id AND r.is_current
           LIMIT 200
        ) s), '[]'::jsonb),
    'assessments', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC)
        FROM (
          SELECT jsonb_build_object(
                   'assessment_id', a.id,
                   'reference', 'FP-' || upper(substr(a.id::text,1,8)),
                   'individual_id', a.individual_id,
                   'person_name', i.full_name,
                   'assessment_type', a.assessment_type,
                   'status', a.status,
                   'created_at', a.created_at,
                   'outcome', (SELECT d.outcome FROM public.fp_determinations d
                                WHERE d.assessment_id = a.id
                                ORDER BY d.created_at DESC LIMIT 1)) AS x
            FROM public.fp_assessments a
            JOIN public.fp_individuals i ON i.id = a.individual_id
           WHERE a.licensee_id = _entity_id
           ORDER BY a.created_at DESC
           LIMIT 50
        ) s), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END; $fn$;

GRANT EXECUTE ON FUNCTION public.fp_entity_fp_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_individual_create(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_individual_update(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_individual_set_directory_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_role_create(uuid,text,uuid,boolean,integer,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_role_set_reassessment_cycle(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_role_end(uuid,text,date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fp_entity_fp_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fp_individual_create(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fp_individual_update(uuid,jsonb,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fp_individual_set_directory_status(uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fp_role_create(uuid,text,uuid,boolean,integer,date,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fp_role_set_reassessment_cycle(uuid,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fp_role_end(uuid,text,date) FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.fp_individuals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fp_individual_roles FROM authenticated;
REVOKE ALL ON public.fp_individuals FROM anon;
REVOKE ALL ON public.fp_individual_roles FROM anon;
GRANT SELECT ON public.fp_individuals TO authenticated;
GRANT SELECT ON public.fp_individual_roles TO authenticated;
GRANT ALL ON public.fp_individuals TO service_role;
GRANT ALL ON public.fp_individual_roles TO service_role;