-- 1. Record which source modules contributed to each stored AI analysis.
ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS source_modules text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Per-source permission resolution for advisory AI.
CREATE OR REPLACE FUNCTION public.can_view_advisory_ai_source(_source text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select case _source
    when 'prudential' then
      public.has_permission(auth.uid(), 'prudential_supervision', 'view')
    when 'examinations' then
      public.has_permission(auth.uid(), 'prudential_supervision', 'view')
      or public.has_permission(auth.uid(), 'inspection_management', 'view')
    when 'complaints' then
      public.has_permission(auth.uid(), 'complaint_management', 'view')
    when 'conduct' then
      public.has_permission(auth.uid(), 'market_conduct', 'view')
    when 'enforcement' then
      public.has_permission(auth.uid(), 'enforcement_management', 'view')
    when 'supervisory_actions' then
      public.has_permission(auth.uid(), 'prudential_supervision', 'view')
    when 'licensing' then
      public.has_permission(auth.uid(), 'license_management', 'view')
      or public.has_permission(auth.uid(), 'application_management', 'view')
    when 'fit_and_proper' then
      public.has_permission(auth.uid(), 'fit_proper_assessment', 'view')
    else false
  end;
$$;

REVOKE ALL ON FUNCTION public.can_view_advisory_ai_source(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_advisory_ai_source(text) TO authenticated, service_role;

-- 3. Source-aware visibility for stored analyses. A stored analysis is only
--    visible when the viewer passes the module's own permission AND holds view
--    permission for every module that contributed data to it. Legacy
--    cross-module rows without source metadata are never returned.
CREATE OR REPLACE FUNCTION public.can_view_advisory_ai(_module text, _source_modules text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    public.can_view_advisory_ai(_module)
    and (
      -- legacy cross-module analyses carry no source metadata: require regeneration
      case when _module = 'cross_module'
        then coalesce(array_length(_source_modules, 1), 0) > 0
        else true
      end
    )
    and not exists (
      select 1
      from unnest(coalesce(_source_modules, '{}'::text[])) s
      where not public.can_view_advisory_ai_source(s)
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_advisory_ai(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_advisory_ai(text, text[]) TO authenticated, service_role;

-- 4. Point the supervisory policies at the source-aware check.
DROP POLICY IF EXISTS ai_insights_read_supervisory ON public.ai_insights;
CREATE POLICY ai_insights_read_supervisory
  ON public.ai_insights FOR SELECT TO authenticated
  USING (public.can_view_advisory_ai(module, source_modules));

DROP POLICY IF EXISTS ai_insights_feedback_update_supervisory ON public.ai_insights;
CREATE POLICY ai_insights_feedback_update_supervisory
  ON public.ai_insights FOR UPDATE TO authenticated
  USING (public.can_view_advisory_ai(module, source_modules))
  WITH CHECK (public.can_view_advisory_ai(module, source_modules));