-- MC-08 item 10 — platform-wide AI capability inventory beyond Conduct 360.
CREATE TABLE IF NOT EXISTS public.ai_governance_surfaces (
  code text PRIMARY KEY,
  label text NOT NULL,
  owning_module text NOT NULL,
  business_purpose text NOT NULL,
  advisory_classification text NOT NULL DEFAULT 'ADVISORY_HUMAN_REVIEWED',
  production_status text NOT NULL DEFAULT 'IN_PRODUCTION',
  lifecycle_state public.ai_gov_lifecycle NOT NULL DEFAULT 'DRAFT',
  approved_model_id uuid REFERENCES public.ai_governance_models(id),
  instruction_governance text NOT NULL DEFAULT 'EMBEDDED_IN_SERVER_FUNCTION',
  human_review text NOT NULL DEFAULT 'HUMAN_REVIEW_REQUIRED',
  authoritative_write_path text NOT NULL DEFAULT 'NONE',
  edge_function text,
  created_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  suspended_at timestamptz,
  suspended_by uuid,
  suspension_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_gov_surfaces_advisory_chk CHECK (advisory_classification = 'ADVISORY_HUMAN_REVIEWED'),
  CONSTRAINT ai_gov_surfaces_write_chk CHECK (authoritative_write_path = 'NONE')
);

GRANT SELECT ON public.ai_governance_surfaces TO authenticated;
GRANT ALL ON public.ai_governance_surfaces TO service_role;
ALTER TABLE public.ai_governance_surfaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_gov_surfaces_read ON public.ai_governance_surfaces;
CREATE POLICY ai_gov_surfaces_read ON public.ai_governance_surfaces
  FOR SELECT TO authenticated USING (public.ai_gov_can_read(auth.uid()));

DROP TRIGGER IF EXISTS trg_ai_gov_surfaces_touch ON public.ai_governance_surfaces;
CREATE TRIGGER trg_ai_gov_surfaces_touch BEFORE UPDATE ON public.ai_governance_surfaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_governance_surfaces
  (code, label, owning_module, business_purpose, lifecycle_state, edge_function,
   approved_model_id, approved_at, human_review, authoritative_write_path)
SELECT v.code, v.label, v.owning_module, v.purpose, 'ACTIVE'::public.ai_gov_lifecycle, v.fn,
       (SELECT id FROM public.ai_governance_models
          WHERE technical_identifier = v.model AND lifecycle_state = 'ACTIVE' LIMIT 1),
       now(), 'HUMAN_REVIEW_REQUIRED', 'NONE'
FROM (VALUES
  ('PRUDENTIAL_ANALYSIS', 'Prudential analysis narrative', 'prudential_supervision',
   'Drafts a narrative reading of recorded prudential indicators for a supervisor to review. It proposes no rating and takes no decision.',
   'generate-prudential-ai-analysis', 'google/gemini-2.5-flash'),
  ('SUPERVISORY_ANALYSIS', 'Supervisory analysis report', 'supervisory_intelligence',
   'Drafts a supervisory analysis report from recorded supervisory data for review before any use.',
   'generate-supervisory-ai-analysis', 'google/gemini-2.5-flash'),
  ('DASHBOARD_INSIGHTS', 'Dashboard observations', 'analytics',
   'Suggests observations on dashboard figures. Advisory commentary only; the figures themselves are deterministic.',
   'generate-dashboard-insights', 'google/gemini-2.5-flash'),
  ('APPLICATION_ASSESSMENT', 'Application assessment support', 'application_management',
   'Highlights points in a submitted application for an assessor to consider. It does not approve, refuse or decide any application.',
   'generate-application-ai-assessment', 'google/gemini-2.5-flash'),
  ('FP_MEDIA_READING', 'Fit and proper media reading', 'fit_and_proper',
   'Summarises openly available media material gathered during fit-and-proper screening for an officer to verify. It records no finding.',
   'fp-ai-media-ingest', 'google/gemini-2.5-flash')
) AS v(code, label, owning_module, purpose, fn, model)
ON CONFLICT (code) DO NOTHING;

-- Governed status change for an inventory capability.
CREATE OR REPLACE FUNCTION public.ai_governance_surface_set_state(
  _code text, _to_state text, _rationale text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _from public.ai_gov_lifecycle; _to public.ai_gov_lifecycle;
BEGIN
  BEGIN _to := _to_state::public.ai_gov_lifecycle;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'unsupported_state: %', _to_state USING ERRCODE = '22023';
  END;
  _uid := public.ai_gov_require(ARRAY['approve']);

  SELECT lifecycle_state INTO _from FROM public.ai_governance_surfaces WHERE code = _code FOR UPDATE;
  IF _from IS NULL THEN
    RAISE EXCEPTION 'governance_object_not_found: SURFACE %', _code USING ERRCODE = 'P0002';
  END IF;
  IF _from = _to THEN
    RAISE EXCEPTION 'no_state_change: already %', _to USING ERRCODE = '22023';
  END IF;
  IF NOT public.ai_gov_transition_allowed(_from, _to) THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _from, _to USING ERRCODE = '22023';
  END IF;
  IF _to IN ('SUSPENDED','RETIRED') AND COALESCE(btrim(_rationale),'') = '' THEN
    RAISE EXCEPTION 'rationale_required: % requires a written reason', _to USING ERRCODE = '22023';
  END IF;

  UPDATE public.ai_governance_surfaces
     SET lifecycle_state = _to,
         approved_at = CASE WHEN _to = 'ACTIVE' THEN COALESCE(approved_at, now()) ELSE approved_at END,
         approved_by = CASE WHEN _to = 'ACTIVE' THEN COALESCE(approved_by, _uid) ELSE approved_by END,
         suspended_at = CASE WHEN _to = 'SUSPENDED' THEN now() WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_at END,
         suspended_by = CASE WHEN _to = 'SUSPENDED' THEN _uid WHEN _to = 'ACTIVE' THEN NULL ELSE suspended_by END,
         suspension_reason = CASE WHEN _to = 'SUSPENDED' THEN btrim(_rationale) WHEN _to = 'ACTIVE' THEN NULL ELSE suspension_reason END
   WHERE code = _code;

  INSERT INTO public.ai_governance_events
    (object_type, object_code, event_type, from_state, to_state, actor_id, actor_role, rationale)
  VALUES ('SURFACE', _code, 'LIFECYCLE_TRANSITION', _from::text, _to::text, _uid,
          public.ai_gov_actor_role(_uid), btrim(_rationale));

  RETURN jsonb_build_object('code', _code, 'from_state', _from, 'to_state', _to);
END $$;

REVOKE ALL ON FUNCTION public.ai_governance_surface_set_state(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_surface_set_state(text, text, text) TO authenticated, service_role;

-- Fail-closed gate for inventory capabilities. Runs as the caller.
CREATE OR REPLACE FUNCTION public.ai_governance_surface_gate(
  _code text, _acting_user uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := COALESCE(_acting_user, auth.uid());
  _s public.ai_governance_surfaces;
  _m public.ai_governance_models;
  _stop record;
  _deny text; _reason text; _scope text;
BEGIN
  SELECT * INTO _s FROM public.ai_governance_surfaces WHERE code = _code;
  IF _s.code IS NULL THEN
    _reason := 'CAPABILITY_NOT_REGISTERED';
    _deny := 'This AI capability is not registered for governance, so no AI request was made.';
  ELSE
    SELECT * INTO _stop FROM public.ai_governance_kill_switches
      WHERE is_engaged AND scope_key IN ('GLOBAL', _s.owning_module)
      ORDER BY CASE WHEN scope_key = 'GLOBAL' THEN 0 ELSE 1 END LIMIT 1;
    IF _stop.scope_key IS NOT NULL THEN
      _reason := 'AI_STOPPED'; _scope := _stop.scope_key;
      _deny := 'AI assistance is currently stopped by the regulator. Regulatory records, deterministic rule outcomes and supervisory workflows are unaffected.';
    ELSIF _s.lifecycle_state <> 'ACTIVE' THEN
      _reason := 'CAPABILITY_NOT_APPROVED';
      _deny := 'This AI capability is not approved for use at present.';
    ELSIF _uid IS NULL THEN
      _reason := 'NOT_AUTHENTICATED'; _deny := 'Authentication is required.';
    ELSIF NOT (public.is_super_admin(_uid)
               OR public.has_permission(_uid, _s.owning_module, 'view')
               OR public.has_permission(_uid, 'ai_management', 'view')) THEN
      _reason := 'ROLE_NOT_PERMITTED';
      _deny := 'You do not have rights to request AI assistance for this area.';
    ELSE
      SELECT * INTO _m FROM public.ai_governance_models WHERE id = _s.approved_model_id;
      IF _m.id IS NULL OR _m.lifecycle_state <> 'ACTIVE' THEN
        _reason := 'MODEL_NOT_APPROVED';
        _deny := 'No approved model is bound to this AI capability.';
      END IF;
    END IF;
  END IF;

  IF _reason IS NOT NULL THEN
    INSERT INTO public.ai_governance_events
      (object_type, object_code, event_type, actor_id, actor_role, rationale, metadata)
    VALUES ('SURFACE', _code, 'EXECUTION_REFUSED', _uid,
            CASE WHEN _uid IS NULL THEN 'unknown' ELSE public.ai_gov_actor_role(_uid) END,
            _deny, jsonb_build_object('reason_code', _reason, 'stop_scope', _scope));
    RETURN jsonb_build_object('allowed', false, 'reason_code', _reason, 'message', _deny,
                              'stop_scope', _scope,
                              'governance_note', 'The regulatory record, deterministic rule outcomes and supervisory workflow are unaffected.');
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'code', _s.code, 'owning_module', _s.owning_module,
    'provider', _m.provider, 'model', _m.technical_identifier,
    'model_version', COALESCE(_m.model_version, _m.technical_identifier),
    'external_data_allowed', _m.external_data_capable,
    'human_review_required', true);
END $$;

REVOKE ALL ON FUNCTION public.ai_governance_surface_gate(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ai_governance_surface_gate(text, uuid) TO authenticated, service_role;