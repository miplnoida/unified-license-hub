-- =====================================================================
-- MCS-ANA-003: Conduct Intelligence — Published Reports
-- =====================================================================

-- 1. Templates ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_intelligence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_period_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_intelligence_templates TO authenticated;
GRANT ALL ON public.conduct_intelligence_templates TO service_role;
ALTER TABLE public.conduct_intelligence_templates ENABLE ROW LEVEL SECURITY;

-- 2. Reports -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.conduct_intelligence_templates(id) ON DELETE SET NULL,
  template_code text NOT NULL DEFAULT 'custom',
  title text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  regulator_id uuid,
  sector_id uuid,
  status text NOT NULL DEFAULT 'draft',
  current_version integer NOT NULL DEFAULT 0,
  publish_to_sector boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  submitted_by uuid,
  approver_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  published_at timestamptz,
  published_by uuid,
  supersedes_report_id uuid REFERENCES public.conduct_intelligence_reports(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cir_status_chk CHECK (status IN ('draft','pending_approval','approved','rejected','published','superseded')),
  CONSTRAINT cir_period_chk CHECK (period_end >= period_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_intelligence_reports TO authenticated;
GRANT ALL ON public.conduct_intelligence_reports TO service_role;
ALTER TABLE public.conduct_intelligence_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cir_status ON public.conduct_intelligence_reports(status);
CREATE INDEX IF NOT EXISTS idx_cir_period ON public.conduct_intelligence_reports(period_start, period_end);

-- 3. Versions ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_intelligence_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.conduct_intelligence_reports(id) ON DELETE CASCADE,
  version integer NOT NULL,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_note text,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cirv_version_uq UNIQUE (report_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_intelligence_report_versions TO authenticated;
GRANT ALL ON public.conduct_intelligence_report_versions TO service_role;
ALTER TABLE public.conduct_intelligence_report_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cirv_report ON public.conduct_intelligence_report_versions(report_id);

-- 4. Recipients --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_intelligence_report_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.conduct_intelligence_reports(id) ON DELETE CASCADE,
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cirr_uq UNIQUE (report_id, licensee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_intelligence_report_recipients TO authenticated;
GRANT ALL ON public.conduct_intelligence_report_recipients TO service_role;
ALTER TABLE public.conduct_intelligence_report_recipients ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cirr_licensee ON public.conduct_intelligence_report_recipients(licensee_id);

-- 5. Authorisation helpers --------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_conduct_intelligence()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
      OR has_role(auth.uid(),'super_admin'::app_role)
      OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'supervisor'::app_role)
      OR has_role(auth.uid(),'analyst'::app_role)
      OR has_role(auth.uid(),'legal_compliance'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_conduct_intelligence()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
      OR has_role(auth.uid(),'super_admin'::app_role)
      OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'supervisor'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_approve_conduct_intelligence()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
      OR has_role(auth.uid(),'super_admin'::app_role)
      OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'supervisor'::app_role)
$$;

REVOKE ALL ON FUNCTION public.can_view_conduct_intelligence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_conduct_intelligence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_approve_conduct_intelligence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_conduct_intelligence() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_conduct_intelligence() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_approve_conduct_intelligence() TO authenticated, service_role;

-- 6. Policies ----------------------------------------------------------
DROP POLICY IF EXISTS "cit read" ON public.conduct_intelligence_templates;
CREATE POLICY "cit read" ON public.conduct_intelligence_templates
  FOR SELECT TO authenticated USING (public.can_view_conduct_intelligence() OR is_active);
DROP POLICY IF EXISTS "cit write" ON public.conduct_intelligence_templates;
CREATE POLICY "cit write" ON public.conduct_intelligence_templates
  FOR ALL TO authenticated USING (public.can_manage_conduct_intelligence())
  WITH CHECK (public.can_manage_conduct_intelligence());

DROP POLICY IF EXISTS "cir internal read" ON public.conduct_intelligence_reports;
CREATE POLICY "cir internal read" ON public.conduct_intelligence_reports
  FOR SELECT TO authenticated USING (public.can_view_conduct_intelligence());
DROP POLICY IF EXISTS "cir entity read published" ON public.conduct_intelligence_reports;
CREATE POLICY "cir entity read published" ON public.conduct_intelligence_reports
  FOR SELECT TO authenticated USING (
    status = 'published' AND EXISTS (
      SELECT 1 FROM public.conduct_intelligence_report_recipients r
      WHERE r.report_id = conduct_intelligence_reports.id
        AND public.can_current_user_access_licensee(r.licensee_id)
    ));
DROP POLICY IF EXISTS "cir write" ON public.conduct_intelligence_reports;
CREATE POLICY "cir write" ON public.conduct_intelligence_reports
  FOR ALL TO authenticated USING (public.can_manage_conduct_intelligence())
  WITH CHECK (public.can_manage_conduct_intelligence());

DROP POLICY IF EXISTS "cirv internal read" ON public.conduct_intelligence_report_versions;
CREATE POLICY "cirv internal read" ON public.conduct_intelligence_report_versions
  FOR SELECT TO authenticated USING (public.can_view_conduct_intelligence());
DROP POLICY IF EXISTS "cirv entity read published" ON public.conduct_intelligence_report_versions;
CREATE POLICY "cirv entity read published" ON public.conduct_intelligence_report_versions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conduct_intelligence_reports rep
      JOIN public.conduct_intelligence_report_recipients r ON r.report_id = rep.id
      WHERE rep.id = conduct_intelligence_report_versions.report_id
        AND rep.status = 'published'
        AND rep.current_version = conduct_intelligence_report_versions.version
        AND public.can_current_user_access_licensee(r.licensee_id)
    ));
DROP POLICY IF EXISTS "cirv write" ON public.conduct_intelligence_report_versions;
CREATE POLICY "cirv write" ON public.conduct_intelligence_report_versions
  FOR ALL TO authenticated USING (public.can_manage_conduct_intelligence())
  WITH CHECK (public.can_manage_conduct_intelligence());

DROP POLICY IF EXISTS "cirr internal read" ON public.conduct_intelligence_report_recipients;
CREATE POLICY "cirr internal read" ON public.conduct_intelligence_report_recipients
  FOR SELECT TO authenticated USING (public.can_view_conduct_intelligence());
DROP POLICY IF EXISTS "cirr entity read" ON public.conduct_intelligence_report_recipients;
CREATE POLICY "cirr entity read" ON public.conduct_intelligence_report_recipients
  FOR SELECT TO authenticated USING (public.can_current_user_access_licensee(licensee_id));
DROP POLICY IF EXISTS "cirr write" ON public.conduct_intelligence_report_recipients;
CREATE POLICY "cirr write" ON public.conduct_intelligence_report_recipients
  FOR ALL TO authenticated USING (public.can_manage_conduct_intelligence())
  WITH CHECK (public.can_manage_conduct_intelligence());

-- 7. Triggers ----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_cit_updated_at ON public.conduct_intelligence_templates;
CREATE TRIGGER trg_cit_updated_at BEFORE UPDATE ON public.conduct_intelligence_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_cir_updated_at ON public.conduct_intelligence_reports;
CREATE TRIGGER trg_cir_updated_at BEFORE UPDATE ON public.conduct_intelligence_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._guard_conduct_intel_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('published','superseded') THEN
    RAISE EXCEPTION 'A published intelligence report cannot be deleted — publish a superseding version instead'
      USING ERRCODE='22023';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_cir_no_delete_published ON public.conduct_intelligence_reports;
CREATE TRIGGER trg_cir_no_delete_published BEFORE DELETE ON public.conduct_intelligence_reports
  FOR EACH ROW EXECUTE FUNCTION public._guard_conduct_intel_delete();

-- 8. Aggregation -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_intel_aggregate(
  _period_start date, _period_end date, _regulator_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from timestamptz := _period_start::timestamptz;
  v_to   timestamptz := (_period_end + 1)::timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501';
  END IF;

  WITH cmp AS (
    SELECT * FROM public.complaints
    WHERE created_at >= v_from AND created_at < v_to
      AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  ), alerts AS (
    SELECT * FROM public.conduct_alerts
    WHERE created_at >= v_from AND created_at < v_to
      AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  ), thm AS (
    SELECT * FROM public.thematic_reviews
    WHERE (closed_at >= v_from AND closed_at < v_to)
      AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  ), enf AS (
    SELECT * FROM public.enforcement_actions
    WHERE date_opened >= _period_start AND date_opened <= _period_end
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', _period_start, 'end', _period_end),
    'generated_at', now(),
    'complaint_volume', jsonb_build_object(
      'total', (SELECT count(*) FROM cmp),
      'resolved', (SELECT count(*) FROM cmp WHERE resolved_at IS NOT NULL),
      'open', (SELECT count(*) FROM cmp WHERE resolved_at IS NULL),
      'sla_breached', (SELECT count(*) FROM cmp WHERE sla_due_at IS NOT NULL
                        AND COALESCE(resolved_at, now()) > sla_due_at),
      'vulnerable', (SELECT count(*) FROM cmp WHERE vulnerability_indicator),
      'repeat', (SELECT count(*) FROM cmp WHERE COALESCE(repeat_complaint_count,0) > 0),
      'by_severity', COALESCE((SELECT jsonb_object_agg(k, n) FROM (
          SELECT COALESCE(severity,'unspecified') AS k, count(*) AS n FROM cmp GROUP BY 1) s), '{}'::jsonb),
      'by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('bucket', b, 'count', n) ORDER BY b) FROM (
          SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS b, count(*) AS n
          FROM cmp GROUP BY 1) m), '[]'::jsonb)
    ),
    'top_issues', jsonb_build_object(
      'by_category', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC) FROM (
          SELECT jsonb_build_object('label', COALESCE(rc.name,'Uncategorised'), 'count', count(*)) AS x
          FROM cmp LEFT JOIN public.conduct_risk_categories rc ON rc.id = cmp.conduct_risk_category_id
          GROUP BY rc.name ORDER BY count(*) DESC LIMIT 10) a), '[]'::jsonb),
      'by_product', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC) FROM (
          SELECT jsonb_build_object('label', COALESCE(p.name,'Unspecified'), 'count', count(*)) AS x
          FROM cmp LEFT JOIN public.conduct_products p ON p.id = cmp.product_id
          GROUP BY p.name ORDER BY count(*) DESC LIMIT 10) a), '[]'::jsonb),
      'by_channel', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC) FROM (
          SELECT jsonb_build_object('label', COALESCE(ch.name,'Unspecified'), 'count', count(*)) AS x
          FROM cmp LEFT JOIN public.conduct_channels ch ON ch.id = cmp.channel_id
          GROUP BY ch.name ORDER BY count(*) DESC LIMIT 10) a), '[]'::jsonb),
      'by_entity', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC) FROM (
          SELECT jsonb_build_object('label', COALESCE(l.name,'Unattributed'), 'count', count(*)) AS x
          FROM cmp LEFT JOIN public.licensees l ON l.id = cmp.licensee_id
          GROUP BY l.name ORDER BY count(*) DESC LIMIT 10) a), '[]'::jsonb)
    ),
    'pattern_alerts', jsonb_build_object(
      'total', (SELECT count(*) FROM alerts),
      'open', (SELECT count(*) FROM alerts WHERE status NOT IN ('closed','dismissed')),
      'closed', (SELECT count(*) FROM alerts WHERE status IN ('closed','dismissed')),
      'by_severity', COALESCE((SELECT jsonb_object_agg(k, n) FROM (
          SELECT COALESCE(severity,'unspecified') AS k, count(*) AS n FROM alerts GROUP BY 1) s), '{}'::jsonb),
      'by_kind', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC) FROM (
          SELECT jsonb_build_object('label', COALESCE(kind,'unspecified'), 'count', count(*)) AS x
          FROM alerts GROUP BY kind ORDER BY count(*) DESC LIMIT 10) a), '[]'::jsonb)
    ),
    'thematic_reviews', jsonb_build_object(
      'closed', (SELECT count(*) FROM thm),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'code', t.code, 'title', t.title, 'closed_at', t.closed_at,
            'findings', (SELECT count(*) FROM public.thematic_review_findings f WHERE f.review_id = t.id),
            'summary', left(COALESCE(t.closure_summary,''), 500))
          ORDER BY t.closed_at DESC) FROM thm t), '[]'::jsonb)
    ),
    'enforcement', jsonb_build_object(
      'total', (SELECT count(*) FROM enf),
      'penalty_total', COALESCE((SELECT sum(COALESCE(penalty_amount,0)) FROM enf), 0),
      'by_type', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC) FROM (
          SELECT jsonb_build_object('label', COALESCE(enforcement_type,'unspecified'), 'count', count(*)) AS x
          FROM enf GROUP BY enforcement_type ORDER BY count(*) DESC LIMIT 10) a), '[]'::jsonb),
      'by_status', COALESCE((SELECT jsonb_object_agg(k, n) FROM (
          SELECT COALESCE(status,'unspecified') AS k, count(*) AS n FROM enf GROUP BY 1) s), '{}'::jsonb)
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.conduct_intel_aggregate(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_intel_aggregate(date, date, uuid) TO authenticated, service_role;

-- 9. Lifecycle RPCs ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_intel_create_report(
  _template_code text, _title text, _period_start date, _period_end date,
  _regulator_id uuid DEFAULT NULL, _sector_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_tpl record; v_metrics jsonb; v_sections jsonb := '{}'::jsonb; s jsonb;
BEGIN
  IF NOT public.can_manage_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to create intelligence reports' USING ERRCODE='42501'; END IF;
  IF _period_start IS NULL OR _period_end IS NULL OR _period_end < _period_start THEN
    RAISE EXCEPTION 'A valid reporting period is required' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_tpl FROM public.conduct_intelligence_templates WHERE code = _template_code;

  INSERT INTO public.conduct_intelligence_reports(
    template_id, template_code, title, period_start, period_end,
    regulator_id, sector_id, status, created_by)
  VALUES (v_tpl.id, COALESCE(_template_code,'custom'),
    COALESCE(NULLIF(btrim(_title),''), COALESCE(v_tpl.name,'Conduct Intelligence Report')),
    _period_start, _period_end, _regulator_id, _sector_id, 'draft', auth.uid())
  RETURNING id INTO v_id;

  v_metrics := public.conduct_intel_aggregate(_period_start, _period_end, _regulator_id);

  FOR s IN SELECT jsonb_array_elements(COALESCE(v_tpl.sections, '[]'::jsonb))
  LOOP
    v_sections := v_sections || jsonb_build_object(s->>'key', jsonb_build_object('narrative',''));
  END LOOP;

  INSERT INTO public.conduct_intelligence_report_versions(report_id, version, sections, metrics, generated_by, change_note)
  VALUES (v_id, 1, v_sections, v_metrics, auth.uid(), 'Initial generation');

  UPDATE public.conduct_intelligence_reports SET current_version = 1 WHERE id = v_id;

  PERFORM public.log_compliance_audit('CREATE','conduct_intelligence_report', v_id::text, NULL,
    jsonb_build_object('template', _template_code, 'period_start', _period_start, 'period_end', _period_end),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct','event','INTELLIGENCE_REPORT_GENERATED'));

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intel_save_version(
  _report_id uuid, _sections jsonb, _ai_draft jsonb DEFAULT NULL,
  _regenerate boolean DEFAULT false, _change_note text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rep record; v_ver integer; v_metrics jsonb; v_prev record;
BEGIN
  SELECT * INTO v_rep FROM public.conduct_intelligence_reports WHERE id = _report_id;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_rep.status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'Only draft or rejected reports can be edited' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_prev FROM public.conduct_intelligence_report_versions
   WHERE report_id = _report_id ORDER BY version DESC LIMIT 1;

  IF _regenerate OR v_prev IS NULL THEN
    v_metrics := public.conduct_intel_aggregate(v_rep.period_start, v_rep.period_end, v_rep.regulator_id);
  ELSE
    v_metrics := v_prev.metrics;
  END IF;

  v_ver := COALESCE(v_prev.version, 0) + 1;

  INSERT INTO public.conduct_intelligence_report_versions(
    report_id, version, sections, metrics, ai_draft, generated_by, change_note)
  VALUES (_report_id, v_ver, COALESCE(_sections,'{}'::jsonb), v_metrics,
    COALESCE(_ai_draft, COALESCE(v_prev.ai_draft,'{}'::jsonb)), auth.uid(),
    COALESCE(NULLIF(btrim(COALESCE(_change_note,'')),''),
             CASE WHEN _regenerate THEN 'Data regenerated' ELSE 'Narrative saved' END));

  UPDATE public.conduct_intelligence_reports
     SET current_version = v_ver, status = 'draft', rejection_reason = NULL
   WHERE id = _report_id;

  IF _regenerate THEN
    PERFORM public.log_compliance_audit('UPDATE','conduct_intelligence_report', _report_id::text, NULL,
      jsonb_build_object('version', v_ver), NULL, NULL, NULL,
      jsonb_build_object('module','market_conduct','event','INTELLIGENCE_REPORT_GENERATED'));
  END IF;

  RETURN v_ver;
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intel_submit_for_approval(
  _report_id uuid, _publish_to_sector boolean DEFAULT false, _approver_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rep record; v_sections jsonb; v_exec text;
BEGIN
  SELECT * INTO v_rep FROM public.conduct_intelligence_reports WHERE id = _report_id;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_rep.status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'Only a draft report can be submitted for approval' USING ERRCODE='22023'; END IF;

  SELECT sections INTO v_sections FROM public.conduct_intelligence_report_versions
   WHERE report_id = _report_id ORDER BY version DESC LIMIT 1;
  v_exec := btrim(COALESCE(v_sections #>> '{executive_summary,narrative}',''));
  IF v_exec = '' THEN
    RAISE EXCEPTION 'The Executive Summary must be completed before the report can be submitted'
      USING ERRCODE='22023';
  END IF;

  UPDATE public.conduct_intelligence_reports
     SET status='pending_approval', submitted_at=now(), submitted_by=auth.uid(),
         approver_id=_approver_id, publish_to_sector=COALESCE(_publish_to_sector,false),
         rejection_reason=NULL
   WHERE id=_report_id;

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','conduct_intelligence_report', _report_id::text,
    jsonb_build_object('status', v_rep.status), jsonb_build_object('status','pending_approval'),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct'));

  PERFORM public.notification_enqueue_event('conduct_intelligence_report_submitted','conduct_intelligence_report',
    _report_id, jsonb_build_object('report_title', v_rep.title, 'period', v_rep.period_start::text||' to '||v_rep.period_end::text),
    _report_id::text, NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intel_approve_report(_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rep record;
BEGIN
  SELECT * INTO v_rep FROM public.conduct_intelligence_reports WHERE id=_report_id;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_approve_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to approve intelligence reports' USING ERRCODE='42501'; END IF;
  IF v_rep.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Report is not awaiting approval' USING ERRCODE='22023'; END IF;
  IF v_rep.submitted_by IS NOT NULL AND v_rep.submitted_by = auth.uid()
     AND NOT has_role(auth.uid(),'super_admin'::app_role) THEN
    RAISE EXCEPTION 'A report cannot be approved by the officer who submitted it' USING ERRCODE='42501'; END IF;

  UPDATE public.conduct_intelligence_reports
     SET status='approved', approved_by=auth.uid(), approved_at=now()
   WHERE id=_report_id;

  PERFORM public.log_compliance_audit('APPROVE','conduct_intelligence_report', _report_id::text,
    jsonb_build_object('status','pending_approval'), jsonb_build_object('status','approved'),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct'));
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intel_reject_report(_report_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rep record;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'A rejection reason of at least 10 characters is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_rep FROM public.conduct_intelligence_reports WHERE id=_report_id;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_approve_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_rep.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Report is not awaiting approval' USING ERRCODE='22023'; END IF;

  UPDATE public.conduct_intelligence_reports
     SET status='rejected', rejection_reason=btrim(_reason)
   WHERE id=_report_id;

  PERFORM public.log_compliance_audit('REJECT','conduct_intelligence_report', _report_id::text,
    jsonb_build_object('status','pending_approval'), jsonb_build_object('status','rejected'),
    btrim(_reason), NULL, NULL, jsonb_build_object('module','market_conduct'));
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intel_publish_report(_report_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rep record; v_count integer := 0; v_prev uuid;
BEGIN
  SELECT * INTO v_rep FROM public.conduct_intelligence_reports WHERE id=_report_id;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_approve_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to publish intelligence reports' USING ERRCODE='42501'; END IF;
  IF v_rep.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved report can be published' USING ERRCODE='22023'; END IF;

  SELECT id INTO v_prev FROM public.conduct_intelligence_reports
   WHERE status='published' AND template_code = v_rep.template_code
     AND COALESCE(regulator_id,'00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(v_rep.regulator_id,'00000000-0000-0000-0000-000000000000'::uuid)
   ORDER BY published_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    UPDATE public.conduct_intelligence_reports
       SET status='superseded', superseded_at=now() WHERE id=v_prev;
  END IF;

  UPDATE public.conduct_intelligence_reports
     SET status='published', published_by=auth.uid(), published_at=now(),
         supersedes_report_id=v_prev
   WHERE id=_report_id;

  IF v_rep.publish_to_sector THEN
    INSERT INTO public.conduct_intelligence_report_recipients(report_id, licensee_id)
    SELECT _report_id, l.id FROM public.licensees l
     WHERE (v_rep.sector_id IS NULL OR l.sector_id = v_rep.sector_id)
    ON CONFLICT (report_id, licensee_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','conduct_intelligence_report', _report_id::text,
    jsonb_build_object('status','approved'), jsonb_build_object('status','published'),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct',
      'event','INTELLIGENCE_REPORT_PUBLISHED','recipients',v_count,'supersedes',v_prev));

  PERFORM public.notification_enqueue_event('conduct_intelligence_report_published','conduct_intelligence_report',
    _report_id, jsonb_build_object('report_title', v_rep.title,
      'period', v_rep.period_start::text||' to '||v_rep.period_end::text,
      'recipients', v_count), _report_id::text, NULL, NULL);

  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intel_log_export(_report_id uuid, _format text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.can_view_conduct_intelligence()
          OR EXISTS (SELECT 1 FROM public.conduct_intelligence_report_recipients r
                     JOIN public.conduct_intelligence_reports rep ON rep.id = r.report_id
                     WHERE r.report_id = _report_id AND rep.status = 'published'
                       AND public.can_current_user_access_licensee(r.licensee_id))) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501';
  END IF;
  PERFORM public.log_compliance_audit('EXPORT','conduct_intelligence_report', _report_id::text,
    NULL, jsonb_build_object('format', COALESCE(_format,'pdf')), NULL, NULL, NULL,
    jsonb_build_object('module','market_conduct','event','INTELLIGENCE_REPORT_EXPORTED'));
END $$;

REVOKE ALL ON FUNCTION public.conduct_intel_create_report(text, text, date, date, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_intel_save_version(uuid, jsonb, jsonb, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_intel_submit_for_approval(uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_intel_approve_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_intel_reject_report(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_intel_publish_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_intel_log_export(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_intel_create_report(text, text, date, date, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_save_version(uuid, jsonb, jsonb, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_submit_for_approval(uuid, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_approve_report(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_reject_report(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_publish_report(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intel_log_export(uuid, text) TO authenticated, service_role;

-- 10. Seed templates ---------------------------------------------------
INSERT INTO public.conduct_intelligence_templates (code, name, description, recommended_period_days, sort_order, sections)
VALUES
 ('monthly_conduct_intelligence','Monthly Conduct Intelligence Report','Monthly synthesis of complaint trends, alerts and enforcement activity.',30,1,
  '[{"key":"executive_summary","label":"Executive Summary"},{"key":"complaint_volume","label":"Complaint Volume Analysis"},{"key":"top_issues","label":"Top Conduct Issues"},{"key":"pattern_alerts","label":"Pattern Alerts Summary"},{"key":"thematic_reviews","label":"Thematic Review Outcomes"},{"key":"enforcement","label":"Enforcement Actions"},{"key":"emerging_risks","label":"Emerging Risks"},{"key":"recommendations","label":"Recommendations"}]'::jsonb),
 ('quarterly_conduct_review','Quarterly Conduct Review','Quarterly review of market conduct supervision outcomes.',91,2,
  '[{"key":"executive_summary","label":"Executive Summary"},{"key":"complaint_volume","label":"Complaint Volume Analysis"},{"key":"top_issues","label":"Top Conduct Issues"},{"key":"pattern_alerts","label":"Pattern Alerts Summary"},{"key":"thematic_reviews","label":"Thematic Review Outcomes"},{"key":"enforcement","label":"Enforcement Actions"},{"key":"emerging_risks","label":"Emerging Risks"},{"key":"recommendations","label":"Recommendations"}]'::jsonb),
 ('sector_supervision_update','Sector Supervision Update','Sector-facing supervisory update on conduct expectations and findings.',30,3,
  '[{"key":"executive_summary","label":"Executive Summary"},{"key":"top_issues","label":"Top Conduct Issues"},{"key":"thematic_reviews","label":"Thematic Review Outcomes"},{"key":"enforcement","label":"Enforcement Actions"},{"key":"recommendations","label":"Recommendations"}]'::jsonb),
 ('annual_consumer_protection','Annual Consumer Protection Report','Annual consumer-protection intelligence report for publication.',365,4,
  '[{"key":"executive_summary","label":"Executive Summary"},{"key":"complaint_volume","label":"Complaint Volume Analysis"},{"key":"top_issues","label":"Top Conduct Issues"},{"key":"pattern_alerts","label":"Pattern Alerts Summary"},{"key":"thematic_reviews","label":"Thematic Review Outcomes"},{"key":"enforcement","label":"Enforcement Actions"},{"key":"emerging_risks","label":"Emerging Risks"},{"key":"recommendations","label":"Recommendations"}]'::jsonb),
 ('custom','Custom Report','Custom intelligence report with all available sections.',30,9,
  '[{"key":"executive_summary","label":"Executive Summary"},{"key":"complaint_volume","label":"Complaint Volume Analysis"},{"key":"top_issues","label":"Top Conduct Issues"},{"key":"pattern_alerts","label":"Pattern Alerts Summary"},{"key":"thematic_reviews","label":"Thematic Review Outcomes"},{"key":"enforcement","label":"Enforcement Actions"},{"key":"emerging_risks","label":"Emerging Risks"},{"key":"recommendations","label":"Recommendations"}]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 11. Notification events ---------------------------------------------
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, channels, recipient_rules, notification_type, is_active)
VALUES
  ('conduct_intelligence_report_submitted','An intelligence report was submitted for approval',
   'Intelligence report awaiting approval: {{report_title}}',
   'The intelligence report "{{report_title}}" covering {{period}} is awaiting your approval.',
   ARRAY['in_app','email'],
   '[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"},{"type":"role","role":"supervisor"}]'::jsonb,
   'info',true),
  ('conduct_intelligence_report_published','An intelligence report was published to the sector',
   'New regulatory intelligence: {{report_title}}',
   'The report "{{report_title}}" covering {{period}} has been published and is available in your portal.',
   ARRAY['in_app','email'],
   '[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"},{"type":"entity_primary_users"}]'::jsonb,
   'info',true)
ON CONFLICT (event_key) DO NOTHING;