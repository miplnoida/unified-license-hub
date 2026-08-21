-- ============================================================
-- Phase B / P08.9–P08.11 — Canonical Conduct Finding model
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conduct_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_reference text NOT NULL UNIQUE,
  source_type text NOT NULL CHECK (source_type IN ('conduct_investigation','complaint','conduct_alert','thematic_review','examination','monitoring')),
  source_id uuid NOT NULL,
  investigation_id uuid REFERENCES public.conduct_investigations(id) ON DELETE SET NULL,
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL,
  entity_id uuid,
  category text,
  conduct_risk_category_id uuid REFERENCES public.conduct_risk_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  risk_rating text CHECK (risk_rating IS NULL OR risk_rating IN ('low','moderate','elevated','high','severe')),
  legal_basis text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','under_analysis','awaiting_entity_response','response_received','confirmed','dismissed','remediation_required','closed')),
  owner_id uuid,
  owner_team text,
  entity_response text,
  entity_response_at timestamptz,
  remediation_required boolean NOT NULL DEFAULT false,
  enforcement_action_id uuid,
  enforcement_referred_at timestamptz,
  dismissal_reason text,
  closure_rationale text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conduct_findings TO authenticated;
GRANT ALL ON public.conduct_findings TO service_role;

ALTER TABLE public.conduct_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conduct_findings_internal_read" ON public.conduct_findings;
CREATE POLICY "conduct_findings_internal_read" ON public.conduct_findings
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'market_conduct', 'view'));

CREATE INDEX IF NOT EXISTS idx_conduct_findings_source ON public.conduct_findings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_conduct_findings_investigation ON public.conduct_findings(investigation_id);
CREATE INDEX IF NOT EXISTS idx_conduct_findings_complaint ON public.conduct_findings(complaint_id);
CREATE INDEX IF NOT EXISTS idx_conduct_findings_entity ON public.conduct_findings(entity_id);
CREATE INDEX IF NOT EXISTS idx_conduct_findings_status ON public.conduct_findings(status);

DROP TRIGGER IF EXISTS trg_conduct_findings_touch ON public.conduct_findings;
CREATE TRIGGER trg_conduct_findings_touch BEFORE UPDATE ON public.conduct_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evidence may relate to a finding: reuse the canonical evidence store.
ALTER TABLE public.conduct_evidence
  ADD COLUMN IF NOT EXISTS finding_id uuid REFERENCES public.conduct_findings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conduct_evidence_finding ON public.conduct_evidence(finding_id);

-- Remediation actions may be raised from a finding.
ALTER TABLE public.conduct_actions
  ADD COLUMN IF NOT EXISTS finding_id uuid REFERENCES public.conduct_findings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conduct_actions_finding ON public.conduct_actions(finding_id);

-- ------------------------------------------------------------
-- Reference generator
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_finding_next_reference()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'CF-' || to_char(now(), 'YYYY') || '-' ||
         lpad((1 + coalesce((
           SELECT max(substring(f.finding_reference from '[0-9]+$')::int)
             FROM public.conduct_findings f
            WHERE f.finding_reference LIKE 'CF-' || to_char(now(), 'YYYY') || '-%'), 0))::text, 5, '0');
$$;

REVOKE ALL ON FUNCTION public.conduct_finding_next_reference() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_finding_next_reference() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Available actions — the only authority for finding progression
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_finding_available_actions(_finding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _f record; _uid uuid := auth.uid(); _out jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN RETURN _out; END IF;
  SELECT * INTO _f FROM public.conduct_findings WHERE id = _finding_id;
  IF _f IS NULL THEN RETURN _out; END IF;
  IF NOT public.has_permission(_uid, 'market_conduct', 'edit') THEN RETURN _out; END IF;
  IF _f.status = 'closed' THEN RETURN _out; END IF;

  IF _f.status IN ('draft','under_analysis','response_received') THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','UPDATE_ANALYSIS','label','Update analysis','variant','outline','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','description','label','Finding analysis','type','textarea','required',true,'min_length',20),
        jsonb_build_object('name','legal_basis','label','Legal / regulatory basis','type','textarea','required',false),
        jsonb_build_object('name','severity','label','Severity','type','select','required',false,'options',jsonb_build_array('low','medium','high','critical')))));
  END IF;

  IF _f.status IN ('draft','under_analysis') THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','REQUEST_ENTITY_RESPONSE','label','Request entity response','variant','default','enabled',
      (coalesce(btrim(_f.description),'') <> ''),
      'blocked_reason', CASE WHEN coalesce(btrim(_f.description),'') = '' THEN 'Record the finding analysis first' ELSE NULL END,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','note','label','What the entity must address','type','textarea','required',true,'min_length',10))));
  END IF;

  IF _f.status = 'awaiting_entity_response' THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','RECORD_RESPONSE','label','Record entity response','variant','default','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','entity_response','label','Entity response','type','textarea','required',true,'min_length',10))));
  END IF;

  IF _f.status IN ('under_analysis','response_received','draft') THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','CONFIRM_FINDING','label','Confirm finding','variant','default','enabled',
      (coalesce(btrim(_f.description),'') <> ''),
      'blocked_reason', CASE WHEN coalesce(btrim(_f.description),'') = '' THEN 'Record the finding analysis first' ELSE NULL END,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','note','label','Confirmation rationale','type','textarea','required',true,'min_length',10),
        jsonb_build_object('name','risk_rating','label','Risk rating','type','select','required',false,
          'options', jsonb_build_array('low','moderate','elevated','high','severe')))));

    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','DISMISS_FINDING','label','Dismiss / false positive','variant','outline','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','reason','label','Why this finding is not sustained','type','textarea','required',true,'min_length',10))));
  END IF;

  IF _f.status = 'confirmed' THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','REQUIRE_REMEDIATION','label','Require remediation','variant','default','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','requirement','label','Required remediation','type','textarea','required',true,'min_length',20),
        jsonb_build_object('name','due_date','label','Remediation due date','type','date','required',true))));

    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','REFER_TO_ENFORCEMENT','label','Refer to enforcement','variant','outline','enabled',
      (_f.investigation_id IS NOT NULL OR _f.complaint_id IS NOT NULL),
      'blocked_reason', CASE WHEN _f.investigation_id IS NULL AND _f.complaint_id IS NULL
        THEN 'Enforcement referral requires a canonical complaint or investigation source' ELSE NULL END,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','note','label','Referral rationale','type','textarea','required',true,'min_length',20))));
  END IF;

  IF _f.status IN ('confirmed','remediation_required','dismissed') THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','CLOSE_FINDING','label','Close finding','variant','outline','enabled',
      NOT EXISTS (SELECT 1 FROM public.conduct_actions a
                   WHERE a.finding_id = _f.id AND a.status NOT IN ('completed','waived','cancelled')),
      'blocked_reason', CASE WHEN EXISTS (SELECT 1 FROM public.conduct_actions a
                   WHERE a.finding_id = _f.id AND a.status NOT IN ('completed','waived','cancelled'))
        THEN 'Outstanding remediation must be completed, waived or cancelled first' ELSE NULL END,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','note','label','Closure rationale','type','textarea','required',true,'min_length',10))));
  END IF;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.conduct_finding_available_actions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_finding_available_actions(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Raise a finding — provenance is mandatory
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_finding_raise(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid;
  _src_type text := nullif(btrim(_payload->>'source_type'), '');
  _src_id uuid := nullif(_payload->>'source_id', '')::uuid;
  _inv uuid; _cmp uuid; _entity uuid; _id uuid;
BEGIN
  _uid := public.conduct_require('market_conduct', 'edit');
  IF _src_type IS NULL OR _src_id IS NULL THEN
    RAISE EXCEPTION 'A finding must record its exact source (source_type and source_id)' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(_payload->>'title')), 0) < 5 THEN
    RAISE EXCEPTION 'A finding title of at least 5 characters is required' USING ERRCODE = '22023';
  END IF;

  IF _src_type = 'conduct_investigation' THEN
    SELECT i.id, i.licensee_id,
           CASE WHEN i.source_type = 'complaint' THEN i.source_id ELSE NULL END
      INTO _inv, _entity, _cmp
      FROM public.conduct_investigations i WHERE i.id = _src_id;
    IF _inv IS NULL THEN RAISE EXCEPTION 'Source investigation not found' USING ERRCODE = 'P0002'; END IF;
  ELSIF _src_type = 'complaint' THEN
    SELECT c.id, coalesce(c.licensee_id, c.license_holder_id) INTO _cmp, _entity
      FROM public.complaints c WHERE c.id = _src_id;
    IF _cmp IS NULL THEN RAISE EXCEPTION 'Source complaint not found' USING ERRCODE = 'P0002'; END IF;
  ELSIF _src_type = 'conduct_alert' THEN
    SELECT a.licensee_id, a.complaint_id, a.investigation_id INTO _entity, _cmp, _inv
      FROM public.conduct_alerts a WHERE a.id = _src_id;
  END IF;

  _entity := coalesce(nullif(_payload->>'entity_id','')::uuid, _entity);

  INSERT INTO public.conduct_findings(
    finding_reference, source_type, source_id, investigation_id, complaint_id, entity_id,
    category, conduct_risk_category_id, title, description, severity, legal_basis,
    status, owner_id, owner_team, created_by)
  VALUES (
    public.conduct_finding_next_reference(), _src_type, _src_id, _inv, _cmp, _entity,
    nullif(btrim(_payload->>'category'), ''),
    nullif(_payload->>'conduct_risk_category_id','')::uuid,
    btrim(_payload->>'title'),
    nullif(btrim(_payload->>'description'), ''),
    coalesce(nullif(_payload->>'severity',''), 'medium'),
    nullif(btrim(_payload->>'legal_basis'), ''),
    CASE WHEN coalesce(btrim(_payload->>'description'),'') = '' THEN 'draft' ELSE 'under_analysis' END,
    coalesce(nullif(_payload->>'owner_id','')::uuid, _uid),
    nullif(btrim(_payload->>'owner_team'), ''),
    _uid)
  RETURNING id INTO _id;

  PERFORM public.log_compliance_audit('CREATE', 'conduct_finding', _id, NULL,
    (SELECT to_jsonb(f) FROM public.conduct_findings f WHERE f.id = _id),
    'Finding raised from ' || _src_type);

  RETURN jsonb_build_object('id', _id);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_finding_raise(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_finding_raise(jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Governed finding step
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_finding_step(_finding_id uuid, _action_code text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _actions jsonb; _action jsonb; _before jsonb; _after jsonb; _f record; _act_id uuid;
BEGIN
  _uid := public.conduct_require('market_conduct', 'edit');
  _actions := public.conduct_finding_available_actions(_finding_id);
  SELECT a INTO _action FROM jsonb_array_elements(_actions) a WHERE a->>'action_code' = _action_code;
  IF _action IS NULL THEN
    RAISE EXCEPTION 'Action % is not available for this finding', _action_code USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce((_action->>'enabled')::boolean, false) THEN
    RAISE EXCEPTION '%', coalesce(_action->>'blocked_reason', 'Action is blocked') USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(f) INTO _before FROM public.conduct_findings f WHERE f.id = _finding_id;
  SELECT * INTO _f FROM public.conduct_findings WHERE id = _finding_id;

  IF _action_code = 'UPDATE_ANALYSIS' THEN
    IF coalesce(length(btrim(_payload->>'description')), 0) < 20 THEN
      RAISE EXCEPTION 'Finding analysis of at least 20 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_findings
       SET description = btrim(_payload->>'description'),
           legal_basis = coalesce(nullif(btrim(_payload->>'legal_basis'), ''), legal_basis),
           severity = coalesce(nullif(_payload->>'severity', ''), severity),
           status = CASE WHEN status = 'draft' THEN 'under_analysis' ELSE status END
     WHERE id = _finding_id;

  ELSIF _action_code = 'REQUEST_ENTITY_RESPONSE' THEN
    IF coalesce(length(btrim(_payload->>'note')), 0) < 10 THEN
      RAISE EXCEPTION 'Describe what the entity must address (min 10 characters)' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_findings SET status = 'awaiting_entity_response' WHERE id = _finding_id;

  ELSIF _action_code = 'RECORD_RESPONSE' THEN
    IF coalesce(length(btrim(_payload->>'entity_response')), 0) < 10 THEN
      RAISE EXCEPTION 'An entity response of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_findings
       SET entity_response = btrim(_payload->>'entity_response'),
           entity_response_at = now(), status = 'response_received'
     WHERE id = _finding_id;

  ELSIF _action_code = 'CONFIRM_FINDING' THEN
    IF coalesce(length(btrim(_payload->>'note')), 0) < 10 THEN
      RAISE EXCEPTION 'A confirmation rationale of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_findings
       SET status = 'confirmed',
           risk_rating = coalesce(nullif(_payload->>'risk_rating', ''), risk_rating)
     WHERE id = _finding_id;

  ELSIF _action_code = 'DISMISS_FINDING' THEN
    IF coalesce(length(btrim(_payload->>'reason')), 0) < 10 THEN
      RAISE EXCEPTION 'A dismissal reason of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_findings
       SET status = 'dismissed', dismissal_reason = btrim(_payload->>'reason')
     WHERE id = _finding_id;

  ELSIF _action_code = 'REQUIRE_REMEDIATION' THEN
    IF coalesce(length(btrim(_payload->>'requirement')), 0) < 20
       OR coalesce(nullif(_payload->>'due_date', ''), '') = '' THEN
      RAISE EXCEPTION 'A remediation requirement (min 20 characters) and due date are required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.conduct_actions(
      source_module, source_id, finding_id, entity_id, action_type, title, description,
      due_date, status, created_by, metadata)
    VALUES (
      'conduct_finding', _finding_id, _finding_id, _f.entity_id, 'remediation',
      'Remediation: ' || _f.finding_reference, btrim(_payload->>'requirement'),
      (_payload->>'due_date')::date, 'open', _uid,
      jsonb_build_object('finding_reference', _f.finding_reference,
                         'source_type', _f.source_type, 'source_id', _f.source_id))
    RETURNING id INTO _act_id;
    UPDATE public.conduct_findings
       SET status = 'remediation_required', remediation_required = true
     WHERE id = _finding_id;

  ELSIF _action_code = 'REFER_TO_ENFORCEMENT' THEN
    IF coalesce(length(btrim(_payload->>'note')), 0) < 20 THEN
      RAISE EXCEPTION 'A referral rationale of at least 20 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_findings SET enforcement_referred_at = now() WHERE id = _finding_id;

  ELSIF _action_code = 'CLOSE_FINDING' THEN
    IF coalesce(length(btrim(_payload->>'note')), 0) < 10 THEN
      RAISE EXCEPTION 'A closure rationale of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_findings
       SET status = 'closed', closed_at = now(), closure_rationale = btrim(_payload->>'note')
     WHERE id = _finding_id;
  ELSE
    RAISE EXCEPTION 'Unsupported action %', _action_code USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(f) INTO _after FROM public.conduct_findings f WHERE f.id = _finding_id;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_finding', _finding_id, _before, _after,
    _action_code || coalesce(' — ' || nullif(btrim(_payload->>'note'), ''), ''));

  RETURN jsonb_build_object('id', _finding_id, 'remediation_action_id', _act_id);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_finding_step(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_finding_step(uuid, text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Finding read models: case + register with server paging/counts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_finding_case(_finding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _f record; _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT f.*, l.name AS entity_name, p.full_name AS owner_name,
         i.code AS investigation_code, c.complaint_number
    INTO _f
    FROM public.conduct_findings f
    LEFT JOIN public.licensees l ON l.id = f.entity_id
    LEFT JOIN public.profiles p ON p.id = f.owner_id
    LEFT JOIN public.conduct_investigations i ON i.id = f.investigation_id
    LEFT JOIN public.complaints c ON c.id = f.complaint_id
   WHERE f.id = _finding_id;
  IF _f IS NULL THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE = 'P0002'; END IF;

  _res := to_jsonb(_f) || jsonb_build_object(
    'source_href', CASE
      WHEN _f.source_type = 'conduct_investigation' THEN '/conduct/investigations/' || _f.source_id
      WHEN _f.source_type = 'complaint' THEN '/complaints/' || _f.source_id
      WHEN _f.source_type = 'conduct_alert' THEN '/conduct/alerts?alert=' || _f.source_id
      ELSE NULL END,
    'entity_href', CASE WHEN _f.entity_id IS NOT NULL THEN '/entities/' || _f.entity_id ELSE NULL END,
    'available_actions', public.conduct_finding_available_actions(_finding_id),
    'evidence', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'evidence_type', e.evidence_type,
        'restricted', e.restricted, 'uploaded_at', e.uploaded_at) ORDER BY e.uploaded_at DESC), '[]'::jsonb)
      FROM public.conduct_evidence e WHERE e.finding_id = _finding_id),
    'remediation', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'status', a.status, 'due_date', a.due_date,
        'href', '/conduct/actions?action=' || a.id) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM public.conduct_actions a WHERE a.finding_id = _finding_id)
  );
  RETURN _res;
END; $$;

REVOKE ALL ON FUNCTION public.conduct_finding_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_finding_case(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_finding_register(
  _statuses text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _source_type text DEFAULT NULL,
  _investigation_id uuid DEFAULT NULL,
  _complaint_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _include_closed boolean DEFAULT false,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, finding_reference text, title text, source_type text, source_id uuid, source_href text,
  investigation_id uuid, complaint_id uuid, entity_id uuid, entity_name text, category text,
  severity text, risk_rating text, status text, owner_id uuid, owner_name text, owner_team text,
  remediation_required boolean, open_remediation bigint, evidence_count bigint,
  enforcement_referred_at timestamptz, opened_at timestamptz, closed_at timestamptz,
  last_activity_at timestamptz, canonical_href text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  RETURN QUERY
  WITH scoped AS (
    SELECT f.*, l.name AS entity_name, p.full_name AS owner_name
      FROM public.conduct_findings f
      LEFT JOIN public.licensees l ON l.id = f.entity_id
      LEFT JOIN public.profiles p ON p.id = f.owner_id
     WHERE (_include_closed OR f.status <> 'closed')
       AND (_statuses IS NULL OR f.status = ANY(_statuses))
       AND (_entity_id IS NULL OR f.entity_id = _entity_id)
       AND (_source_type IS NULL OR f.source_type = _source_type)
       AND (_investigation_id IS NULL OR f.investigation_id = _investigation_id)
       AND (_complaint_id IS NULL OR f.complaint_id = _complaint_id)
       AND (_search IS NULL OR btrim(_search) = '' OR
            f.finding_reference ILIKE '%' || btrim(_search) || '%' OR
            f.title ILIKE '%' || btrim(_search) || '%' OR
            coalesce(l.name, '') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.id, s.finding_reference, s.title, s.source_type, s.source_id,
         CASE
           WHEN s.source_type = 'conduct_investigation' THEN '/conduct/investigations/' || s.source_id
           WHEN s.source_type = 'complaint' THEN '/complaints/' || s.source_id
           WHEN s.source_type = 'conduct_alert' THEN '/conduct/alerts?alert=' || s.source_id
           ELSE NULL END,
         s.investigation_id, s.complaint_id, s.entity_id, s.entity_name, s.category,
         s.severity, s.risk_rating, s.status, s.owner_id, s.owner_name, s.owner_team,
         s.remediation_required,
         (SELECT count(*) FROM public.conduct_actions a
           WHERE a.finding_id = s.id AND a.status NOT IN ('completed','waived','cancelled')),
         (SELECT count(*) FROM public.conduct_evidence e WHERE e.finding_id = s.id),
         s.enforcement_referred_at, s.opened_at, s.closed_at,
         greatest(s.updated_at, s.created_at),
         '/conduct/findings/' || s.id,
         counted.n
    FROM scoped s CROSS JOIN counted
   ORDER BY CASE s.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            s.opened_at DESC
   LIMIT greatest(1, least(coalesce(_limit, 50), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END; $$;

REVOKE ALL ON FUNCTION public.conduct_finding_register(text[], uuid, text, uuid, uuid, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_finding_register(text[], uuid, text, uuid, uuid, text, boolean, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_finding_register_counts(_entity_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT jsonb_build_object(
    'total_open', count(*) FILTER (WHERE f.status <> 'closed'),
    'awaiting_response', count(*) FILTER (WHERE f.status = 'awaiting_entity_response'),
    'confirmed', count(*) FILTER (WHERE f.status = 'confirmed'),
    'remediation_required', count(*) FILTER (WHERE f.status = 'remediation_required'),
    'high_severity', count(*) FILTER (WHERE f.status <> 'closed' AND f.severity IN ('high','critical')),
    'enforcement_referred', count(*) FILTER (WHERE f.enforcement_referred_at IS NOT NULL),
    'closed', count(*) FILTER (WHERE f.status = 'closed'),
    'by_status', coalesce((SELECT jsonb_object_agg(x.status, x.n) FROM (
        SELECT g.status, count(*) AS n FROM public.conduct_findings g
         WHERE (_entity_id IS NULL OR g.entity_id = _entity_id) GROUP BY g.status) x), '{}'::jsonb))
    INTO _res
  FROM public.conduct_findings f
  WHERE (_entity_id IS NULL OR f.entity_id = _entity_id);
  RETURN coalesce(_res, '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_finding_register_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_finding_register_counts(uuid) TO authenticated, service_role;