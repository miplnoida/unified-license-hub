
ALTER TABLE public.prudential_ratios
  ADD COLUMN IF NOT EXISTS category text
    CHECK (category IN ('capital','liquidity','asset_quality','profitability','concentration','other'))
    DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS recommendation_template text;

CREATE TABLE IF NOT EXISTS public.return_consolidated_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL,
  return_config_id uuid NULL,
  sector_id uuid NULL,
  health_score numeric(5,2) NULL,
  capital_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  liquidity_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_quality_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  profitability_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  concentration_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  trend jsonb NOT NULL DEFAULT '[]'::jsonb,
  peer jsonb NOT NULL DEFAULT '[]'::jsonb,
  heatmap jsonb NOT NULL DEFAULT '[]'::jsonb,
  early_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_summary text NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_by uuid NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.return_consolidated_analysis TO authenticated;
GRANT ALL ON public.return_consolidated_analysis TO service_role;
ALTER TABLE public.return_consolidated_analysis ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='return_consolidated_analysis' AND policyname='read return analysis') THEN
    CREATE POLICY "read return analysis" ON public.return_consolidated_analysis
      FOR SELECT TO authenticated
      USING (
        public.has_role(auth.uid(),'admin'::app_role)
        OR public.has_role(auth.uid(),'super_admin'::app_role)
        OR public.has_role(auth.uid(),'supervisor'::app_role)
        OR public.has_role(auth.uid(),'licensing_officer'::app_role)
        OR public.has_role(auth.uid(),'analyst'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.returns_filed rf
          WHERE rf.id = return_consolidated_analysis.return_id
            AND (
              rf.entity_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.entity_user_access eua
                WHERE eua.user_id = auth.uid()
                  AND eua.is_active = true
                  AND eua.entity_id = COALESCE(rf.on_behalf_of_licensee_id, rf.entity_id)
              )
            )
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rca_return ON public.return_consolidated_analysis(return_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rca_sector ON public.return_consolidated_analysis(sector_id, computed_at DESC);

DROP TRIGGER IF EXISTS tg_rca_appendonly ON public.return_consolidated_analysis;
CREATE TRIGGER tg_rca_appendonly BEFORE UPDATE OR DELETE ON public.return_consolidated_analysis
  FOR EACH ROW EXECUTE FUNCTION public.prudential_appendonly_guard();

CREATE OR REPLACE FUNCTION public.latest_return_analysis(_return_id uuid)
RETURNS SETOF public.return_consolidated_analysis
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.return_consolidated_analysis
   WHERE return_id = _return_id
   ORDER BY computed_at DESC
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.latest_return_analysis(uuid) TO authenticated;
