-- Slice 15: Complaints / Conduct / Reports RLS lockdown via has_permission

-- ============ COMPLAINTS ============
DROP POLICY IF EXISTS "Read complaints" ON public.complaints;
CREATE POLICY "Read complaints" ON public.complaints
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR auth.uid() = complainant_id
  OR public.has_permission(auth.uid(), 'complaint_management', 'view')
);

DROP POLICY IF EXISTS "Update complaints" ON public.complaints;
CREATE POLICY "Update complaints" ON public.complaints
FOR UPDATE USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'edit')
  OR auth.uid() = investigator_id
) WITH CHECK (true);

DROP POLICY IF EXISTS "Internal staff can insert internal complaints" ON public.complaints;
CREATE POLICY "Internal can insert complaints" ON public.complaints
FOR INSERT WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'create')
);

DROP POLICY IF EXISTS "Internal manage complaint evidence" ON public.complaint_evidence;
CREATE POLICY "Internal manage complaint evidence" ON public.complaint_evidence
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'view')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'edit')
  OR public.has_permission(auth.uid(), 'complaint_management', 'create')
);

DROP POLICY IF EXISTS "Internal manage complaint correspondence" ON public.complaint_correspondence;
CREATE POLICY "Internal manage complaint correspondence" ON public.complaint_correspondence
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'view')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'edit')
  OR public.has_permission(auth.uid(), 'complaint_management', 'create')
);

DROP POLICY IF EXISTS "Internal manage complaint tasks" ON public.complaint_investigation_tasks;
CREATE POLICY "Internal manage complaint tasks" ON public.complaint_investigation_tasks
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'view')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'complaint_management', 'edit')
);

-- ============ MARKET CONDUCT ============
DROP POLICY IF EXISTS "Read conduct alerts" ON public.conduct_alerts;
CREATE POLICY "Read conduct alerts" ON public.conduct_alerts
FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

DROP POLICY IF EXISTS "Manage conduct alerts" ON public.conduct_alerts;
CREATE POLICY "Manage conduct alerts" ON public.conduct_alerts
FOR ALL USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'manage_complaints'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'manage_complaints'));

DROP POLICY IF EXISTS "Internal read ca" ON public.conduct_actions;
CREATE POLICY "Read conduct actions" ON public.conduct_actions
FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

DROP POLICY IF EXISTS "Internal write ca" ON public.conduct_actions;
CREATE POLICY "Manage conduct actions" ON public.conduct_actions
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'issue_enforcement_action')
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_complaints')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'issue_enforcement_action')
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_complaints')
);

DROP POLICY IF EXISTS "ci_read" ON public.conduct_investigations;
CREATE POLICY "ci_read" ON public.conduct_investigations
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'view')
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace')
);

DROP POLICY IF EXISTS "ci_write" ON public.conduct_investigations;
CREATE POLICY "ci_write" ON public.conduct_investigations
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace')
);

DROP POLICY IF EXISTS "ce_read" ON public.conduct_evidence;
CREATE POLICY "ce_read" ON public.conduct_evidence
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'view')
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'manage_evidence_repository')
);

DROP POLICY IF EXISTS "ce_write" ON public.conduct_evidence;
CREATE POLICY "ce_write" ON public.conduct_evidence
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'manage_evidence_repository')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct_investigation', 'manage_evidence_repository')
);

DROP POLICY IF EXISTS "Internal read cmres" ON public.conduct_monitoring_results;
CREATE POLICY "Read cmres" ON public.conduct_monitoring_results
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  OR public.has_permission(auth.uid(), 'market_conduct', 'run_conduct_analytics')
);

DROP POLICY IF EXISTS "Internal write cmres" ON public.conduct_monitoring_results;
CREATE POLICY "Write cmres" ON public.conduct_monitoring_results
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules')
  OR public.has_permission(auth.uid(), 'market_conduct', 'run_conduct_analytics')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules')
  OR public.has_permission(auth.uid(), 'market_conduct', 'run_conduct_analytics')
);

DROP POLICY IF EXISTS "Internal read cmr" ON public.conduct_monitoring_rules;
CREATE POLICY "Read cmr" ON public.conduct_monitoring_rules
FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

DROP POLICY IF EXISTS "Internal write cmr" ON public.conduct_monitoring_rules;
CREATE POLICY "Write cmr" ON public.conduct_monitoring_rules
FOR ALL USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules'));

DROP POLICY IF EXISTS "cmrr_read" ON public.conduct_monitoring_rule_runs;
CREATE POLICY "cmrr_read" ON public.conduct_monitoring_rule_runs
FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

DROP POLICY IF EXISTS "cmrr_write" ON public.conduct_monitoring_rule_runs;
CREATE POLICY "cmrr_write" ON public.conduct_monitoring_rule_runs
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules')
  OR public.has_permission(auth.uid(), 'market_conduct', 'run_conduct_analytics')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules')
  OR public.has_permission(auth.uid(), 'market_conduct', 'run_conduct_analytics')
);

-- conduct config tables
DO $$
DECLARE t text; label text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['conduct_channels','conduct_products','conduct_risk_categories','conduct_triage_rules','conduct_alert_thresholds'])
  LOOP
    label := replace(t,'_',' ');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Read ' || label, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Manage ' || label, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'conduct_cfg_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'conduct_cfg_write', t);
    EXECUTE format($f$
      CREATE POLICY "conduct_cfg_read" ON public.%I
      FOR SELECT USING (
        public.is_super_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'market_conduct', 'view')
      )
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "conduct_cfg_write" ON public.%I
      FOR ALL USING (
        public.is_super_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules')
      ) WITH CHECK (
        public.is_super_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'market_conduct', 'manage_monitoring_rules')
      )
    $f$, t);
  END LOOP;
END $$;

-- ============ REPORTS ============
DROP POLICY IF EXISTS "Internal users read reports" ON public.reports;
CREATE POLICY "Internal users read reports" ON public.reports
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'report_management', 'report_management.view')
);

DROP POLICY IF EXISTS "Internal users create reports" ON public.reports;
CREATE POLICY "Internal users create reports" ON public.reports
FOR INSERT WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'report_management', 'create')
);

DROP POLICY IF EXISTS "Admins delete reports" ON public.reports;
CREATE POLICY "Admins delete reports" ON public.reports
FOR DELETE USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'report_management', 'create')
);

DROP POLICY IF EXISTS "Owners update reports" ON public.reports;
CREATE POLICY "Owners update reports" ON public.reports
FOR UPDATE USING (
  public.is_super_admin(auth.uid())
  OR created_by = auth.uid()
  OR public.has_permission(auth.uid(), 'report_management', 'create')
) WITH CHECK (true);

DROP POLICY IF EXISTS "Privileged users read report definitions" ON public.report_definitions;
CREATE POLICY "Read report definitions" ON public.report_definitions
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'report_management', 'report_management.view')
);

DROP POLICY IF EXISTS "Admins manage report definitions" ON public.report_definitions;
CREATE POLICY "Manage report definitions" ON public.report_definitions
FOR ALL USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'report_management', 'create')
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'report_management', 'create')
);

DROP POLICY IF EXISTS "Read report logs" ON public.report_logs;
CREATE POLICY "Read report logs" ON public.report_logs
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR executed_by = auth.uid()
  OR public.has_permission(auth.uid(), 'report_management', 'report_management.view')
);

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['report_sources','report_source_columns','report_source_filters','report_dashboard_layouts','report_dashboard_widgets'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' admin write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rpt_cfg_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rpt_cfg_write', t);
    EXECUTE format($f$
      CREATE POLICY "rpt_cfg_read" ON public.%I
      FOR SELECT USING (
        public.is_super_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'report_management', 'report_management.view')
      )
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "rpt_cfg_write" ON public.%I
      FOR ALL USING (
        public.is_super_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'report_management', 'create')
      ) WITH CHECK (
        public.is_super_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'report_management', 'create')
      )
    $f$, t);
  END LOOP;
END $$;
