-- =====================================================================
-- EPIC 2 CLOSURE (PART 2) — single canonical planning path
-- =====================================================================

-- 1. plan item status values (item_save writes PENDING / IN_PROGRESS)
ALTER TABLE public.supervisory_plan_item
  DROP CONSTRAINT IF EXISTS conduct_plan_milestone_status_chk;
ALTER TABLE public.supervisory_plan_item
  ADD CONSTRAINT supervisory_plan_item_status_chk
  CHECK (status = ANY (ARRAY['PENDING','OPEN','IN_PROGRESS','COMPLETED','CANCELLED']));

-- 2. domain-neutral read access on the renamed canonical relations
DROP POLICY IF EXISTS conduct_attention_items_read ON public.supervisory_attention;
CREATE POLICY supervisory_attention_read ON public.supervisory_attention
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      NOT public.has_external_role(auth.uid())
      AND (
        public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
          'prudential_supervision.view','aml_supervision.view'])
        OR (public.has_permission(auth.uid(),'market_conduct','view')
            AND public.regulatory_scope_allows(auth.uid(),'market_conduct','view',
                  regulator_id, sector_id, NULL::uuid, NULL::uuid, auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS conduct_supervisory_plans_read ON public.supervisory_plan;
CREATE POLICY supervisory_plan_read ON public.supervisory_plan
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      NOT public.has_external_role(auth.uid())
      AND (
        public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
          'prudential_supervision.view','aml_supervision.view'])
        OR (public.has_permission(auth.uid(),'market_conduct','view')
            AND public.regulatory_scope_allows(auth.uid(),'market_conduct','view',
                  regulator_id, sector_id, NULL::uuid, NULL::uuid, auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS conduct_interventions_read ON public.supervisory_intervention;
CREATE POLICY supervisory_intervention_read ON public.supervisory_intervention
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      NOT public.has_external_role(auth.uid())
      AND (
        public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
          'prudential_supervision.view','aml_supervision.view'])
        OR (public.has_permission(auth.uid(),'market_conduct','view')
            AND public.regulatory_scope_allows(auth.uid(),'market_conduct','view',
                  regulator_id, sector_id, NULL::uuid, NULL::uuid, auth.uid()))
      )
    )
  );

-- 3. compatibility views now project the CANONICAL model (single source of truth).
--    The legacy tables remain as immutable archival evidence.
DROP VIEW IF EXISTS public.supervisory_plan_actions;
DROP VIEW IF EXISTS public.supervisory_plans;

CREATE VIEW public.supervisory_plans
WITH (security_invoker = true) AS
  SELECT p.id,
         (CASE WHEN array_length(p.entity_ids,1) >= 1 THEN p.entity_ids[1] END) AS entity_id,
         NULL::uuid            AS license_id,
         NULL::uuid            AS risk_rating_id,
         lower(p.origin_provenance) AS created_from,
         lower(p.status)       AS status,
         p.objective           AS notes,
         p.created_by,
         p.created_at,
         p.updated_at,
         lower(p.status)       AS approval_status,
         p.submitted_at        AS submitted_for_review_at,
         p.submitted_by        AS submitted_for_review_by,
         p.approved_at,
         p.approved_by
    FROM public.supervisory_plan p;

CREATE VIEW public.supervisory_plan_actions
WITH (security_invoker = true) AS
  SELECT i.id,
         i.plan_id,
         i.title,
         i.detail            AS description,
         NULL::text          AS owner_role,
         i.due_date,
         lower(i.status)     AS status,
         i.completed_at,
         i.completed_by,
         lower(COALESCE(i.source,'plan')) AS source,
         i.created_at,
         i.updated_at,
         NULL::date          AS previous_due_date,
         NULL::text          AS extension_reason,
         NULL::uuid          AS reassigned_from,
         NULL::timestamptz   AS reassigned_at,
         NULL::uuid          AS reassigned_by
    FROM public.supervisory_plan_item i;

GRANT SELECT ON public.supervisory_plans TO authenticated, service_role;
GRANT SELECT ON public.supervisory_plan_actions TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_plans FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_plan_actions FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.supervisory_compat_view_readonly()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'legacy_path_retired: % is a read-only compatibility view; use the governed supervisory plan operations', TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.supervisory_compat_view_readonly() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_compat_view_readonly() TO service_role;

CREATE TRIGGER supervisory_plans_readonly_ins INSTEAD OF INSERT ON public.supervisory_plans
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_compat_view_readonly();
CREATE TRIGGER supervisory_plans_readonly_upd INSTEAD OF UPDATE ON public.supervisory_plans
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_compat_view_readonly();
CREATE TRIGGER supervisory_plans_readonly_del INSTEAD OF DELETE ON public.supervisory_plans
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_compat_view_readonly();
CREATE TRIGGER supervisory_plan_actions_readonly_ins INSTEAD OF INSERT ON public.supervisory_plan_actions
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_compat_view_readonly();
CREATE TRIGGER supervisory_plan_actions_readonly_upd INSTEAD OF UPDATE ON public.supervisory_plan_actions
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_compat_view_readonly();
CREATE TRIGGER supervisory_plan_actions_readonly_del INSTEAD OF DELETE ON public.supervisory_plan_actions
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_compat_view_readonly();

-- 4. the four legacy prudential plan operations now delegate to the canonical spine
DROP FUNCTION IF EXISTS public.supervisory_plan_create(uuid, uuid, uuid, text, text);
CREATE FUNCTION public.supervisory_plan_create(
  _entity_id uuid,
  _license_id uuid DEFAULT NULL,
  _risk_rating_id uuid DEFAULT NULL,
  _created_from text DEFAULT 'manual',
  _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text; _basis text; _objective text;
BEGIN
  SELECT name INTO _name FROM public.licensees WHERE id = _entity_id;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'not_found: entity %', _entity_id USING ERRCODE = '22023'; END IF;
  _objective := COALESCE(NULLIF(btrim(COALESCE(_notes,'')),''),
    'Deliver the planned prudential supervisory activities for this entity.');
  _basis := 'Prudential supervisory plan raised from the entity supervision workspace for '
            || _name || ' (' || COALESCE(_created_from,'manual') || ').';
  RETURN public.supervisory_plan_open(
    _title          := 'Supervisory plan — ' || _name,
    _domain_code    := 'PRUDENTIAL',
    _factual_basis  := _basis,
    _objective      := _objective,
    _entity_ids     := ARRAY[_entity_id],
    _planning_period := 'annual');
END $$;

DROP FUNCTION IF EXISTS public.supervisory_plan_decision(uuid, text, text);
CREATE FUNCTION public.supervisory_plan_decision(
  _plan_id uuid, _decision text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _to text; _rationale text;
BEGIN
  _to := CASE lower(btrim(COALESCE(_decision,'')))
           WHEN 'submit_for_review' THEN 'SUBMITTED'
           WHEN 'submit'            THEN 'SUBMITTED'
           WHEN 'approve'           THEN 'APPROVED'
           WHEN 'activate'          THEN 'ACTIVE'
           WHEN 'complete'          THEN 'COMPLETED'
           WHEN 'cancel'            THEN 'CANCELLED'
           WHEN 'reject'            THEN 'DRAFT'
           WHEN 'return'            THEN 'DRAFT'
           ELSE NULL END;
  IF _to IS NULL THEN
    RAISE EXCEPTION 'unsupported_decision: %', _decision USING ERRCODE = '22023'; END IF;
  _rationale := COALESCE(NULLIF(btrim(COALESCE(_reason,'')),''),
    'Supervisory plan decision recorded: ' || _decision || '.');
  IF length(_rationale) < 10 THEN
    _rationale := _rationale || ' Recorded through the supervisory plan workspace.'; END IF;
  RETURN public.supervisory_plan_lifecycle(_plan_id, _to, _rationale);
END $$;

DROP FUNCTION IF EXISTS public.supervisory_plan_action_create(uuid, text, text, text, date, text);
CREATE FUNCTION public.supervisory_plan_action_create(
  _plan_id uuid, _title text, _description text DEFAULT NULL,
  _owner_role text DEFAULT NULL, _due_date date DEFAULT NULL, _source text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _detail text;
BEGIN
  IF _title IS NULL OR btrim(_title) = '' THEN
    RAISE EXCEPTION 'activity title is required' USING ERRCODE = '22023'; END IF;
  _detail := COALESCE(_description,'');
  IF _owner_role IS NOT NULL THEN
    _detail := btrim(_detail || CASE WHEN _detail = '' THEN '' ELSE E'\n' END
                     || 'Owner role: ' || _owner_role);
  END IF;
  RETURN public.supervisory_plan_item_save(
    _plan_id   := _plan_id,
    _title     := _title,
    _item_type := 'ACTION',
    _detail    := NULLIF(_detail,''),
    _due_date  := _due_date,
    _status    := 'OPEN',
    _source    := COALESCE(_source,'PLAN'));
END $$;

DROP FUNCTION IF EXISTS public.supervisory_plan_action_transition(uuid, text, text, text, date);
CREATE FUNCTION public.supervisory_plan_action_transition(
  _action_id uuid, _to_status text, _reason text DEFAULT NULL,
  _owner_role text DEFAULT NULL, _due_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _item public.supervisory_plan_item; _to text;
BEGIN
  SELECT * INTO _item FROM public.supervisory_plan_item WHERE id = _action_id;
  IF _item.id IS NULL THEN
    RAISE EXCEPTION 'not_found: plan item %', _action_id USING ERRCODE = '22023'; END IF;
  _to := CASE lower(btrim(COALESCE(_to_status,'')))
           WHEN 'planned'     THEN 'OPEN'
           WHEN 'open'        THEN 'OPEN'
           WHEN 'pending'     THEN 'PENDING'
           WHEN 'in_progress' THEN 'IN_PROGRESS'
           WHEN 'completed'   THEN 'COMPLETED'
           WHEN 'complete'    THEN 'COMPLETED'
           WHEN 'cancelled'   THEN 'CANCELLED'
           WHEN 'canceled'    THEN 'CANCELLED'
           ELSE NULL END;
  IF _to IS NULL THEN
    RAISE EXCEPTION 'unsupported_status: %', _to_status USING ERRCODE = '22023'; END IF;
  RETURN public.supervisory_plan_item_save(
    _plan_id  := _item.plan_id,
    _title    := _item.title,
    _item_type := _item.item_type,
    _detail   := COALESCE(NULLIF(btrim(COALESCE(_reason,'')),''), _item.detail),
    _due_date := COALESCE(_due_date, _item.due_date),
    _item_id  := _action_id,
    _status   := _to,
    _source   := _item.source);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_plan_create(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_plan_decision(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_plan_action_create(uuid, text, text, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_plan_action_transition(uuid, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_create(uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_decision(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_action_create(uuid, text, text, text, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_action_transition(uuid, text, text, text, date) TO authenticated, service_role;