
-- =====================================================================
-- P04 LICENCE LIFECYCLE — canonical objects, read models, governed ops
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.license_lifecycle_matters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  matter_kind text NOT NULL CHECK (matter_kind IN ('renewal','variation','condition_review','suspension','revocation','surrender','expiry')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','withdrawn')),
  title text,
  reason text,
  decision text,
  renewal_id uuid REFERENCES public.license_renewals(id) ON DELETE SET NULL,
  due_at timestamptz,
  waiting_on text NOT NULL DEFAULT 'regulator' CHECK (waiting_on IN ('regulator','entity','third_party','system')),
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_license ON public.license_lifecycle_matters(license_id);
CREATE INDEX IF NOT EXISTS idx_llm_open ON public.license_lifecycle_matters(status, matter_kind);

GRANT SELECT ON public.license_lifecycle_matters TO authenticated;
GRANT ALL ON public.license_lifecycle_matters TO service_role;
ALTER TABLE public.license_lifecycle_matters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "llm_read" ON public.license_lifecycle_matters;
CREATE POLICY "llm_read" ON public.license_lifecycle_matters
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'license_management', 'view')
  OR EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = license_id AND l.holder_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.tg_llm_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_llm_touch ON public.license_lifecycle_matters;
CREATE TRIGGER trg_llm_touch BEFORE UPDATE ON public.license_lifecycle_matters
FOR EACH ROW EXECUTE FUNCTION public.tg_llm_touch();

-- ---------------------------------------------------------------------
-- Server-owned policy resolution
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_lifecycle_policy(_sector uuid, _sub uuid, _cat uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; d jsonb; best jsonb; r jsonb; sc int; bestsc int := -1;
BEGIN
  SELECT value INTO v FROM public.site_settings WHERE key = 'license_expiry';
  d := COALESCE(v->'default', v, '{}'::jsonb);
  IF jsonb_typeof(d) <> 'object' THEN d := '{}'::jsonb; END IF;
  best := d;
  IF jsonb_typeof(v->'rules') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(v->'rules') LOOP
      IF (r->>'sector_id' IS NULL OR r->>'sector_id' = _sector::text)
         AND (r->>'sub_sector_id' IS NULL OR r->>'sub_sector_id' = _sub::text)
         AND (r->>'category_id' IS NULL OR r->>'category_id' = _cat::text) THEN
        sc := (CASE WHEN r->>'category_id' IS NOT NULL THEN 4 ELSE 0 END)
            + (CASE WHEN r->>'sub_sector_id' IS NOT NULL THEN 2 ELSE 0 END)
            + (CASE WHEN r->>'sector_id' IS NOT NULL THEN 1 ELSE 0 END);
        IF sc > bestsc THEN bestsc := sc; best := d || r; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object(
    'cycle_type', COALESCE(best->>'cycle_type','annual'),
    'period_days', COALESCE(NULLIF(best->>'period_days','')::int, 365),
    'grace_period_days', COALESCE(NULLIF(best->>'grace_period_days','')::int, 30),
    'renewal_window_days', COALESCE(NULLIF(best->>'renewal_window_days','')::int, 90),
    'reminder_days', COALESCE(best->'reminder_days', '[10,5,1]'::jsonb)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.license_lifecycle_policy(uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Licence case read model
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_case(_license_id uuid, _audience text DEFAULT 'internal')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l record; ent record; pol jsonb;
  v_internal boolean;
  v_open_conditions int; v_overdue_conditions int;
  v_matter record; v_renewal record;
  v_days numeric; v_sla_state text; v_stage text; v_waiting text;
  v_priority text; v_priority_reason text;
  v_blockers jsonb := '[]'::jsonb; v_next jsonb;
  v_last timestamptz;
BEGIN
  v_internal := public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'license_management','view');

  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE = '22023'; END IF;

  IF NOT v_internal AND l.holder_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ent FROM public.licensees WHERE license_id = l.id LIMIT 1;
  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);

  SELECT count(*) FILTER (WHERE status IN ('open','in_progress')),
         count(*) FILTER (WHERE status IN ('open','in_progress') AND due_date < current_date)
    INTO v_open_conditions, v_overdue_conditions
    FROM public.license_conditions WHERE license_id = l.id;

  SELECT * INTO v_matter FROM public.license_lifecycle_matters
   WHERE license_id = l.id AND status = 'open'
   ORDER BY CASE matter_kind WHEN 'revocation' THEN 1 WHEN 'suspension' THEN 2 WHEN 'renewal' THEN 3 ELSE 4 END, opened_at
   LIMIT 1;

  SELECT * INTO v_renewal FROM public.license_renewals
   WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn')
   ORDER BY created_at DESC LIMIT 1;

  v_days := CASE WHEN l.valid_until IS NULL THEN NULL
                 ELSE EXTRACT(EPOCH FROM (l.valid_until - now())) / 86400 END;

  v_sla_state := CASE
    WHEN l.status IN ('revoked','surrendered') THEN 'closed'
    WHEN v_days IS NULL THEN 'on_track'
    WHEN v_days < 0 THEN 'breached'
    WHEN v_days <= COALESCE((pol->>'renewal_window_days')::int, 90) THEN 'due_soon'
    ELSE 'on_track' END;

  v_stage := CASE
    WHEN l.status = 'revoked' THEN 'REVOKED'
    WHEN l.status = 'surrendered' THEN 'SURRENDERED'
    WHEN l.status = 'expired' THEN 'EXPIRY_REVIEW'
    WHEN l.status = 'suspended' THEN 'SUSPENDED'
    WHEN v_matter.matter_kind = 'revocation' THEN 'REVOCATION_REVIEW'
    WHEN v_matter.matter_kind = 'suspension' THEN 'SUSPENSION_REVIEW'
    WHEN v_matter.matter_kind = 'surrender' THEN 'SURRENDER_REVIEW'
    WHEN v_matter.matter_kind = 'variation' THEN 'VARIATION'
    WHEN v_renewal.id IS NOT NULL THEN 'RENEWAL'
    WHEN v_sla_state = 'breached' THEN 'EXPIRY_REVIEW'
    WHEN v_sla_state = 'due_soon' THEN 'RENEWAL_DUE'
    WHEN v_open_conditions > 0 THEN 'ACTIVE_WITH_CONDITIONS'
    WHEN l.status = 'active' THEN 'ACTIVE'
    ELSE upper(COALESCE(l.status,'UNKNOWN')) END;

  v_waiting := COALESCE(
    CASE WHEN v_renewal.status = 'information_requested' THEN 'entity' END,
    v_matter.waiting_on,
    CASE WHEN v_open_conditions > 0 THEN 'entity' ELSE 'regulator' END);

  IF l.status IN ('revoked','surrendered') THEN
    v_priority := 'low'; v_priority_reason := 'Licence closed';
  ELSIF l.status = 'suspended' OR v_matter.matter_kind IN ('revocation','suspension') THEN
    v_priority := 'critical'; v_priority_reason := 'Adverse lifecycle action in progress';
  ELSIF v_sla_state = 'breached' OR v_overdue_conditions > 0 THEN
    v_priority := 'high'; v_priority_reason := CASE WHEN v_sla_state = 'breached' THEN 'Licence past expiry' ELSE 'Overdue licence conditions' END;
  ELSIF v_sla_state = 'due_soon' THEN
    v_priority := 'medium'; v_priority_reason := 'Renewal window open';
  ELSE
    v_priority := 'low'; v_priority_reason := 'No open lifecycle matter';
  END IF;

  IF v_overdue_conditions > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('key','overdue_conditions','label', v_overdue_conditions || ' overdue condition(s)','href','/licenses/' || l.id || '?tab=conditions');
  END IF;
  IF v_sla_state = 'breached' AND l.status = 'active' THEN
    v_blockers := v_blockers || jsonb_build_object('key','past_expiry','label','Licence term has elapsed','href','/licenses/' || l.id || '?tab=renewal');
  END IF;

  v_next := CASE
    WHEN l.status IN ('revoked','surrendered') THEN NULL
    WHEN v_renewal.id IS NOT NULL AND v_renewal.status = 'information_requested'
      THEN jsonb_build_object('key','AWAIT_RENEWAL_INFORMATION','label','Awaiting renewal information','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.view')
    WHEN v_renewal.id IS NOT NULL
      THEN jsonb_build_object('key','APPROVE_RENEWAL','label','Decide renewal','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.approve')
    WHEN v_matter.matter_kind = 'suspension'
      THEN jsonb_build_object('key','SUSPEND','label','Conclude suspension review','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN v_matter.matter_kind = 'revocation'
      THEN jsonb_build_object('key','REVOKE','label','Conclude revocation review','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN v_matter.matter_kind = 'surrender'
      THEN jsonb_build_object('key','ACCEPT_SURRENDER','label','Decide surrender','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN l.status = 'suspended'
      THEN jsonb_build_object('key','REINSTATE','label','Consider reinstatement','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN v_sla_state = 'breached' AND l.status = 'active'
      THEN jsonb_build_object('key','MARK_EXPIRED','label','Complete expiry review','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.manage_license_actions')
    WHEN v_sla_state = 'due_soon'
      THEN jsonb_build_object('key','START_RENEWAL','label','Start renewal','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.workflow_action')
    WHEN v_overdue_conditions > 0
      THEN jsonb_build_object('key','REVIEW_CONDITIONS','label','Review overdue conditions','href','/licenses/' || l.id || '?tab=conditions','permission','license_management.manage_conditions')
    ELSE NULL END;

  SELECT max(created_at) INTO v_last FROM public.license_actions WHERE license_id = l.id;

  RETURN jsonb_build_object(
    'header', jsonb_build_object(
      'license_id', l.id,
      'reference', l.license_number,
      'subject', COALESCE(ent.name, l.license_type),
      'entity_id', ent.id,
      'case_type', l.license_type,
      'stage', v_stage,
      'status', l.status,
      'owner_id', ent.regulator_officer_id,
      'team', NULL,
      'priority', v_priority,
      'priority_reason', v_priority_reason,
      'sla_due_at', l.valid_until,
      'sla_state', v_sla_state,
      'waiting_on', v_waiting,
      'blockers', v_blockers,
      'next_action', v_next,
      'last_activity_at', COALESCE(v_last, l.updated_at, l.created_at),
      'issued_at', l.issued_at,
      'valid_from', l.valid_from,
      'valid_until', l.valid_until,
      'application_id', l.application_id,
      'sector_id', l.sector_id,
      'sub_sector_id', l.sub_sector_id,
      'category_id', l.category_id
    ),
    'policy', pol,
    'counts', jsonb_build_object('open_conditions', v_open_conditions, 'overdue_conditions', v_overdue_conditions),
    'open_matter', CASE WHEN v_matter.id IS NULL THEN NULL ELSE to_jsonb(v_matter) END,
    'matters', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.opened_at DESC) FROM public.license_lifecycle_matters m WHERE m.license_id = l.id), '[]'::jsonb),
    'renewals', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM public.license_renewals r WHERE r.license_id = l.id), '[]'::jsonb),
    'conditions', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.due_date NULLS LAST) FROM public.license_conditions c WHERE c.license_id = l.id), '[]'::jsonb),
    'history', CASE WHEN v_internal THEN COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.license_actions a WHERE a.license_id = l.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'appeals', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ap.id,'reference',ap.appeal_reference,'status',ap.status,'filed_at',ap.filed_at,'decision',ap.decision) ORDER BY ap.filed_at DESC) FROM public.license_appeals ap WHERE ap.license_id = l.id), '[]'::jsonb),
    'enforcement', CASE WHEN ent.id IS NULL THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'case_number',e.case_number,'status',e.status,'stage',e.stage,'source_kind',e.source_kind) ORDER BY e.created_at DESC) FROM public.enforcement_actions e WHERE e.entity_id = ent.id), '[]'::jsonb) END,
    'audience', CASE WHEN v_internal THEN 'internal' ELSE 'external' END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.license_case(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Licence register (server paged)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_register_page(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sla_state text DEFAULT NULL,
  _page int DEFAULT 0,
  _page_size int DEFAULT 25,
  _sort_by text DEFAULT 'valid_until',
  _sort_dir text DEFAULT 'asc'
)
RETURNS TABLE (
  license_id uuid, license_number text, entity_id uuid, entity_name text,
  license_type text, status text, issued_at timestamptz, valid_from timestamptz,
  valid_until timestamptz, sla_state text, days_to_expiry numeric,
  open_conditions int, overdue_conditions int, open_matter_kind text,
  next_action text, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_internal boolean; v_off int;
BEGIN
  v_internal := public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'license_management','view');
  _page_size := LEAST(GREATEST(COALESCE(_page_size,25),1),200);
  v_off := GREATEST(COALESCE(_page,0),0) * _page_size;

  RETURN QUERY
  WITH base AS (
    SELECT l.*, le.id AS ent_id, le.name AS ent_name,
      CASE WHEN l.valid_until IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (l.valid_until - now()))/86400 END AS d2e,
      COALESCE((public.license_lifecycle_policy(l.sector_id,l.sub_sector_id,l.category_id)->>'renewal_window_days')::int, 90) AS win
    FROM public.licenses l
    LEFT JOIN public.licensees le ON le.license_id = l.id
    WHERE (v_internal OR l.holder_id = auth.uid())
      AND (_status IS NULL OR l.status = _status)
      AND (_sector_id IS NULL OR l.sector_id = _sector_id)
      AND (_search IS NULL OR _search = '' OR l.license_number ILIKE '%'||_search||'%' OR COALESCE(le.name,'') ILIKE '%'||_search||'%' OR COALESCE(l.license_type,'') ILIKE '%'||_search||'%')
  ), scored AS (
    SELECT b.*,
      CASE WHEN b.status IN ('revoked','surrendered') THEN 'closed'
           WHEN b.d2e IS NULL THEN 'on_track'
           WHEN b.d2e < 0 THEN 'breached'
           WHEN b.d2e <= b.win THEN 'due_soon'
           ELSE 'on_track' END AS sla,
      (SELECT count(*)::int FROM public.license_conditions c WHERE c.license_id = b.id AND c.status IN ('open','in_progress')) AS oc,
      (SELECT count(*)::int FROM public.license_conditions c WHERE c.license_id = b.id AND c.status IN ('open','in_progress') AND c.due_date < current_date) AS ovc,
      (SELECT m.matter_kind FROM public.license_lifecycle_matters m WHERE m.license_id = b.id AND m.status = 'open' ORDER BY m.opened_at LIMIT 1) AS mk
    FROM base b
  ), filtered AS (
    SELECT * FROM scored WHERE (_sla_state IS NULL OR sla = _sla_state)
  )
  SELECT f.id, f.license_number, f.ent_id, COALESCE(f.ent_name, f.license_type),
         f.license_type, f.status, f.issued_at, f.valid_from, f.valid_until,
         f.sla, f.d2e, f.oc, f.ovc, f.mk,
         CASE
           WHEN f.status IN ('revoked','surrendered') THEN NULL
           WHEN f.mk IS NOT NULL THEN 'Progress ' || replace(f.mk,'_',' ')
           WHEN f.sla = 'breached' THEN 'Complete expiry review'
           WHEN f.sla = 'due_soon' THEN 'Start renewal'
           WHEN f.ovc > 0 THEN 'Review overdue conditions'
           ELSE NULL END,
         count(*) OVER ()
  FROM filtered f
  ORDER BY
    CASE WHEN _sort_dir = 'desc' THEN NULL ELSE
      CASE _sort_by WHEN 'license_number' THEN f.license_number WHEN 'status' THEN f.status ELSE NULL END END ASC,
    CASE WHEN _sort_dir = 'desc' THEN
      CASE _sort_by WHEN 'license_number' THEN f.license_number WHEN 'status' THEN f.status ELSE NULL END END DESC,
    CASE WHEN _sort_by = 'valid_until' AND _sort_dir <> 'desc' THEN f.valid_until END ASC NULLS LAST,
    CASE WHEN _sort_by = 'valid_until' AND _sort_dir = 'desc' THEN f.valid_until END DESC NULLS LAST,
    f.issued_at DESC
  LIMIT _page_size OFFSET v_off;
END $$;

GRANT EXECUTE ON FUNCTION public.license_register_page(text, text, uuid, text, int, int, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Licence lifecycle work queue (actionable aggregation)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_lifecycle_work_queue(
  _kinds text[] DEFAULT NULL,
  _search text DEFAULT NULL,
  _page int DEFAULT 0,
  _page_size int DEFAULT 25
)
RETURNS TABLE (
  work_kind text, object_type text, object_id uuid, license_id uuid,
  reference text, entity_id uuid, entity_name text, stage text, status text,
  priority text, sla_due_at timestamptz, sla_state text, waiting_on text,
  next_action text, canonical_href text, last_activity_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_internal boolean; v_off int;
BEGIN
  v_internal := public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'license_management','view');
  _page_size := LEAST(GREATEST(COALESCE(_page_size,25),1),200);
  v_off := GREATEST(COALESCE(_page,0),0) * _page_size;

  RETURN QUERY
  WITH lic AS (
    SELECT l.*, le.id AS ent_id, COALESCE(le.name, l.license_type) AS ent_name,
      CASE WHEN l.valid_until IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (l.valid_until - now()))/86400 END AS d2e,
      COALESCE((public.license_lifecycle_policy(l.sector_id,l.sub_sector_id,l.category_id)->>'renewal_window_days')::int, 90) AS win
    FROM public.licenses l
    LEFT JOIN public.licensees le ON le.license_id = l.id
    WHERE (v_internal OR l.holder_id = auth.uid())
  ),
  rows_all AS (
    -- open lifecycle matters
    SELECT m.matter_kind AS work_kind, 'license_matter'::text AS object_type, m.id AS object_id, l.id AS license_id,
           l.license_number AS reference, l.ent_id AS entity_id, l.ent_name AS entity_name,
           upper(m.matter_kind) AS stage, m.status AS status,
           CASE WHEN m.matter_kind IN ('revocation','suspension') THEN 'critical' ELSE 'medium' END AS priority,
           COALESCE(m.due_at, l.valid_until) AS sla_due_at,
           CASE WHEN COALESCE(m.due_at, l.valid_until) IS NULL THEN 'on_track'
                WHEN COALESCE(m.due_at, l.valid_until) < now() THEN 'breached' ELSE 'on_track' END AS sla_state,
           m.waiting_on AS waiting_on,
           ('Progress ' || replace(m.matter_kind,'_',' '))::text AS next_action,
           ('/licenses/' || l.id)::text AS canonical_href,
           m.updated_at AS last_activity_at
    FROM public.license_lifecycle_matters m JOIN lic l ON l.id = m.license_id
    WHERE m.status = 'open'
    UNION ALL
    -- renewal due / overdue without an open matter
    SELECT CASE WHEN l.d2e < 0 THEN 'expiry_review' ELSE 'renewal_due' END, 'license', l.id, l.id,
           l.license_number, l.ent_id, l.ent_name,
           CASE WHEN l.d2e < 0 THEN 'EXPIRY_REVIEW' ELSE 'RENEWAL_DUE' END, l.status,
           CASE WHEN l.d2e < 0 THEN 'high' ELSE 'medium' END,
           l.valid_until,
           CASE WHEN l.d2e < 0 THEN 'breached' ELSE 'due_soon' END,
           'regulator',
           CASE WHEN l.d2e < 0 THEN 'Complete expiry review' ELSE 'Start renewal' END,
           ('/licenses/' || l.id)::text, l.updated_at
    FROM lic l
    WHERE l.status IN ('active','restricted') AND l.valid_until IS NOT NULL AND l.d2e <= l.win
      AND NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters m WHERE m.license_id = l.id AND m.status = 'open')
    UNION ALL
    -- overdue condition evidence
    SELECT 'condition_evidence', 'license_condition', c.id, l.id,
           l.license_number, l.ent_id, l.ent_name, 'CONDITION_EVIDENCE', c.status,
           CASE WHEN c.due_date < current_date THEN 'high' ELSE 'low' END,
           (c.due_date::timestamptz),
           CASE WHEN c.due_date IS NULL THEN 'on_track' WHEN c.due_date < current_date THEN 'breached' ELSE 'due_soon' END,
           'entity', 'Review condition evidence', ('/licenses/' || l.id || '?tab=conditions')::text, c.updated_at
    FROM public.license_conditions c JOIN lic l ON l.id = c.license_id
    WHERE c.status IN ('open','in_progress')
      AND c.due_date IS NOT NULL AND c.due_date <= (current_date + 30)
    UNION ALL
    -- suspended licences awaiting reinstatement decision
    SELECT 'suspension_review', 'license', l.id, l.id, l.license_number, l.ent_id, l.ent_name,
           'SUSPENDED', l.status, 'critical', l.valid_until, 'breached', 'regulator',
           'Review suspension', ('/licenses/' || l.id)::text, l.updated_at
    FROM lic l WHERE l.status = 'suspended'
    UNION ALL
    -- open appeals
    SELECT 'appeal', 'license_appeal', a.id, l.id, COALESCE(a.appeal_reference, l.license_number), l.ent_id, l.ent_name,
           'APPEAL', a.status, 'high', a.appeal_deadline,
           CASE WHEN a.appeal_deadline IS NOT NULL AND a.appeal_deadline < now() THEN 'breached' ELSE 'on_track' END,
           'regulator', 'Progress appeal', ('/licensing/appeals/' || a.id)::text, a.updated_at
    FROM public.license_appeals a JOIN lic l ON l.id = a.license_id
    WHERE a.status NOT IN ('decided','withdrawn','closed')
  ),
  filtered AS (
    SELECT * FROM rows_all r
    WHERE (_kinds IS NULL OR array_length(_kinds,1) IS NULL OR r.work_kind = ANY(_kinds))
      AND (_search IS NULL OR _search = '' OR r.reference ILIKE '%'||_search||'%' OR COALESCE(r.entity_name,'') ILIKE '%'||_search||'%')
  )
  SELECT f.work_kind, f.object_type, f.object_id, f.license_id, f.reference, f.entity_id, f.entity_name,
         f.stage, f.status, f.priority, f.sla_due_at, f.sla_state, f.waiting_on, f.next_action,
         f.canonical_href, f.last_activity_at, count(*) OVER ()
  FROM filtered f
  ORDER BY CASE f.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           f.sla_due_at ASC NULLS LAST
  LIMIT _page_size OFFSET v_off;
END $$;

GRANT EXECUTE ON FUNCTION public.license_lifecycle_work_queue(text[], text, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.license_lifecycle_work_queue_counts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(k, c), '{}'::jsonb) INTO r
  FROM (
    SELECT q.work_kind AS k, count(*) AS c
    FROM public.license_lifecycle_work_queue(NULL, NULL, 0, 200) q
    GROUP BY q.work_kind
  ) s;
  RETURN r;
END $$;

GRANT EXECUTE ON FUNCTION public.license_lifecycle_work_queue_counts() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Governed lifecycle operation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_lifecycle_action(
  _license_id uuid,
  _action_key text,
  _payload jsonb DEFAULT '{}'::jsonb,
  _reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  l record; pol jsonb; m record; r record;
  new_status text; old_status text;
  adverse boolean;
  v_matter_id uuid; v_renewal_id uuid;
  v_new_until timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO l FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  old_status := l.status;
  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);

  adverse := _action_key IN ('REFUSE_RENEWAL','BEGIN_SUSPENSION','SUSPEND','BEGIN_REVOCATION','REVOKE','ACCEPT_SURRENDER','MARK_EXPIRED');

  -- permission
  IF _action_key IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    PERFORM public.enforce_permission('license_management','manage_conditions');
  ELSIF _action_key IN ('APPROVE_RENEWAL','REFUSE_RENEWAL') THEN
    PERFORM public.enforce_permission('license_management','approve');
  ELSIF adverse THEN
    PERFORM public.enforce_permission('license_management','manage_license_actions');
  ELSE
    PERFORM public.enforce_permission('license_management','workflow_action');
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
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, renewal_id, opened_by, due_at, waiting_on)
    VALUES (l.id, 'renewal', 'Licence renewal', _reason, v_renewal_id, uid, l.valid_until, 'regulator') RETURNING id INTO v_matter_id;

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
    IF _action_key = 'APPROVE_RENEWAL' THEN
      v_new_until := COALESCE((_payload->>'new_valid_until')::timestamptz,
                              GREATEST(COALESCE(l.valid_until, now()), now()) + make_interval(days => COALESCE((pol->>'period_days')::int, 365)));
      UPDATE public.license_renewals SET status='approved', reviewed_by=uid, reviewed_at=now(),
             new_valid_until=v_new_until, decision_reason=_reason, updated_at=now() WHERE id=r.id;
      UPDATE public.licenses SET valid_until=v_new_until,
             status = CASE WHEN status='expired' THEN 'active' ELSE status END, updated_at=now() WHERE id=l.id;
      new_status := (SELECT status FROM public.licenses WHERE id=l.id);
    ELSE
      UPDATE public.license_renewals SET status='refused', reviewed_by=uid, reviewed_at=now(), decision_reason=_reason, updated_at=now() WHERE id=r.id;
    END IF;
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid,
           decision = _action_key WHERE license_id=l.id AND status='open' AND matter_kind='renewal';

  ELSIF _action_key IN ('BEGIN_SUSPENSION','BEGIN_REVOCATION','BEGIN_SURRENDER','APPLY_VARIATION') THEN
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, opened_by, due_at, waiting_on)
    VALUES (l.id,
            CASE _action_key WHEN 'BEGIN_SUSPENSION' THEN 'suspension'
                             WHEN 'BEGIN_REVOCATION' THEN 'revocation'
                             WHEN 'BEGIN_SURRENDER' THEN 'surrender'
                             ELSE 'variation' END,
            initcap(replace(lower(_action_key),'_',' ')), _reason, uid,
            (_payload->>'due_at')::timestamptz,
            CASE WHEN _action_key = 'APPLY_VARIATION' THEN 'entity' ELSE 'regulator' END)
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
          jsonb_build_object('payload', COALESCE(_payload,'{}'::jsonb), 'matter_id', v_matter_id, 'renewal_id', v_renewal_id));

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (uid, 'license.lifecycle.' || lower(_action_key), 'license', l.id,
          jsonb_build_object('from', old_status, 'to', COALESCE(new_status, old_status), 'reason', _reason, 'payload', COALESCE(_payload,'{}'::jsonb)));

  RETURN public.license_case(l.id, 'internal');
END $$;

GRANT EXECUTE ON FUNCTION public.license_lifecycle_action(uuid, text, jsonb, text) TO authenticated, service_role;
