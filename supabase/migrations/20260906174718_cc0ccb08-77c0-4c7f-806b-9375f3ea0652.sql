-- ===========================================================================
-- OS-02F1 — Management Assurance Authorization & Provenance Hardening
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Supersession columns (append-only correction mechanism)
-- ---------------------------------------------------------------------------
ALTER TABLE public.supervisory_signal_review
  ADD COLUMN IF NOT EXISTS supersedes_review_id uuid REFERENCES public.supervisory_signal_review(id),
  ADD COLUMN IF NOT EXISTS superseded_by_review_id uuid REFERENCES public.supervisory_signal_review(id),
  ADD COLUMN IF NOT EXISTS correction_reason text;

-- ---------------------------------------------------------------------------
-- 2. Revoke the direct write bypass
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.supervisory_signal_review FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.supervisory_signal_review FROM authenticated;
GRANT SELECT ON public.supervisory_signal_review TO authenticated;
GRANT ALL ON public.supervisory_signal_review TO service_role;

REVOKE ALL ON public.supervisory_assurance_policy FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.supervisory_assurance_policy FROM authenticated;
GRANT ALL ON public.supervisory_assurance_policy TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Canonical review authority (capability, not role names)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assurance_review_action(_module text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(coalesce(btrim(_module), ''))
    WHEN 'SUPERVISORY_SPINE' THEN 'review'
    WHEN 'AML_SUPERVISION' THEN 'review'
    WHEN 'PRUDENTIAL_SUPERVISION' THEN 'initiate_supervisory_action'
    WHEN 'MARKET_CONDUCT' THEN 'initiate_investigation'
    WHEN 'MARKET_CONDUCT_INVESTIGATION' THEN 'access_investigation_workspace'
    ELSE NULL
  END
$$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_review_action(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assurance_review_action(text) TO authenticated, service_role;

-- Review authority = domain-mapped review capability AND canonical entity scope.
CREATE OR REPLACE FUNCTION public.supervisory_assurance_review_admits(_uid uuid, _signal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entity uuid; _domain text; _fn uuid; _m text; _a text;
BEGIN
  IF _uid IS NULL OR _signal_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;

  SELECT s.entity_id, s.domain_code INTO _entity, _domain
  FROM public.supervisory_signal s WHERE s.id = _signal_id;
  IF _entity IS NULL THEN RETURN false; END IF;

  _fn := public.supervisory_domain_regulatory_function(_domain);

  -- always allow the spine-level review capability
  FOREACH _m IN ARRAY (public.supervisory_domain_modules(_domain) || ARRAY['supervisory_spine']) LOOP
    _a := public.supervisory_assurance_review_action(_m);
    CONTINUE WHEN _a IS NULL;
    IF public.regulatory_scope_allows(
         _uid, _m, _a, NULL, NULL, NULL, _entity, NULL,
         COALESCE(_fn, public.regulatory_function_for_module(_m))) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_review_admits(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assurance_review_admits(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Canonical linked-record resolution (server-derived reference)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assurance_link_resolve(
  _signal_id uuid, _module text, _record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.supervisory_signal;
  _mod text := upper(coalesce(btrim(_module), ''));
  _ref text; _ent uuid; _dom text; _rel boolean := false; _open boolean := true;
BEGIN
  IF _signal_id IS NULL OR _record_id IS NULL OR _mod = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'LINK_NOT_SUPPLIED');
  END IF;

  SELECT * INTO _s FROM public.supervisory_signal WHERE id = _signal_id;
  IF _s.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'SIGNAL_NOT_FOUND');
  END IF;

  IF _mod = 'SUPERVISORY_FINDING' THEN
    SELECT f.reference, f.entity_id, f.domain_code,
           (f.signal_id = _s.id)
             OR EXISTS (SELECT 1 FROM public.supervisory_attention_origin o
                        WHERE o.attention_id = f.attention_id AND o.signal_id = _s.id),
           f.closed_at IS NULL
      INTO _ref, _ent, _dom, _rel, _open
    FROM public.supervisory_finding f WHERE f.id = _record_id;

  ELSIF _mod = 'SUPERVISORY_REMEDIATION' THEN
    SELECT ra.reference, ra.entity_id, ra.domain_code,
           EXISTS (SELECT 1 FROM public.supervisory_finding f
                   WHERE f.id = ra.finding_id AND f.signal_id = _s.id),
           ra.closed_at IS NULL
      INTO _ref, _ent, _dom, _rel, _open
    FROM public.supervisory_remediation_action ra WHERE ra.id = _record_id;

  ELSIF _mod = 'SUPERVISORY_ATTENTION' THEN
    SELECT a.reference,
           CASE WHEN _s.entity_id = ANY (COALESCE(a.entity_ids, ARRAY[]::uuid[]))
                THEN _s.entity_id ELSE NULL END,
           a.domain_code,
           EXISTS (SELECT 1 FROM public.supervisory_attention_origin o
                   WHERE o.attention_id = a.id AND o.signal_id = _s.id),
           a.closed_at IS NULL
      INTO _ref, _ent, _dom, _rel, _open
    FROM public.supervisory_attention a WHERE a.id = _record_id;

  ELSIF _mod = 'REASSESSMENT_REQUIREMENT' THEN
    SELECT NULL::text, rr.entity_id, rr.domain_code,
           (rr.signal_id = _s.id),
           rr.status NOT IN ('CANCELLED', 'FULFILLED')
      INTO _ref, _ent, _dom, _rel, _open
    FROM public.supervisory_reassessment_requirement rr WHERE rr.id = _record_id;

  ELSE
    RETURN jsonb_build_object('valid', false, 'reason', 'UNSUPPORTED_LINK_MODULE');
  END IF;

  IF NOT FOUND OR (_ent IS NULL AND _dom IS NULL) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'LINKED_RECORD_NOT_FOUND');
  END IF;

  IF _ent IS DISTINCT FROM _s.entity_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'LINKED_RECORD_OTHER_ENTITY');
  END IF;

  IF _dom IS NOT NULL AND _s.domain_code IS NOT NULL
     AND _dom <> _s.domain_code
     AND _dom <> 'CROSS_DOMAIN' AND _s.domain_code <> 'CROSS_DOMAIN' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'LINKED_RECORD_OTHER_DOMAIN');
  END IF;

  RETURN jsonb_build_object(
    'valid', true, 'reason', 'RESOLVED', 'module', _mod, 'record_id', _record_id,
    'reference', _ref, 'entity_id', _ent, 'domain_code', _dom,
    'signal_related', COALESCE(_rel, false), 'is_open', COALESCE(_open, false));
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_link_resolve(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assurance_link_resolve(uuid, text, uuid) TO authenticated, service_role;

-- Traceability truth for a recorded disposition.
CREATE OR REPLACE FUNCTION public.supervisory_assurance_disposition_is_traceable(
  _signal_id uuid, _disposition text, _module text, _record_id uuid, _reference text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d text := upper(coalesce(btrim(_disposition), ''));
  _r jsonb;
BEGIN
  IF _d = '' THEN RETURN false; END IF;
  IF _d = 'NO_ACTION_REQUIRED' THEN RETURN true; END IF;
  -- No canonical supervisory-spine referral object exists: REFERRED can never
  -- evidence itself and must not suppress the missing-disposition condition.
  IF _d = 'REFERRED' THEN RETURN false; END IF;
  IF _d NOT IN ('ACTION_OPENED', 'REASSESSMENT_REQUIRED', 'COVERED_BY_EXISTING_ACTION') THEN
    RETURN false;
  END IF;

  _r := public.supervisory_assurance_link_resolve(_signal_id, _module, _record_id);
  IF NOT COALESCE((_r ->> 'valid')::boolean, false) THEN RETURN false; END IF;

  -- claimed reference must match the canonical record
  IF NULLIF(btrim(coalesce(_reference, '')), '') IS NOT NULL
     AND (_r ->> 'reference') IS NOT NULL
     AND btrim(_reference) <> (_r ->> 'reference') THEN
    RETURN false;
  END IF;

  IF _d = 'ACTION_OPENED' THEN
    RETURN COALESCE((_r ->> 'signal_related')::boolean, false)
       AND upper(coalesce(_module,'')) IN
           ('SUPERVISORY_FINDING','SUPERVISORY_REMEDIATION','SUPERVISORY_ATTENTION');
  ELSIF _d = 'REASSESSMENT_REQUIRED' THEN
    RETURN COALESCE((_r ->> 'signal_related')::boolean, false)
       AND upper(coalesce(_module,'')) = 'REASSESSMENT_REQUIREMENT';
  ELSE -- COVERED_BY_EXISTING_ACTION
    RETURN COALESCE((_r ->> 'is_open')::boolean, false)
       AND upper(coalesce(_module,'')) IN
           ('SUPERVISORY_FINDING','SUPERVISORY_REMEDIATION','SUPERVISORY_ATTENTION');
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_disposition_is_traceable(uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assurance_disposition_is_traceable(uuid, text, text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Scope-derived, capability-aware RLS on the review object
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS supervisory_signal_review_insert ON public.supervisory_signal_review;
DROP POLICY IF EXISTS supervisory_signal_review_update_own ON public.supervisory_signal_review;
DROP POLICY IF EXISTS supervisory_signal_review_read ON public.supervisory_signal_review;

CREATE POLICY supervisory_signal_review_read
ON public.supervisory_signal_review
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.supervisory_signal s
    WHERE s.id = supervisory_signal_review.signal_id
      AND public.supervisory_monitoring_scope_admits(
            auth.uid(), s.domain_code, s.entity_id, NULL, NULL)
  )
);

-- ---------------------------------------------------------------------------
-- 6. Append-only enforcement + governed supersession
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_signal_review_append_only_chk()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recorded supervisory reviews are immutable audit evidence and cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  -- The only permitted mutation is the governed supersession stamp.
  IF OLD.superseded_by_review_id IS NULL
     AND NEW.superseded_by_review_id IS NOT NULL
     AND coalesce(current_setting('app.assurance_supersede', true), '') = 'on'
     AND to_jsonb(NEW) - 'superseded_by_review_id' = to_jsonb(OLD) - 'superseded_by_review_id' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Recorded supervisory reviews are append-only; record a superseding review instead of editing history'
    USING ERRCODE = '42501';
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_signal_review_append_only_chk() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supervisory_signal_review_append_only ON public.supervisory_signal_review;
CREATE TRIGGER trg_supervisory_signal_review_append_only
BEFORE UPDATE OR DELETE ON public.supervisory_signal_review
FOR EACH ROW EXECUTE FUNCTION public.supervisory_signal_review_append_only_chk();

-- ---------------------------------------------------------------------------
-- 7. The single governed write path
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.supervisory_assurance_record_review(uuid, text, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.supervisory_assurance_record_review(
  _signal_id uuid,
  _review_note text DEFAULT NULL,
  _disposition text DEFAULT NULL,
  _disposition_rationale text DEFAULT NULL,
  _linked_module text DEFAULT NULL,
  _linked_record_id uuid DEFAULT NULL,
  _linked_reference text DEFAULT NULL,
  _supersedes_review_id uuid DEFAULT NULL,
  _correction_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.supervisory_signal;
  _uid uuid := auth.uid();
  _id uuid;
  _disp text := NULLIF(btrim(_disposition), '');
  _mod text := NULLIF(upper(btrim(coalesce(_linked_module, ''))), '');
  _link jsonb;
  _ref text;
  _prev public.supervisory_signal_review;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _s FROM public.supervisory_signal WHERE id = _signal_id;
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'Detected condition not found' USING ERRCODE = 'P0002';
  END IF;

  -- capability + canonical entity/domain scope, derived server-side
  IF NOT public.supervisory_assurance_review_admits(_uid, _s.id) THEN
    RAISE EXCEPTION 'You do not hold supervisory review authority for this entity and domain'
      USING ERRCODE = '42501';
  END IF;

  IF _disp IS NOT NULL AND _disp NOT IN
     ('ACTION_OPENED','REASSESSMENT_REQUIRED','COVERED_BY_EXISTING_ACTION','NO_ACTION_REQUIRED') THEN
    IF _disp = 'REFERRED' THEN
      RAISE EXCEPTION 'No canonical supervisory referral record exists to evidence a referral disposition'
        USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'Unrecognised supervisory disposition' USING ERRCODE = '23514';
  END IF;

  IF _disp = 'NO_ACTION_REQUIRED'
     AND (_disposition_rationale IS NULL OR length(btrim(_disposition_rationale)) < 10) THEN
    RAISE EXCEPTION 'A written rationale is required to record that no further supervisory action is needed'
      USING ERRCODE = '23514';
  END IF;

  IF _disp IN ('ACTION_OPENED','REASSESSMENT_REQUIRED','COVERED_BY_EXISTING_ACTION') THEN
    _link := public.supervisory_assurance_link_resolve(_s.id, _mod, _linked_record_id);
    IF NOT COALESCE((_link ->> 'valid')::boolean, false)
       OR NOT public.supervisory_assurance_disposition_is_traceable(
                _s.id, _disp, _mod, _linked_record_id, NULL) THEN
      RAISE EXCEPTION 'The supervisory record linked to this disposition could not be verified (%)',
        COALESCE(_link ->> 'reason', 'LINK_NOT_RELATED') USING ERRCODE = '23514';
    END IF;
    _ref := _link ->> 'reference';   -- server-derived; client value ignored
  ELSE
    _mod := NULL; _linked_record_id := NULL; _ref := NULL;
  END IF;

  IF _supersedes_review_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.supervisory_signal_review WHERE id = _supersedes_review_id;
    IF _prev.id IS NULL OR _prev.signal_id <> _s.id THEN
      RAISE EXCEPTION 'The review being superseded does not belong to this condition'
        USING ERRCODE = '23514';
    END IF;
    IF _prev.superseded_by_review_id IS NOT NULL THEN
      RAISE EXCEPTION 'That review has already been superseded' USING ERRCODE = '23514';
    END IF;
    IF _correction_reason IS NULL OR length(btrim(_correction_reason)) < 10 THEN
      RAISE EXCEPTION 'A written reason is required when superseding an earlier review'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.supervisory_signal_review (
    signal_id, entity_id, domain_code, reviewed_by, reviewed_at, review_note,
    occurrence_count_at_review, last_detected_at_at_review,
    disposition, disposition_rationale, disposition_by, disposition_at,
    linked_module, linked_record_id, linked_reference, provenance,
    supersedes_review_id, correction_reason)
  VALUES (
    _s.id, _s.entity_id, _s.domain_code, _uid, now(), NULLIF(btrim(_review_note), ''),
    _s.occurrence_count, _s.last_detected_at,
    _disp, NULLIF(btrim(_disposition_rationale), ''),
    CASE WHEN _disp IS NULL THEN NULL ELSE _uid END,
    CASE WHEN _disp IS NULL THEN NULL ELSE now() END,
    _mod, _linked_record_id, _ref,
    jsonb_build_object(
      'recorded_from', 'OS-02F Management Assurance',
      'condition_fingerprint', _s.fingerprint,
      'condition_source', jsonb_build_object('table', _s.source_table, 'id', _s.source_id),
      'detector_code', _s.detector_code,
      'authority', 'supervisory_assurance_review_admits',
      'link_resolution', COALESCE(_link, jsonb_build_object('valid', false, 'reason', 'NOT_APPLICABLE')),
      'supersedes_review_id', _supersedes_review_id),
    _supersedes_review_id, NULLIF(btrim(_correction_reason), ''))
  RETURNING id INTO _id;

  IF _supersedes_review_id IS NOT NULL THEN
    PERFORM set_config('app.assurance_supersede', 'on', true);
    UPDATE public.supervisory_signal_review
       SET superseded_by_review_id = _id
     WHERE id = _supersedes_review_id;
    PERFORM set_config('app.assurance_supersede', 'off', true);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (_uid, 'SUPERVISORY_CONDITION_REVIEW_RECORDED', 'supervisory_signal_review', _id,
    jsonb_build_object('signal_id', _s.id, 'disposition', _disp,
                       'linked_module', _mod, 'linked_record_id', _linked_record_id,
                       'linked_reference', _ref,
                       'supersedes_review_id', _supersedes_review_id),
    jsonb_build_object('domain_code', _s.domain_code, 'entity_id', _s.entity_id,
                       'detector_code', _s.detector_code,
                       'module', 'OS-02F_MANAGEMENT_ASSURANCE'));

  RETURN jsonb_build_object('review_id', _id, 'signal_id', _s.id,
                            'disposition', _disp, 'linked_reference', _ref,
                            'supersedes_review_id', _supersedes_review_id,
                            'reviewed_at', now());
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_record_review(uuid, text, text, text, text, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assurance_record_review(uuid, text, text, text, text, uuid, text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Assurance policy governance (reuse config_change_log convention)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assurance_policy_governance_chk()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _svc boolean := public.request_role() = 'service_role';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.effective_from <= CURRENT_DATE AND NOT _svc THEN
      RAISE EXCEPTION 'Effective assurance policy history cannot be deleted; supersede it with a new version'
        USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.config_change_log (table_name, record_id, action, old_data, changed_by)
    VALUES ('supervisory_assurance_policy', OLD.id, 'DELETE', to_jsonb(OLD), _uid);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, _uid);
    NEW.updated_by := COALESCE(NEW.updated_by, _uid);
    INSERT INTO public.config_change_log (table_name, record_id, action, new_data, changed_by)
    VALUES ('supervisory_assurance_policy', NEW.id, 'INSERT', to_jsonb(NEW), _uid);
    RETURN NEW;
  END IF;

  -- UPDATE: an effective version's material terms are immutable.
  IF OLD.effective_from <= CURRENT_DATE AND NOT _svc THEN
    IF (NEW.code, NEW.version, NEW.domain_code, NEW.effective_from,
        NEW.awaiting_review_tolerance_days, NEW.stale_activity_tolerance_days,
        NEW.repeat_occurrence_threshold, NEW.repeat_distinct_day_threshold,
        NEW.material_severities)
       IS DISTINCT FROM
       (OLD.code, OLD.version, OLD.domain_code, OLD.effective_from,
        OLD.awaiting_review_tolerance_days, OLD.stale_activity_tolerance_days,
        OLD.repeat_occurrence_threshold, OLD.repeat_distinct_day_threshold,
        OLD.material_severities) THEN
      RAISE EXCEPTION 'An effective assurance policy version cannot be rewritten; issue a new version instead'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.created_by := OLD.created_by;
  NEW.updated_by := COALESCE(_uid, OLD.updated_by);
  INSERT INTO public.config_change_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('supervisory_assurance_policy', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), _uid);
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_policy_governance_chk() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supervisory_assurance_policy_governance ON public.supervisory_assurance_policy;
CREATE TRIGGER trg_supervisory_assurance_policy_governance
BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_assurance_policy
FOR EACH ROW EXECUTE FUNCTION public.supervisory_assurance_policy_governance_chk();

INSERT INTO public.config_governed_tables (
  table_name, domain, required_module_key, required_create_action, required_edit_action,
  soft_delete_column, soft_delete_retired_value, allow_hard_delete,
  immutable_columns, notes)
VALUES ('supervisory_assurance_policy', 'supervision', 'system_configuration', 'edit', 'edit',
        'is_active', 'false', false,
        ARRAY['id','created_at','created_by','code','version','effective_from'],
        'Supervisory management-assurance tolerance policy; versioned and effective-dated (OS-02F1)')
ON CONFLICT (table_name) DO UPDATE
  SET domain = EXCLUDED.domain,
      required_module_key = EXCLUDED.required_module_key,
      required_create_action = EXCLUDED.required_create_action,
      required_edit_action = EXCLUDED.required_edit_action,
      soft_delete_column = EXCLUDED.soft_delete_column,
      soft_delete_retired_value = EXCLUDED.soft_delete_retired_value,
      allow_hard_delete = EXCLUDED.allow_hard_delete,
      immutable_columns = EXCLUDED.immutable_columns,
      notes = EXCLUDED.notes;