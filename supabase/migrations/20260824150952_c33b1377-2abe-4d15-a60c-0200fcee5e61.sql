-- ============================================================
-- REGULATORY OPERATING STRUCTURE — PHASE 2 · CANONICAL ENTITY SUPERVISION
-- ============================================================

-- ---------- 1. assignment-management permission ----------
INSERT INTO public.sec_permissions (module_id, key, label, description)
SELECT m.id, 'assign_supervision', 'Assign entity supervision',
       'Create, transfer and end canonical entity supervision assignments.'
FROM public.sec_modules m
WHERE m.key = 'licensee_management'
  AND NOT EXISTS (
    SELECT 1 FROM public.sec_permissions p
    WHERE p.module_id = m.id AND p.key = 'assign_supervision');

-- ---------- 2. canonical columns (additive only) ----------
ALTER TABLE public.entity_supervision_assignments
  ADD COLUMN IF NOT EXISTS regulator_id uuid REFERENCES public.regulators(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.regulatory_teams(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lead_supervisor_user_id uuid,
  ADD COLUMN IF NOT EXISTS alternate_supervisor_user_id uuid,
  ADD COLUMN IF NOT EXISTS assignment_reason text,
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS previous_assignment_id uuid REFERENCES public.entity_supervision_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_reason text,
  ADD COLUMN IF NOT EXISTS requires_admin_review boolean NOT NULL DEFAULT false;

-- one current primary owner per entity + regulatory function
CREATE UNIQUE INDEX IF NOT EXISTS esa_one_active_primary_per_function
  ON public.entity_supervision_assignments (entity_id, regulatory_function_id)
  WHERE status = 'active' AND is_primary AND effective_to IS NULL
    AND regulatory_function_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_esa_canonical_lookup
  ON public.entity_supervision_assignments (entity_id, regulatory_function_id, status);
CREATE INDEX IF NOT EXISTS idx_esa_lead
  ON public.entity_supervision_assignments (lead_supervisor_user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_esa_alternate
  ON public.entity_supervision_assignments (alternate_supervisor_user_id) WHERE status = 'active';

-- ---------- 3. row-level integrity ----------
CREATE OR REPLACE FUNCTION public.regulatory_validate_entity_supervision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t record;
BEGIN
  IF NEW.lead_supervisor_user_id IS NOT NULL
     AND NEW.lead_supervisor_user_id = NEW.alternate_supervisor_user_id THEN
    RAISE EXCEPTION 'lead and alternate supervisor must be different users';
  END IF;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to <= NEW.effective_from THEN
    RAISE EXCEPTION 'effective_to must be after effective_from';
  END IF;
  IF NEW.team_id IS NOT NULL THEN
    SELECT regulator_id, regulatory_function_id INTO t
      FROM public.regulatory_teams WHERE id = NEW.team_id;
    IF NEW.regulator_id IS NOT NULL AND t.regulator_id <> NEW.regulator_id THEN
      RAISE EXCEPTION 'team belongs to a different regulator';
    END IF;
    IF t.regulatory_function_id IS NOT NULL AND NEW.regulatory_function_id IS NOT NULL
       AND t.regulatory_function_id <> NEW.regulatory_function_id THEN
      RAISE EXCEPTION 'team regulatory function does not match the assignment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_esa_validate ON public.entity_supervision_assignments;
CREATE TRIGGER trg_esa_validate BEFORE INSERT OR UPDATE ON public.entity_supervision_assignments
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_validate_entity_supervision();

-- ---------- 4. deterministic backfill only ----------
-- supervisor_id is, by current semantics, the single responsible supervisor of
-- the entity: that maps deterministically to lead_supervisor_user_id.
UPDATE public.entity_supervision_assignments
   SET lead_supervisor_user_id = supervisor_id
 WHERE lead_supervisor_user_id IS NULL AND supervisor_id IS NOT NULL;

-- regulator is derivable from the entity's canonical sector.
UPDATE public.entity_supervision_assignments esa
   SET regulator_id = NULLIF(public.entity_regulatory_scope(esa.entity_id) ->> 'regulator_id','')::uuid
 WHERE esa.regulator_id IS NULL;

-- free-text team maps to a canonical team ONLY when exactly one team proves out.
UPDATE public.entity_supervision_assignments esa
   SET team_id = t.id,
       regulatory_function_id = COALESCE(esa.regulatory_function_id, t.regulatory_function_id)
  FROM public.regulatory_teams t
 WHERE esa.team_id IS NULL
   AND esa.team IS NOT NULL
   AND lower(btrim(t.code)) = lower(btrim(esa.team))
   AND (esa.regulator_id IS NULL OR t.regulator_id = esa.regulator_id)
   AND (SELECT count(*) FROM public.regulatory_teams t2
         WHERE lower(btrim(t2.code)) = lower(btrim(esa.team))
           AND (esa.regulator_id IS NULL OR t2.regulator_id = esa.regulator_id)) = 1;

-- anything not deterministically resolvable is recorded, never invented.
UPDATE public.entity_supervision_assignments
   SET requires_admin_review = true
 WHERE status = 'active'
   AND (regulatory_function_id IS NULL
        OR (team IS NOT NULL AND team_id IS NULL)
        OR regulator_id IS NULL);

-- ---------- 5. governed assignment routines ----------
CREATE OR REPLACE FUNCTION public.esa_assert_assignment_authority(
  _actor uuid, _entity_id uuid, _regulator_id uuid, _function_id uuid,
  _team_id uuid, _lead uuid, _alternate uuid,
  _effective_from timestamptz, _effective_to timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn record;
  scope jsonb;
  t record;
  ent_sector uuid;
  ent_sub uuid;
  ent_regulator uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  -- dedicated assignment-management permission (edit permission is NOT enough)
  IF NOT public.has_permission(_actor, 'licensee_management', 'assign_supervision') THEN
    RAISE EXCEPTION 'not authorised to manage entity supervision assignments';
  END IF;

  IF NOT public.is_super_admin(_actor) THEN
    -- the actor's own regulatory authority must cover this entity
    IF NOT public.regulatory_scope_allows(_actor, 'licensee_management', 'assign_supervision',
             NULL, NULL, NULL, _entity_id, NULL) THEN
      RAISE EXCEPTION 'entity is outside your regulatory authority';
    END IF;
  END IF;

  IF _entity_id IS NULL THEN RAISE EXCEPTION 'entity_id is required'; END IF;
  scope := public.entity_regulatory_scope(_entity_id);
  IF scope IS NULL THEN RAISE EXCEPTION 'unknown entity'; END IF;
  ent_sector := NULLIF(scope ->> 'sector_id','')::uuid;
  ent_sub := NULLIF(scope ->> 'sub_sector_id','')::uuid;
  ent_regulator := NULLIF(scope ->> 'regulator_id','')::uuid;

  IF _regulator_id IS NULL THEN RAISE EXCEPTION 'regulator_id is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulators r
                  WHERE r.id = _regulator_id AND r.status = 'active') THEN
    RAISE EXCEPTION 'regulator does not exist or is inactive';
  END IF;
  IF ent_regulator IS NOT NULL AND ent_regulator <> _regulator_id THEN
    RAISE EXCEPTION 'regulator does not match the entity''s canonical regulator';
  END IF;

  IF _function_id IS NULL THEN RAISE EXCEPTION 'regulatory_function_id is required'; END IF;
  SELECT * INTO fn FROM public.regulatory_functions
   WHERE id = _function_id AND status = 'active';
  IF fn IS NULL THEN RAISE EXCEPTION 'regulatory function does not exist or is inactive'; END IF;

  -- mandate coverage, when the regulator/function mandate set is activated
  IF NOT public.regulator_mandate_supports(_regulator_id, _function_id, ent_sector, ent_sub) THEN
    RAISE EXCEPTION 'no active mandate covers this regulator/function/sector combination';
  END IF;

  IF _team_id IS NOT NULL THEN
    SELECT * INTO t FROM public.regulatory_teams WHERE id = _team_id;
    IF t IS NULL OR t.status <> 'active'
       OR t.effective_from > now()
       OR (t.effective_to IS NOT NULL AND t.effective_to <= now()) THEN
      RAISE EXCEPTION 'team is not an active, in-date team';
    END IF;
    IF t.regulator_id <> _regulator_id THEN
      RAISE EXCEPTION 'team belongs to a different regulator';
    END IF;
    IF t.regulatory_function_id IS NOT NULL AND t.regulatory_function_id <> _function_id THEN
      RAISE EXCEPTION 'team belongs to a different regulatory function';
    END IF;
    -- the team's mandate must cover the entity once enforcement is active
    IF public.regulator_mandate_enforcement_active(_regulator_id, _function_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.regulatory_team_mandates rtm
         JOIN public.regulator_mandates m ON m.id = rtm.regulator_mandate_id
         WHERE rtm.team_id = _team_id
           AND m.status = 'active'
           AND m.regulatory_function_id = _function_id
           AND m.effective_from <= now()
           AND (m.effective_to IS NULL OR m.effective_to > now())
           AND (m.sector_id IS NULL OR (ent_sector IS NOT NULL AND m.sector_id = ent_sector))
           AND (m.sub_sector_id IS NULL OR (ent_sub IS NOT NULL AND m.sub_sector_id = ent_sub))
       ) THEN
      RAISE EXCEPTION 'team mandate does not cover this entity';
    END IF;
  END IF;

  IF _lead IS NULL THEN RAISE EXCEPTION 'lead_supervisor_user_id is required'; END IF;
  IF _lead = _alternate THEN RAISE EXCEPTION 'lead and alternate supervisor must differ'; END IF;

  -- lead/alternate must be active staff holding the function's canonical permission
  IF EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = _lead AND COALESCE(p.status,'active') <> 'active') THEN
    RAISE EXCEPTION 'lead supervisor is not an active staff member';
  END IF;
  IF fn.module_key IS NOT NULL AND NOT public.has_permission(_lead, fn.module_key, 'view') THEN
    RAISE EXCEPTION 'lead supervisor lacks the required permission for this regulatory function';
  END IF;
  IF fn.module_key IS NOT NULL AND NOT public.staff_portfolio_allows(
       _lead, _regulator_id, _function_id, ent_sector, ent_sub, _entity_id) THEN
    RAISE EXCEPTION 'lead supervisor portfolio does not cover this entity';
  END IF;

  IF _alternate IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = _alternate AND COALESCE(p.status,'active') <> 'active') THEN
      RAISE EXCEPTION 'alternate supervisor is not an active staff member';
    END IF;
    IF fn.module_key IS NOT NULL AND NOT public.has_permission(_alternate, fn.module_key, 'view') THEN
      RAISE EXCEPTION 'alternate supervisor lacks the required permission for this regulatory function';
    END IF;
    IF fn.module_key IS NOT NULL AND NOT public.staff_portfolio_allows(
         _alternate, _regulator_id, _function_id, ent_sector, ent_sub, _entity_id) THEN
      RAISE EXCEPTION 'alternate supervisor portfolio does not cover this entity';
    END IF;
  END IF;

  IF _effective_to IS NOT NULL AND _effective_to <= COALESCE(_effective_from, now()) THEN
    RAISE EXCEPTION 'effective_to must be after effective_from';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.esa_assert_assignment_authority(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.esa_assert_assignment_authority(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_entity_supervision(
  _entity_id uuid, _regulator_id uuid, _regulatory_function_id uuid,
  _team_id uuid DEFAULT NULL, _lead_supervisor_user_id uuid DEFAULT NULL,
  _alternate_supervisor_user_id uuid DEFAULT NULL, _assignment_reason text DEFAULT NULL,
  _effective_from timestamptz DEFAULT now(), _effective_to timestamptz DEFAULT NULL,
  _supervisory_cycle text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  new_id uuid;
  lead_name text;
  team_code text;
BEGIN
  PERFORM public.esa_assert_assignment_authority(actor, _entity_id, _regulator_id,
    _regulatory_function_id, _team_id, _lead_supervisor_user_id,
    _alternate_supervisor_user_id, _effective_from, _effective_to);

  IF EXISTS (
    SELECT 1 FROM public.entity_supervision_assignments a
    WHERE a.entity_id = _entity_id
      AND a.regulatory_function_id = _regulatory_function_id
      AND a.status = 'active' AND a.is_primary AND a.effective_to IS NULL
  ) THEN
    RAISE EXCEPTION 'this entity already has a current primary assignment for that regulatory function; use transfer_entity_supervision';
  END IF;

  SELECT full_name INTO lead_name FROM public.profiles WHERE id = _lead_supervisor_user_id;
  SELECT code INTO team_code FROM public.regulatory_teams WHERE id = _team_id;

  INSERT INTO public.entity_supervision_assignments (
    entity_id, regulator_id, regulatory_function_id, team_id,
    lead_supervisor_user_id, alternate_supervisor_user_id,
    supervisor_id, supervisor_name, team, supervisory_cycle,
    assignment_reason, assigned_by, status, is_primary,
    effective_from, effective_to, notes, requires_admin_review)
  VALUES (
    _entity_id, _regulator_id, _regulatory_function_id, _team_id,
    _lead_supervisor_user_id, _alternate_supervisor_user_id,
    _lead_supervisor_user_id, lead_name, team_code, _supervisory_cycle,
    _assignment_reason, actor, 'active', true,
    COALESCE(_effective_from, now()), _effective_to, _notes, false)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_entity_supervision(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_entity_supervision(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.transfer_entity_supervision(
  _assignment_id uuid, _team_id uuid DEFAULT NULL,
  _lead_supervisor_user_id uuid DEFAULT NULL, _alternate_supervisor_user_id uuid DEFAULT NULL,
  _transfer_reason text DEFAULT NULL, _effective_from timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  cur public.entity_supervision_assignments;
  new_id uuid;
  lead_name text;
  team_code text;
BEGIN
  SELECT * INTO cur FROM public.entity_supervision_assignments WHERE id = _assignment_id;
  IF cur IS NULL THEN RAISE EXCEPTION 'assignment not found'; END IF;
  IF cur.status <> 'active' THEN RAISE EXCEPTION 'only an active assignment can be transferred'; END IF;

  PERFORM public.esa_assert_assignment_authority(actor, cur.entity_id, cur.regulator_id,
    cur.regulatory_function_id, COALESCE(_team_id, cur.team_id),
    COALESCE(_lead_supervisor_user_id, cur.lead_supervisor_user_id),
    _alternate_supervisor_user_id, _effective_from, NULL);

  -- history preserved: close the current row, never overwrite it
  UPDATE public.entity_supervision_assignments
     SET status = 'closed',
         is_primary = false,
         effective_to = COALESCE(_effective_from, now()),
         closure_reason = COALESCE(_transfer_reason, 'transferred'),
         updated_at = now()
   WHERE id = cur.id;

  SELECT full_name INTO lead_name FROM public.profiles
   WHERE id = COALESCE(_lead_supervisor_user_id, cur.lead_supervisor_user_id);
  SELECT code INTO team_code FROM public.regulatory_teams
   WHERE id = COALESCE(_team_id, cur.team_id);

  INSERT INTO public.entity_supervision_assignments (
    entity_id, regulator_id, regulatory_function_id, team_id,
    lead_supervisor_user_id, alternate_supervisor_user_id,
    supervisor_id, supervisor_name, team, supervisory_cycle,
    assignment_reason, assigned_by, status, is_primary,
    effective_from, notes, previous_assignment_id, requires_admin_review)
  VALUES (
    cur.entity_id, cur.regulator_id, cur.regulatory_function_id,
    COALESCE(_team_id, cur.team_id),
    COALESCE(_lead_supervisor_user_id, cur.lead_supervisor_user_id),
    _alternate_supervisor_user_id,
    COALESCE(_lead_supervisor_user_id, cur.lead_supervisor_user_id), lead_name,
    team_code, cur.supervisory_cycle,
    COALESCE(_transfer_reason, 'transferred'), actor, 'active', true,
    COALESCE(_effective_from, now()), cur.notes, cur.id, false)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_entity_supervision(uuid,uuid,uuid,uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_entity_supervision(uuid,uuid,uuid,uuid,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.end_entity_supervision_assignment(
  _assignment_id uuid, _closure_reason text, _effective_to timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  cur public.entity_supervision_assignments;
BEGIN
  SELECT * INTO cur FROM public.entity_supervision_assignments WHERE id = _assignment_id;
  IF cur IS NULL THEN RAISE EXCEPTION 'assignment not found'; END IF;

  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_permission(actor, 'licensee_management', 'assign_supervision') THEN
    RAISE EXCEPTION 'not authorised to manage entity supervision assignments';
  END IF;
  IF NOT public.is_super_admin(actor)
     AND NOT public.regulatory_scope_allows(actor, 'licensee_management', 'assign_supervision',
             NULL, NULL, NULL, cur.entity_id, NULL) THEN
    RAISE EXCEPTION 'entity is outside your regulatory authority';
  END IF;
  IF _closure_reason IS NULL OR btrim(_closure_reason) = '' THEN
    RAISE EXCEPTION 'a closure reason is required';
  END IF;

  -- ending never deletes: the row is retained as history
  UPDATE public.entity_supervision_assignments
     SET status = 'closed',
         is_primary = false,
         effective_to = COALESCE(_effective_to, now()),
         closure_reason = _closure_reason,
         updated_at = now()
   WHERE id = cur.id;

  RETURN cur.id;
END;
$$;
REVOKE ALL ON FUNCTION public.end_entity_supervision_assignment(uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_entity_supervision_assignment(uuid,text,timestamptz) TO authenticated, service_role;

-- ---------- 6. assignment predicate: canonical + legacy fallback ----------
CREATE OR REPLACE FUNCTION public.user_has_entity_assignment(_user_id uuid, _licensee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _licensee_id IS NOT NULL AND (
    -- canonical, function-specific supervision assignment
    EXISTS (
      SELECT 1 FROM public.entity_supervision_assignments a
      WHERE a.entity_id = _licensee_id
        AND a.status = 'active'
        AND a.effective_from <= now()
        AND (a.effective_to IS NULL OR a.effective_to > now())
        AND (a.lead_supervisor_user_id = _user_id
             OR a.alternate_supervisor_user_id = _user_id
             OR a.supervisor_id = _user_id)
    )
    -- legacy certified behaviour for unmigrated rows
    OR EXISTS (
      SELECT 1 FROM public.licensees l
      WHERE l.id = _licensee_id
        AND (l.lead_regulator_id = _user_id
             OR l.regulator_officer_id = _user_id
             OR l.alternate_regulator_id = _user_id)
    )
  );
$$;

-- ---------- 7. direct canonical DML cutover ----------
-- No frontend or edge caller writes this table directly (all reads go through
-- governed read models), so writes move to the governed routines now.
DROP POLICY IF EXISTS esa_write ON public.entity_supervision_assignments;
REVOKE INSERT, UPDATE, DELETE ON public.entity_supervision_assignments FROM authenticated;
GRANT SELECT ON public.entity_supervision_assignments TO authenticated;
GRANT ALL ON public.entity_supervision_assignments TO service_role;