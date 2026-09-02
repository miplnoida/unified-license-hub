-- =====================================================================
-- EPIC 2 CLOSURE: legacy planning convergence + parallel-path lockdown
-- =====================================================================

-- 1. Canonical planning: physical link back to the legacy population -----
ALTER TABLE public.supervisory_plan
  ADD COLUMN IF NOT EXISTS legacy_plan_id uuid REFERENCES public.legacy_supervisory_plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS origin_provenance text NOT NULL DEFAULT 'GOVERNED';

CREATE UNIQUE INDEX IF NOT EXISTS supervisory_plan_legacy_plan_id_key
  ON public.supervisory_plan(legacy_plan_id) WHERE legacy_plan_id IS NOT NULL;

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervisory_plan_origin_provenance_chk') THEN
    ALTER TABLE public.supervisory_plan ADD CONSTRAINT supervisory_plan_origin_provenance_chk
      CHECK (origin_provenance IN ('GOVERNED','BACKFILL_DETERMINISTIC','LEGACY_MIGRATED'));
  END IF;
END $do$;

ALTER TABLE public.supervisory_plan_item
  ADD COLUMN IF NOT EXISTS legacy_action_id uuid REFERENCES public.legacy_supervisory_plan_actions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS supervisory_plan_item_legacy_action_id_key
  ON public.supervisory_plan_item(legacy_action_id) WHERE legacy_action_id IS NOT NULL;

COMMENT ON COLUMN public.supervisory_plan.legacy_plan_id IS
  'Deterministic 1:1 link to the retired public.legacy_supervisory_plans row this canonical plan represents. NULL for natively governed plans.';
COMMENT ON COLUMN public.supervisory_plan_item.legacy_action_id IS
  'Deterministic 1:1 link to the retired public.legacy_supervisory_plan_actions row this canonical item represents.';

-- 2. Deterministic, idempotent convergence backfill ---------------------
INSERT INTO public.supervisory_plan (
  reference, title, objective, objective_source, factual_basis, domain_code,
  entity_ids, sector_ids, planning_period, status,
  submitted_by, submitted_at, approved_by, approved_at,
  created_by, created_at, updated_at, legacy_plan_id, origin_provenance)
SELECT
  'SP-LEG-' || upper(left(replace(lp.id::text,'-',''),10)),
  'Legacy supervisory plan (' || lp.created_from || ')',
  'Continuation of the legacy supervisory plan migrated into the canonical enterprise planning model during Epic 2 convergence.',
  'human',
  'Migrated from legacy supervisory plan ' || lp.id::text
    || ' (created_from=' || lp.created_from || ', legacy status=' || lp.status
    || ', legacy approval_status=' || lp.approval_status || '). Original notes: '
    || COALESCE(nullif(btrim(lp.notes),''), 'none recorded'),
  'CROSS_DOMAIN',
  ARRAY[lp.entity_id],
  CASE WHEN l.sector_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[l.sector_id] END,
  'ad_hoc',
  CASE
    WHEN lp.approval_status = 'approved' AND lp.status = 'active' THEN 'ACTIVE'
    WHEN lp.approval_status = 'approved' THEN 'APPROVED'
    WHEN lp.approval_status = 'pending_review' THEN 'SUBMITTED'
    ELSE 'DRAFT'
  END,
  lp.submitted_for_review_by, lp.submitted_for_review_at,
  lp.approved_by, lp.approved_at,
  lp.created_by, lp.created_at, lp.updated_at,
  lp.id, 'LEGACY_MIGRATED'
FROM public.legacy_supervisory_plans lp
LEFT JOIN public.licensees l ON l.id = lp.entity_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.supervisory_plan sp WHERE sp.legacy_plan_id = lp.id);

INSERT INTO public.supervisory_plan_item (
  plan_id, title, detail, item_type, due_date, status,
  completed_at, completed_by, source, created_at, updated_at, legacy_action_id)
SELECT
  sp.id, la.title,
  COALESCE(la.description,'') ||
    CASE WHEN la.owner_role IS NULL THEN '' ELSE E'\n[legacy owner role] ' || la.owner_role END,
  'MILESTONE',
  la.due_date,
  CASE WHEN la.status = 'completed' THEN 'COMPLETED'
       WHEN la.status = 'cancelled' THEN 'CANCELLED'
       ELSE 'OPEN' END,
  la.completed_at, la.completed_by,
  'LEGACY_MIGRATION', la.created_at, la.updated_at, la.id
FROM public.legacy_supervisory_plan_actions la
JOIN public.supervisory_plan sp ON sp.legacy_plan_id = la.plan_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.supervisory_plan_item i WHERE i.legacy_action_id = la.id);

INSERT INTO public.supervisory_plan_event (plan_id, event_type, to_status, rationale, detail, actor_id)
SELECT sp.id, 'LEGACY_MIGRATED', sp.status,
  'Deterministic Epic 2 convergence of legacy supervisory plan ' || sp.legacy_plan_id::text,
  jsonb_build_object('legacy_plan_id', sp.legacy_plan_id, 'origin_provenance', 'LEGACY_MIGRATED'),
  NULL
FROM public.supervisory_plan sp
WHERE sp.legacy_plan_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.supervisory_plan_event e
    WHERE e.plan_id = sp.id AND e.event_type = 'LEGACY_MIGRATED');

-- 3. Governed legacy operations must address the base tables, not views --
DO $do$
DECLARE r record; def text; newdef text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'supervisory_plan_decision','supervisory_plan_action_transition',
        'conduct_attention_assign','conduct_attention_create','conduct_attention_priority_compute',
        'conduct_attention_priority_confirm','conduct_attention_reassess','conduct_attention_transition',
        'conduct_intervention_decide','conduct_intervention_initiate','conduct_intervention_link_canonical',
        'conduct_intervention_propose','conduct_intervention_record_followup','conduct_intervention_record_outcome',
        'conduct_intervention_transition','conduct_plan_create','conduct_plan_transition','conduct_plan_update')
  LOOP
    def := pg_get_functiondef(r.oid);
    newdef := def;
    newdef := replace(newdef,'public.supervisory_plan_actions','public.legacy_supervisory_plan_actions');
    newdef := replace(newdef,'public.supervisory_plans','public.legacy_supervisory_plans');
    newdef := replace(newdef,'public.conduct_attention_priority_calcs','public.supervisory_attention_priority_calc');
    newdef := replace(newdef,'public.conduct_attention_reassessments','public.supervisory_attention_reassessment');
    newdef := replace(newdef,'public.conduct_attention_events','public.supervisory_attention_event');
    newdef := replace(newdef,'public.conduct_attention_items','public.supervisory_attention');
    newdef := replace(newdef,'public.conduct_intervention_events','public.supervisory_intervention_event');
    newdef := replace(newdef,'public.conduct_intervention_types','public.supervisory_intervention_type');
    newdef := replace(newdef,'public.conduct_interventions','public.supervisory_intervention');
    newdef := replace(newdef,'public.conduct_supervisory_plans','public.supervisory_plan');
    IF newdef <> def THEN EXECUTE newdef; END IF;
  END LOOP;
END $do$;

-- 4. Compatibility views are read-only ---------------------------------
CREATE OR REPLACE FUNCTION public.compat_view_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  RAISE EXCEPTION 'compatibility_view_read_only: %.% is a read-only compatibility view; use the governed supervisory spine operations',
    TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = '42501';
END $fn$;

DO $do$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['supervisory_plans','supervisory_plan_actions',
    'conduct_attention_items','conduct_attention_events','conduct_attention_priority_calcs',
    'conduct_attention_reassessments','conduct_interventions','conduct_intervention_events',
    'conduct_intervention_types','conduct_supervisory_plans']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=v) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v||'_readonly_ins', v);
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v||'_readonly_upd', v);
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v||'_readonly_del', v);
      EXECUTE format('CREATE TRIGGER %I INSTEAD OF INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.compat_view_write_guard()', v||'_readonly_ins', v);
      EXECUTE format('CREATE TRIGGER %I INSTEAD OF UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.compat_view_write_guard()', v||'_readonly_upd', v);
      EXECUTE format('CREATE TRIGGER %I INSTEAD OF DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.compat_view_write_guard()', v||'_readonly_del', v);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', v);
    END IF;
  END LOOP;
END $do$;

-- 5. Retired legacy planning tables accept no new work ------------------
CREATE OR REPLACE FUNCTION public.legacy_supervisory_plan_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  RAISE EXCEPTION 'legacy_path_retired: new supervisory planning work must be created through the canonical supervisory spine (public.supervisory_plan_open / supervisory_plan_item_save)'
    USING ERRCODE = '42501';
END $fn$;

DROP TRIGGER IF EXISTS legacy_supervisory_plans_write_guard_trg ON public.legacy_supervisory_plans;
CREATE TRIGGER legacy_supervisory_plans_write_guard_trg
  BEFORE INSERT ON public.legacy_supervisory_plans
  FOR EACH ROW EXECUTE FUNCTION public.legacy_supervisory_plan_write_guard();

DROP TRIGGER IF EXISTS legacy_supervisory_plan_actions_write_guard_trg ON public.legacy_supervisory_plan_actions;
CREATE TRIGGER legacy_supervisory_plan_actions_write_guard_trg
  BEFORE INSERT ON public.legacy_supervisory_plan_actions
  FOR EACH ROW EXECUTE FUNCTION public.legacy_supervisory_plan_write_guard();

-- 6. LEGACY_UNKNOWN provenance is historical-only ----------------------
CREATE OR REPLACE FUNCTION public.examination_provenance_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.origin_provenance = 'LEGACY_UNKNOWN' THEN
    RAISE EXCEPTION 'provenance_required: LEGACY_UNKNOWN is reserved for historical examinations; new examinations must record GOVERNED provenance'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS examination_provenance_guard_trg ON public.examinations;
CREATE TRIGGER examination_provenance_guard_trg
  BEFORE INSERT ON public.examinations
  FOR EACH ROW EXECUTE FUNCTION public.examination_provenance_guard();

REVOKE ALL ON FUNCTION public.compat_view_write_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.legacy_supervisory_plan_write_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.examination_provenance_guard() FROM PUBLIC;