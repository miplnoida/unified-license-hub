CREATE OR REPLACE FUNCTION public.license_lifecycle_action(_license_id uuid, _action_key text, _payload jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  l record; pol jsonb; cfg jsonb; m record; r record;
  new_status text; old_status text;
  adverse boolean;
  v_matter_id uuid; v_renewal_id uuid;
  v_new_until timestamptz;
  v_avail jsonb; v_offer jsonb;
  v_prev_term record; v_term_id uuid; v_term_no int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO l FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  old_status := l.status;
  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);
  cfg := public.license_lifecycle_config_resolve(l.id, 'renewal');

  adverse := _action_key IN ('REFUSE_RENEWAL','BEGIN_SUSPENSION','SUSPEND','BEGIN_REVOCATION','REVOKE','ACCEPT_SURRENDER','MARK_EXPIRED');

  IF _action_key IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    PERFORM public.enforce_permission('license_management','manage_conditions');
  ELSIF _action_key IN ('APPROVE_RENEWAL','REFUSE_RENEWAL') THEN
    PERFORM public.enforce_permission('license_management','approve');
  ELSIF adverse THEN
    PERFORM public.enforce_permission('license_management','manage_license_actions');
  ELSE
    PERFORM public.enforce_permission('license_management','workflow_action');
  END IF;

  IF _action_key NOT IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    v_avail := public.license_lifecycle_available_actions(l.id);
    SELECT a INTO v_offer FROM jsonb_array_elements(v_avail) a WHERE a->>'key' = _action_key;
    IF v_offer IS NULL THEN
      RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
        DETAIL = 'Action ' || _action_key || ' is not available for this licence in its current state.';
    END IF;
    IF COALESCE((v_offer->>'requires_reason')::boolean,false) AND COALESCE(length(btrim(_reason)),0) < 10 THEN
      RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(COALESCE(v_offer->'blockers','[]'::jsonb)) > 0
       AND NOT COALESCE((_payload->>'override_blockers')::boolean,false) THEN
      RAISE EXCEPTION 'BLOCKED' USING ERRCODE='22023',
        DETAIL = v_offer->>'blockers';
    END IF;
  END IF;

  IF adverse AND COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF l.status IN ('revoked','surrendered') AND _action_key <> 'REINSTATE' THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023';
  END IF;

  SELECT * INTO m FROM public.license_lifecycle_matters
   WHERE license_id = l.id AND status = 'open' ORDER BY opened_at LIMIT 1;

  IF _action_key = 'START_RENEWAL' THEN
    IF l.status NOT IN ('active','restricted','expired') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_renewals x WHERE x.license_id = l.id AND x.status NOT IN ('approved','refused','withdrawn')) THEN
      RAISE EXCEPTION 'RENEWAL_ALREADY_OPEN' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.license_renewals(license_id, initiated_by, status, previous_valid_until, notes)
    VALUES (l.id, uid, 'in_progress', l.valid_until, _reason) RETURNING id INTO v_renewal_id;
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, renewal_id, opened_by, due_at, waiting_on, metadata)
    VALUES (l.id, 'renewal', 'Licence renewal', _reason, v_renewal_id, uid, l.valid_until, 'regulator',
            jsonb_build_object('config_id', cfg->>'config_id', 'policy_snapshot', cfg))
    RETURNING id INTO v_matter_id;

  ELSIF _action_key = 'REQUEST_RENEWAL_INFORMATION' THEN
    SELECT * INTO r FROM public.license_renewals WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn') ORDER BY created_at DESC LIMIT 1;
    IF r IS NULL THEN RAISE EXCEPTION 'NO_OPEN_RENEWAL' USING ERRCODE='22023'; END IF;
    UPDATE public.license_renewals SET status='information_requested', notes=COALESCE(_reason, notes), updated_at=now() WHERE id=r.id;
    UPDATE public.license_lifecycle_matters SET waiting_on='entity', reason=COALESCE(_reason, reason) WHERE license_id=l.id AND status='open' AND matter_kind='renewal';
    v_renewal_id := r.id;

  ELSIF _action_key IN ('APPROVE_RENEWAL','REFUSE_RENEWAL') THEN
    SELECT * INTO r FROM public.license_renewals WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn') ORDER BY created_at DESC LIMIT 1;
    IF r IS NULL THEN RAISE EXCEPTION 'NO_OPEN_RENEWAL' USING ERRCODE='22023'; END IF;
    v_renewal_id := r.id;
    SELECT * INTO v_prev_term FROM public.license_terms WHERE license_id = l.id AND is_current LIMIT 1;

    IF _action_key = 'APPROVE_RENEWAL' THEN
      v_new_until := COALESCE((_payload->>'new_valid_until')::timestamptz,
                              GREATEST(COALESCE(l.valid_until, now()), now())
                                + make_interval(days => COALESCE(NULLIF(cfg->>'period_days','')::int,
                                                                 NULLIF(pol->>'period_days','')::int, 365)));
      UPDATE public.license_renewals SET status='approved', reviewed_by=uid, reviewed_at=now(),
             new_valid_until=v_new_until, decision_reason=_reason, updated_at=now() WHERE id=r.id;

      -- A.4: renewal creates a NEW term; the prior term is preserved and superseded.
      SELECT COALESCE(max(term_number),0) + 1 INTO v_term_no FROM public.license_terms WHERE license_id = l.id;
      IF v_prev_term.id IS NOT NULL THEN
        UPDATE public.license_terms SET is_current = false WHERE id = v_prev_term.id;
      END IF;
      INSERT INTO public.license_terms(license_id, term_number, term_kind, effective_from, effective_until,
        source_decision, renewal_id, matter_id, decision_actor, decision_at, conditions_snapshot, is_current, metadata)
      VALUES (l.id, v_term_no, 'renewal',
              COALESCE(v_prev_term.effective_until, l.valid_until, now()), v_new_until,
              'APPROVE_RENEWAL', r.id,
              (SELECT id FROM public.license_lifecycle_matters WHERE license_id=l.id AND status='open' AND matter_kind='renewal' ORDER BY opened_at LIMIT 1),
              uid, now(),
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'category',c.category,'description',c.description,'status',c.status,'due_date',c.due_date))
                          FROM public.license_conditions c
                         WHERE c.license_id = l.id AND c.status NOT IN ('closed')), '[]'::jsonb),
              true,
              jsonb_build_object('policy_snapshot', cfg, 'decision_reason', _reason))
      RETURNING id INTO v_term_id;
      IF v_prev_term.id IS NOT NULL THEN
        UPDATE public.license_terms SET superseded_by = v_term_id, superseded_at = now() WHERE id = v_prev_term.id;
      END IF;

      UPDATE public.licenses SET valid_until=v_new_until,
             status = CASE WHEN status='expired' THEN 'active' ELSE status END, updated_at=now() WHERE id=l.id;
      new_status := (SELECT status FROM public.licenses WHERE id=l.id);
    ELSE
      -- Refusal preserves the current term and records formal refusal evidence.
      UPDATE public.license_renewals SET status='refused', reviewed_by=uid, reviewed_at=now(), decision_reason=_reason, updated_at=now() WHERE id=r.id;
      UPDATE public.license_lifecycle_matters
         SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
               'refusal', jsonb_build_object('decided_by', uid, 'decided_at', now(),
                                             'rationale', _reason,
                                             'preserved_term_id', v_prev_term.id,
                                             'preserved_valid_until', l.valid_until))
       WHERE license_id = l.id AND status = 'open' AND matter_kind = 'renewal';
    END IF;
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid,
           decision = _action_key WHERE license_id=l.id AND status='open' AND matter_kind='renewal';

  ELSIF _action_key IN ('BEGIN_SUSPENSION','BEGIN_REVOCATION','BEGIN_SURRENDER','APPLY_VARIATION') THEN
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, opened_by, due_at, waiting_on, metadata)
    VALUES (l.id,
            CASE _action_key WHEN 'BEGIN_SUSPENSION' THEN 'suspension'
                             WHEN 'BEGIN_REVOCATION' THEN 'revocation'
                             WHEN 'BEGIN_SURRENDER' THEN 'surrender'
                             ELSE 'variation' END,
            initcap(replace(lower(_action_key),'_',' ')), _reason, uid,
            (_payload->>'due_at')::timestamptz,
            CASE WHEN _action_key = 'APPLY_VARIATION' THEN 'entity' ELSE 'regulator' END,
            jsonb_build_object('policy_snapshot', cfg, 'payload', COALESCE(_payload,'{}'::jsonb)))
    RETURNING id INTO v_matter_id;

  ELSIF _action_key = 'SUSPEND' THEN
    IF l.status <> 'active' AND l.status <> 'restricted' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'suspended';
  ELSIF _action_key = 'REINSTATE' THEN
    IF l.status NOT IN ('suspended','restricted') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'active';
  ELSIF _action_key = 'REVOKE' THEN
    new_status := 'revoked';
  ELSIF _action_key = 'ACCEPT_SURRENDER' THEN
    new_status := 'surrendered';
  ELSIF _action_key = 'MARK_EXPIRED' THEN
    IF l.valid_until IS NULL OR l.valid_until > now() THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'expired';
  ELSIF _action_key = 'APPROVE_VARIATION' THEN
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid, decision='APPROVED'
     WHERE license_id=l.id AND status='open' AND matter_kind='variation';
  ELSE
    RAISE EXCEPTION 'UNKNOWN_ACTION' USING ERRCODE='22023';
  END IF;

  IF new_status IS NOT NULL AND new_status <> old_status THEN
    UPDATE public.licenses SET status = new_status, updated_at = now() WHERE id = l.id;
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid, decision=_action_key
     WHERE license_id = l.id AND status='open'
       AND matter_kind IN ('suspension','revocation','surrender','expiry');
  END IF;

  INSERT INTO public.license_actions(license_id, action_type, actor_id, reason, old_status, new_status, metadata)
  VALUES (l.id, lower(_action_key), uid, _reason, old_status, COALESCE(new_status, old_status),
          jsonb_build_object('payload', COALESCE(_payload,'{}'::jsonb), 'matter_id', v_matter_id,
                             'renewal_id', v_renewal_id, 'term_id', v_term_id));

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (uid, 'license.lifecycle.' || lower(_action_key), 'license', l.id,
          jsonb_build_object('from', old_status, 'to', COALESCE(new_status, old_status), 'reason', _reason,
                             'term_id', v_term_id, 'payload', COALESCE(_payload,'{}'::jsonb)));

  RETURN public.license_case(l.id, 'internal');
END $function$;