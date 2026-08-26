-- ============================================================
-- MC-06 — Patterns & Similarity (deterministic backend)
-- Storage layer. Reuses conduct_monitoring_rules/_versions/_runs.
-- ============================================================

ALTER TABLE public.conduct_monitoring_rules
  ADD COLUMN IF NOT EXISTS pattern_type text;

CREATE SEQUENCE IF NOT EXISTS public.conduct_cluster_reference_seq;

-- ---------- clusters ----------
CREATE TABLE IF NOT EXISTS public.conduct_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  dedupe_key text NOT NULL UNIQUE,
  rule_id uuid NOT NULL REFERENCES public.conduct_monitoring_rules(id) ON DELETE RESTRICT,
  rule_code text,
  rule_version integer NOT NULL DEFAULT 1,
  rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pattern_type text NOT NULL,
  title text NOT NULL,
  regulator_id uuid,
  licensee_id uuid,
  sector_id uuid,
  product_id uuid,
  channel_id uuid,
  complaint_type_id uuid,
  conduct_risk_category_id uuid,
  group_key jsonb NOT NULL DEFAULT '{}'::jsonb,
  metric text NOT NULL,
  metric_value numeric NOT NULL,
  metric_unit text NOT NULL DEFAULT 'count',
  threshold_value numeric NOT NULL,
  comparison_operator text NOT NULL DEFAULT '>=',
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  window_days integer NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'medium',
  severity_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  systemic_member_count integer NOT NULL DEFAULT 0,
  distinct_entity_count integer NOT NULL DEFAULT 0,
  match_explanation text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  reviewer_id uuid,
  reviewed_at timestamptz,
  review_note text,
  raised_signal_id uuid REFERENCES public.conduct_signals(id) ON DELETE SET NULL,
  raised_alert_id uuid REFERENCES public.conduct_alerts(id) ON DELETE SET NULL,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  evaluation_count integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_clusters_status_chk
    CHECK (status IN ('open','under_review','confirmed','dismissed','superseded')),
  CONSTRAINT conduct_clusters_operator_chk
    CHECK (comparison_operator IN ('>=','>','=','<=','<')),
  CONSTRAINT conduct_clusters_window_chk CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS idx_conduct_clusters_rule ON public.conduct_clusters(rule_id);
CREATE INDEX IF NOT EXISTS idx_conduct_clusters_entity ON public.conduct_clusters(licensee_id);
CREATE INDEX IF NOT EXISTS idx_conduct_clusters_status ON public.conduct_clusters(status);
CREATE INDEX IF NOT EXISTS idx_conduct_clusters_pattern ON public.conduct_clusters(pattern_type);
CREATE INDEX IF NOT EXISTS idx_conduct_clusters_window ON public.conduct_clusters(window_start, window_end);

-- ---------- members ----------
CREATE TABLE IF NOT EXISTS public.conduct_cluster_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.conduct_clusters(id) ON DELETE CASCADE,
  member_type text NOT NULL,
  member_table text NOT NULL,
  member_id uuid NOT NULL,
  member_reference text,
  member_title text,
  member_severity text,
  occurred_at timestamptz,
  contribution numeric NOT NULL DEFAULT 1,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_cluster_members_type_chk
    CHECK (member_type IN ('signal','complaint','complaint_outcome','conduct_alert','monitoring_result')),
  CONSTRAINT conduct_cluster_members_uk UNIQUE (cluster_id, member_type, member_id)
);

CREATE INDEX IF NOT EXISTS idx_conduct_cluster_members_cluster ON public.conduct_cluster_members(cluster_id);
CREATE INDEX IF NOT EXISTS idx_conduct_cluster_members_member ON public.conduct_cluster_members(member_type, member_id);

-- ---------- metric evidence / deterministic run history ----------
CREATE TABLE IF NOT EXISTS public.conduct_cluster_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.conduct_clusters(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.conduct_monitoring_rule_runs(id) ON DELETE SET NULL,
  rule_id uuid NOT NULL REFERENCES public.conduct_monitoring_rules(id) ON DELETE RESTRICT,
  rule_version integer NOT NULL,
  metric text NOT NULL,
  metric_value numeric NOT NULL,
  threshold_value numeric NOT NULL,
  comparison_operator text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  matched boolean NOT NULL DEFAULT true,
  member_count integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_cluster_metrics_uk
    UNIQUE (cluster_id, rule_version, metric, window_start, window_end, metric_value)
);

CREATE INDEX IF NOT EXISTS idx_conduct_cluster_metrics_cluster ON public.conduct_cluster_metrics(cluster_id);
CREATE INDEX IF NOT EXISTS idx_conduct_cluster_metrics_run ON public.conduct_cluster_metrics(run_id);

-- ---------- append-only history ----------
CREATE TABLE IF NOT EXISTS public.conduct_cluster_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.conduct_clusters(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conduct_cluster_history_cluster ON public.conduct_cluster_history(cluster_id);

DROP TRIGGER IF EXISTS trg_conduct_cluster_history_appendonly ON public.conduct_cluster_history;
CREATE TRIGGER trg_conduct_cluster_history_appendonly
  BEFORE UPDATE OR DELETE ON public.conduct_cluster_history
  FOR EACH ROW EXECUTE FUNCTION public.conduct_appendonly_guard();

DROP TRIGGER IF EXISTS trg_conduct_clusters_updated_at ON public.conduct_clusters;
CREATE TRIGGER trg_conduct_clusters_updated_at
  BEFORE UPDATE ON public.conduct_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- reuse evidence engine ----------
ALTER TABLE public.conduct_evidence
  ADD COLUMN IF NOT EXISTS cluster_id uuid REFERENCES public.conduct_clusters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conduct_evidence_cluster ON public.conduct_evidence(cluster_id);

-- ---------- grants (read-only for app roles; writes only via governed RPCs) ----------
GRANT SELECT ON public.conduct_clusters TO authenticated;
GRANT SELECT ON public.conduct_cluster_members TO authenticated;
GRANT SELECT ON public.conduct_cluster_metrics TO authenticated;
GRANT SELECT ON public.conduct_cluster_history TO authenticated;
GRANT ALL ON public.conduct_clusters TO service_role;
GRANT ALL ON public.conduct_cluster_members TO service_role;
GRANT ALL ON public.conduct_cluster_metrics TO service_role;
GRANT ALL ON public.conduct_cluster_history TO service_role;

ALTER TABLE public.conduct_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_cluster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_cluster_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_cluster_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read conduct clusters" ON public.conduct_clusters;
CREATE POLICY "Read conduct clusters" ON public.conduct_clusters FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

DROP POLICY IF EXISTS "Read conduct cluster members" ON public.conduct_cluster_members;
CREATE POLICY "Read conduct cluster members" ON public.conduct_cluster_members FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

DROP POLICY IF EXISTS "Read conduct cluster metrics" ON public.conduct_cluster_metrics;
CREATE POLICY "Read conduct cluster metrics" ON public.conduct_cluster_metrics FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

DROP POLICY IF EXISTS "Read conduct cluster history" ON public.conduct_cluster_history;
CREATE POLICY "Read conduct cluster history" ON public.conduct_cluster_history FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'market_conduct', 'view'));
