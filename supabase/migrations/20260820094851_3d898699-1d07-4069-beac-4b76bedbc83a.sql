
-- ============================================================
-- RDM-ENTITY-001 WAVE C — PREFLIGHT: WAVE-B CLOSURE SERVER LAYER
-- Opaque onboarding tokens, DB-driven identifier catalogue,
-- resumable onboarding journey context.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.onboarding_resolution_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  token_kind text NOT NULL CHECK (token_kind IN ('resolution','candidate','membership_target','provision')),
  entity_id uuid REFERENCES public.licensees(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.entity_resolution_cases(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ort_user ON public.onboarding_resolution_tokens(user_id, token_kind);

GRANT SELECT ON public.onboarding_resolution_tokens TO authenticated;
GRANT ALL ON public.onboarding_resolution_tokens TO service_role;
ALTER TABLE public.onboarding_resolution_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ort_owner_read ON public.onboarding_resolution_tokens;
CREATE POLICY ort_owner_read ON public.onboarding_resolution_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- Resumable onboarding journey context ------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_journey_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  stage text NOT NULL DEFAULT 'USER_ACCOUNT'
    CHECK (stage IN ('USER_ACCOUNT','ENTITY_IDENTIFICATION','AUTHORITY_PENDING','AUTHORITY_GRANTED','APPLICATION','COMPLETE')),
  entity_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  membership_id uuid REFERENCES public.entity_user_memberships(id) ON DELETE SET NULL,
  intended_journey text,
  intended_route text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.onboarding_journey_state TO authenticated;
GRANT ALL ON public.onboarding_journey_state TO service_role;
ALTER TABLE public.onboarding_journey_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ojs_owner_read ON public.onboarding_journey_state;
CREATE POLICY ojs_owner_read ON public.onboarding_journey_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.onboarding_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_ojs_touch ON public.onboarding_journey_state;
CREATE TRIGGER trg_ojs_touch BEFORE UPDATE ON public.onboarding_journey_state
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_touch();

-- Token issue / redeem helpers -------------------------------------------
CREATE OR REPLACE FUNCTION public.onboarding_issue_token(
  _kind text, _entity_id uuid, _case_id uuid, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  v_token := _kind || '_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.onboarding_resolution_tokens (token, user_id, token_kind, entity_id, case_id, payload)
  VALUES (v_token, auth.uid(), _kind, _entity_id, _case_id, COALESCE(_payload,'{}'::jsonb));
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.onboarding_issue_token(text, uuid, uuid, jsonb) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.onboarding_redeem_token(_token text, _kinds text[])
RETURNS public.onboarding_resolution_tokens LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.onboarding_resolution_tokens;
BEGIN
  SELECT * INTO r FROM public.onboarding_resolution_tokens
   WHERE token = _token AND user_id = auth.uid() LIMIT 1;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Invalid onboarding reference' USING ERRCODE='42501'; END IF;
  IF r.expires_at < now() THEN RAISE EXCEPTION 'Onboarding reference expired — please identify the entity again' USING ERRCODE='22023'; END IF;
  IF NOT (r.token_kind = ANY(_kinds)) THEN RAISE EXCEPTION 'Onboarding reference not valid for this step' USING ERRCODE='22023'; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.onboarding_redeem_token(text, text[]) FROM PUBLIC, anon;

-- DB-driven identifier catalogue (privacy-safe DTO) -----------------------
CREATE OR REPLACE FUNCTION public.onboarding_identifier_catalogue()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'identifier_types', COALESCE(jsonb_agg(jsonb_build_object(
        'key', t.key,
        'label', t.label,
        'description', t.description,
        'issuer_hint', t.issuer,
        'uniqueness_scope', t.uniqueness_scope,
        'requires_jurisdiction', COALESCE(t.scope_requires_jurisdiction,false),
        'requires_issuer', COALESCE(t.scope_requires_issuer,false),
        'requires_regulator', COALESCE(t.scope_requires_regulator,false),
        'is_unique_global', COALESCE(t.is_unique_global,false),
        'normalization', t.normalization_strategy,
        'validation_regex', t.validation_regex,
        'is_required', COALESCE(t.is_unique_global,false) AND COALESCE(t.is_system,false),
        'sort_order', COALESCE(t.sort_order, 999)
      ) ORDER BY COALESCE(t.sort_order,999), t.label), '[]'::jsonb))
  FROM public.entity_identifier_types t
  WHERE t.is_active;
$$;
GRANT EXECUTE ON FUNCTION public.onboarding_identifier_catalogue() TO authenticated, anon;

-- Privacy-limited resolution: never returns internal entity UUIDs ---------
CREATE OR REPLACE FUNCTION public.onboarding_resolve_entity(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw jsonb;
  v_out jsonb;
  v_cands jsonb := '[]'::jsonb;
  c jsonb;
  v_entity uuid;
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;

  v_raw := public.entity_resolve_identity(_payload);

  INSERT INTO public.onboarding_journey_state (user_id, stage, intended_journey, intended_route, context)
  VALUES (auth.uid(), 'ENTITY_IDENTIFICATION',
          NULLIF(_payload->>'intended_journey',''), NULLIF(_payload->>'intended_route',''),
          jsonb_build_object('legal_name', _payload->>'legal_name'))
  ON CONFLICT (user_id) DO UPDATE
    SET stage = CASE WHEN public.onboarding_journey_state.stage IN ('AUTHORITY_GRANTED','APPLICATION','COMPLETE')
                     THEN public.onboarding_journey_state.stage ELSE 'ENTITY_IDENTIFICATION' END,
        intended_journey = COALESCE(NULLIF(EXCLUDED.intended_journey,''), public.onboarding_journey_state.intended_journey),
        intended_route = COALESCE(NULLIF(EXCLUDED.intended_route,''), public.onboarding_journey_state.intended_route),
        context = public.onboarding_journey_state.context || EXCLUDED.context;

  IF (v_raw->>'outcome') = 'EXACT_MATCH' THEN
    v_entity := (v_raw->>'entity_id')::uuid;
    v_token := public.onboarding_issue_token('membership_target', v_entity, NULL,
                 jsonb_build_object('match_basis', v_raw->>'match_basis'));
    RETURN jsonb_build_object(
      'outcome', 'EXACT_MATCH',
      'match_basis', v_raw->>'match_basis',
      'membership_target_token', v_token,
      'entity_display', jsonb_build_object(
          'legal_name', COALESCE(v_raw->'entity'->>'legal_name', v_raw->'entity'->>'name'),
          'status', v_raw->'entity'->>'status'),
      'candidates', '[]'::jsonb);
  END IF;

  FOR c IN SELECT jsonb_array_elements(COALESCE(v_raw->'candidates','[]'::jsonb)) LOOP
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'candidate_token', public.onboarding_issue_token('candidate',
          NULLIF(c->>'entity_id','')::uuid, NULLIF(v_raw->>'case_id','')::uuid, '{}'::jsonb),
      'legal_name', c->>'legal_name',
      'match_score', c->'match_score',
      'match_basis', c->>'match_basis'));
  END LOOP;

  RETURN jsonb_build_object(
    'outcome', v_raw->>'outcome',
    'case_reference', v_raw->>'case_number',
    'resolution_token', public.onboarding_issue_token('resolution', NULL,
        NULLIF(v_raw->>'case_id','')::uuid, _payload),
    'candidates', v_cands);
END $$;
GRANT EXECUTE ON FUNCTION public.onboarding_resolve_entity(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.onboarding_resolve_entity(jsonb) FROM anon;

-- Provision a provisional entity from a NO_MATCH resolution token ---------
CREATE OR REPLACE FUNCTION public.onboarding_provision_from_token(_resolution_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.onboarding_resolution_tokens; v_res jsonb; v_entity uuid;
BEGIN
  r := public.onboarding_redeem_token(_resolution_token, ARRAY['resolution']);
  v_res := public.wb_onboarding_provision_entity(
             r.payload || jsonb_build_object('case_id', r.case_id));
  v_entity := (v_res->>'entity_id')::uuid;
  UPDATE public.onboarding_resolution_tokens SET consumed_at = now() WHERE id = r.id;
  RETURN jsonb_build_object(
    'membership_target_token', public.onboarding_issue_token('membership_target', v_entity, r.case_id, '{}'::jsonb),
    'entity_display', jsonb_build_object('legal_name', r.payload->>'legal_name'));
END $$;
GRANT EXECUTE ON FUNCTION public.onboarding_provision_from_token(text) TO authenticated;
REVOKE ALL ON FUNCTION public.onboarding_provision_from_token(text) FROM anon;

-- Request membership by opaque token, and report the resume state --------
CREATE OR REPLACE FUNCTION public.onboarding_request_membership_by_token(
  _token text, _membership_role_key text, _authority_evidence_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.onboarding_resolution_tokens; v_membership uuid; v_status text; v_stage text; v_route text;
BEGIN
  r := public.onboarding_redeem_token(_token, ARRAY['membership_target','candidate']);
  IF r.entity_id IS NULL THEN RAISE EXCEPTION 'This reference has no entity to link' USING ERRCODE='22023'; END IF;

  v_membership := public.entity_membership_request(r.entity_id, _membership_role_key, _authority_evidence_reference);
  SELECT status INTO v_status FROM public.entity_user_memberships WHERE id = v_membership;

  v_stage := CASE WHEN v_status = 'APPROVED' THEN 'AUTHORITY_GRANTED' ELSE 'AUTHORITY_PENDING' END;

  UPDATE public.onboarding_journey_state
     SET stage = v_stage, entity_id = r.entity_id, membership_id = v_membership
   WHERE user_id = auth.uid()
   RETURNING intended_route INTO v_route;

  IF NOT FOUND THEN
    INSERT INTO public.onboarding_journey_state (user_id, stage, entity_id, membership_id)
    VALUES (auth.uid(), v_stage, r.entity_id, v_membership)
    RETURNING intended_route INTO v_route;
  END IF;

  UPDATE public.onboarding_resolution_tokens SET consumed_at = now() WHERE id = r.id;

  RETURN jsonb_build_object(
    'membership_status', v_status,
    'authority_sufficient', v_status = 'APPROVED',
    'stage', v_stage,
    'resume_route', COALESCE(v_route, CASE WHEN v_status = 'APPROVED' THEN '/applications/new' ELSE '/register/authority-pending' END));
END $$;
GRANT EXECUTE ON FUNCTION public.onboarding_request_membership_by_token(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.onboarding_request_membership_by_token(text, text, text) FROM anon;

-- Resumable state read ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.onboarding_journey_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.onboarding_journey_state; v_status text; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('stage','USER_ACCOUNT'); END IF;
  SELECT * INTO j FROM public.onboarding_journey_state WHERE user_id = auth.uid();
  IF j.id IS NULL THEN RETURN jsonb_build_object('stage','USER_ACCOUNT'); END IF;

  SELECT m.status INTO v_status FROM public.entity_user_memberships m WHERE m.id = j.membership_id;
  SELECT COALESCE(o.legal_name, l.name) INTO v_name
    FROM public.licensees l LEFT JOIN public.organizations o ON o.party_id = l.party_id
   WHERE l.id = j.entity_id;

  RETURN jsonb_build_object(
    'stage', CASE WHEN v_status = 'APPROVED' AND j.stage = 'AUTHORITY_PENDING' THEN 'AUTHORITY_GRANTED' ELSE j.stage END,
    'membership_status', v_status,
    'entity_display_name', v_name,
    'intended_journey', j.intended_journey,
    'resume_route', COALESCE(j.intended_route, '/applications/new'),
    'updated_at', j.updated_at);
END $$;
GRANT EXECUTE ON FUNCTION public.onboarding_journey_context() TO authenticated;
