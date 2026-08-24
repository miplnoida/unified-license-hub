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
  -- a same-instant handover is legitimate: only a genuinely earlier end is invalid
  IF NEW.effective_to IS NOT NULL AND NEW.effective_from IS NOT NULL
     AND NEW.effective_to < NEW.effective_from THEN
    RAISE EXCEPTION 'effective_to cannot precede effective_from';
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

  IF NOT public.has_permission(_actor, 'licensee_management', 'assign_supervision') THEN
    RAISE EXCEPTION 'not authorised to manage entity supervision assignments';
  END IF;

  IF NOT public.is_super_admin(_actor) THEN
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

  IF _effective_to IS NOT NULL AND _effective_to < COALESCE(_effective_from, now()) THEN
    RAISE EXCEPTION 'effective_to cannot precede effective_from';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.esa_assert_assignment_authority(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.esa_assert_assignment_authority(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz) TO service_role;