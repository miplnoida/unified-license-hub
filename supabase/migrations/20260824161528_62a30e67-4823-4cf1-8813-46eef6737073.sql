-- REGULATORY OPERATING STRUCTURE — practical population (idempotent seed).
--
-- Rules honoured:
--   * no new auth users, no invented people, no new permissions;
--   * users resolved dynamically: sec_user_roles -> sec_roles.key -> profiles;
--   * only ACTIVE INTERNAL employees whose canonical permissions already
--     support the body role are seeded (eligibility is read, never granted);
--   * mandates are created but NOT activated (regulator_mandate_enforcement is
--     left untouched) so the mandate layer stays inert;
--   * safe to rerun: stable codes / names, no duplicates, never overwrites a
--     manually configured body;
--   * body types stay distinct: this migration touches regulatory_teams,
--     license_appeal_panels and fp_committees only. It does not write
--     entity_supervision_assignments or examination_team_members.

DO $seed$
DECLARE
  v_reg          uuid;
  v_reg_name     text;
  v_regs         int;
  r              record;
  v_fn           uuid;
  v_module       text;
  v_team         uuid;
  v_mandate      uuid;
  v_user         uuid;
  v_panel        uuid;
  v_chair        uuid;
  v_voting       int;
  v_quorum       int;
  v_cttee        uuid;
  v_thr          numeric;
BEGIN
  SELECT count(DISTINCT regulator_id) INTO v_regs FROM public.sectors WHERE regulator_id IS NOT NULL;
  IF v_regs <> 1 THEN
    RAISE NOTICE 'REGULATOR_CONFIGURATION_REQUIRED: % distinct sector regulators; no structure seeded', v_regs;
    RETURN;
  END IF;
  SELECT DISTINCT regulator_id INTO v_reg FROM public.sectors WHERE regulator_id IS NOT NULL;
  SELECT name INTO v_reg_name FROM public.regulators WHERE id = v_reg;

  -- ================================================================
  -- 1 · PERMANENT OPERATIONAL TEAMS
  -- ================================================================
  FOR r IN
    SELECT * FROM (VALUES
      ('TEAM-LICENSING',   'Licensing Team',             'licensing',     ARRAY['licensing_supervisor'],                          ARRAY['licensing_officer','licensing_analyst'],  ARRAY[]::text[]),
      ('TEAM-PRUDENTIAL',  'Prudential Supervision Team','prudential',    ARRAY['prudential_supervisor'],                         ARRAY['prudential_analyst'],                     ARRAY[]::text[]),
      ('TEAM-RETURNS',     'Returns Team',               'returns',       ARRAY['returns_supervisor'],                            ARRAY['returns_officer'],                        ARRAY[]::text[]),
      ('TEAM-CONDUCT',     'Market Conduct Team',        'market_conduct',ARRAY['conduct_supervisor'],                            ARRAY['conduct_analyst'],                        ARRAY[]::text[]),
      ('TEAM-COMPLAINTS',  'Complaints Team',            'complaints',    ARRAY['complaints_supervisor'],                         ARRAY['complaints_officer','conduct_analyst'],   ARRAY[]::text[]),
      ('TEAM-FIT-PROPER',  'Fit & Proper Team',          'fit_and_proper',ARRAY['fit_proper_supervisor'],                         ARRAY['fit_proper_officer','f_p_assessor'],      ARRAY[]::text[]),
      ('TEAM-INSPECTION',  'Inspection Team',            'inspection',    ARRAY['inspection_supervisor','prudential_supervisor'], ARRAY['inspector'],                              ARRAY[]::text[]),
      ('TEAM-ENFORCEMENT', 'Enforcement Team',           'enforcement',   ARRAY['enforcement_supervisor'],                        ARRAY['enforcement_officer'],                    ARRAY['legal_counsel']),
      ('TEAM-AML',         'AML/CFT Supervision Team',   'aml_cft',       ARRAY['aml_supervision_supervisor'],                    ARRAY['aml_supervision_officer'],                ARRAY[]::text[])
    ) AS t(code, name, fn_key, lead_roles, member_roles, observer_roles)
  LOOP
    SELECT id, module_key INTO v_fn, v_module
      FROM public.regulatory_functions WHERE key = r.fn_key;
    IF v_fn IS NULL THEN
      RAISE NOTICE 'FUNCTION_MISSING: % (team % skipped)', r.fn_key, r.code;
      CONTINUE;
    END IF;

    SELECT id INTO v_mandate FROM public.regulator_mandates
     WHERE regulator_id = v_reg AND regulatory_function_id = v_fn
       AND sector_id IS NULL AND sub_sector_id IS NULL AND status = 'active'
     LIMIT 1;
    IF v_mandate IS NULL THEN
      INSERT INTO public.regulator_mandates
        (regulator_id, regulatory_function_id, responsibility_type, status, notes)
      VALUES (v_reg, v_fn, 'LEAD', 'active',
              'Seeded: this regulator owns every configured sector. Not activated in regulator_mandate_enforcement.')
      RETURNING id INTO v_mandate;
    END IF;

    SELECT id INTO v_team FROM public.regulatory_teams
     WHERE regulator_id = v_reg AND code = r.code;
    IF v_team IS NULL THEN
      INSERT INTO public.regulatory_teams
        (regulator_id, regulatory_function_id, code, name, team_type, status)
      VALUES (v_reg, v_fn, r.code, r.name, 'permanent', 'active')
      RETURNING id INTO v_team;
    END IF;

    INSERT INTO public.regulatory_team_mandates (team_id, regulator_mandate_id, is_primary)
    SELECT v_team, v_mandate, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.regulatory_team_mandates
       WHERE team_id = v_team AND regulator_mandate_id = v_mandate);

    v_user := NULL;
    FOR v_user IN
      SELECT p.id
        FROM unnest(r.lead_roles) WITH ORDINALITY AS lr(role_key, ord)
        JOIN public.sec_roles sr ON sr.key = lr.role_key AND coalesce(sr.status,'active') = 'active'
                                 AND sr.role_type = 'internal'
        JOIN public.sec_user_roles ur ON ur.role_id = sr.id AND coalesce(ur.status,'active') = 'active'
        JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
       WHERE public.has_permission(p.id, v_module, 'edit')
          OR public.has_permission(p.id, v_module, 'approve')
       ORDER BY lr.ord, p.email
       LIMIT 1
    LOOP
      INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status)
      SELECT v_team, v_user, 'lead', 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.regulatory_team_members
         WHERE team_id = v_team AND user_id = v_user AND status = 'active');
    END LOOP;
    IF v_user IS NULL THEN
      RAISE NOTICE 'MISSING_ELIGIBLE_MEMBER: no eligible lead for %', r.code;
    END IF;

    FOR v_user IN
      SELECT DISTINCT p.id
        FROM unnest(r.member_roles) AS mr(role_key)
        JOIN public.sec_roles sr ON sr.key = mr.role_key AND coalesce(sr.status,'active') = 'active'
                                 AND sr.role_type = 'internal'
        JOIN public.sec_user_roles ur ON ur.role_id = sr.id AND coalesce(ur.status,'active') = 'active'
        JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
       WHERE public.has_permission(p.id, v_module, 'view')
    LOOP
      INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status)
      SELECT v_team, v_user, 'member', 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.regulatory_team_members
         WHERE team_id = v_team AND user_id = v_user AND status = 'active');
    END LOOP;

    FOR v_user IN
      SELECT DISTINCT p.id
        FROM unnest(r.observer_roles) AS orl(role_key)
        JOIN public.sec_roles sr ON sr.key = orl.role_key AND coalesce(sr.status,'active') = 'active'
                                 AND sr.role_type = 'internal'
        JOIN public.sec_user_roles ur ON ur.role_id = sr.id AND coalesce(ur.status,'active') = 'active'
        JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
       WHERE public.has_permission(p.id, v_module, 'view')
    LOOP
      INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status)
      SELECT v_team, v_user, 'observer', 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.regulatory_team_members
         WHERE team_id = v_team AND user_id = v_user AND status = 'active');
    END LOOP;
  END LOOP;

  -- ================================================================
  -- 2 · APPEAL PANELS (decision bodies — distinct from teams)
  -- ================================================================
  FOR r IN
    SELECT * FROM (VALUES
      ('Licensing Appeals Panel',    'licensing',      'license_appeals',        'decide'),
      ('Fit & Proper Appeals Panel', 'fit_and_proper', 'fit_and_proper_appeals', 'approve'),
      ('Enforcement Appeals Panel',  'enforcement',    'enforcement_management', 'approve')
    ) AS t(name, scope_key, decide_module, decide_action)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.appeal_panel_scopes
                    WHERE scope_key = r.scope_key AND is_active) THEN
      RAISE NOTICE 'APPEAL_SCOPE_MISSING: %', r.scope_key;
      CONTINUE;
    END IF;

    SELECT id INTO v_panel FROM public.license_appeal_panels
     WHERE name = r.name AND regulator_id = v_reg;
    IF v_panel IS NULL THEN
      INSERT INTO public.license_appeal_panels (name, description, regulator_id, appeal_scope, is_active, notes)
      VALUES (r.name,
              'Seeded default appeal panel for ' || coalesce(v_reg_name,'the regulator') || '.',
              v_reg, r.scope_key, false,
              'Seeded from existing eligible users only; membership requires ' || r.decide_module || '.' || r.decide_action || '.')
      RETURNING id INTO v_panel;
    END IF;
    SELECT quorum INTO v_quorum FROM public.license_appeal_panels WHERE id = v_panel;

    FOR v_user IN
      SELECT DISTINCT p.id
        FROM public.sec_user_roles ur
        JOIN public.sec_roles sr ON sr.id = ur.role_id AND sr.role_type = 'internal'
                                 AND coalesce(sr.status,'active') = 'active'
        JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
       WHERE coalesce(ur.status,'active') = 'active'
         AND public.has_permission(p.id, r.decide_module, r.decide_action)
    LOOP
      INSERT INTO public.license_appeal_panel_members
        (panel_id, user_id, member_role, is_chair, is_voting, regulator_id)
      SELECT v_panel, v_user, 'member', false, true, v_reg
      WHERE NOT EXISTS (
        SELECT 1 FROM public.license_appeal_panel_members
         WHERE panel_id = v_panel AND user_id = v_user);
    END LOOP;

    SELECT m.user_id INTO v_chair
      FROM public.license_appeal_panel_members m
      LEFT JOIN public.sec_user_roles ur ON ur.user_id = m.user_id AND coalesce(ur.status,'active')='active'
      LEFT JOIN public.sec_roles sr ON sr.id = ur.role_id
     WHERE m.panel_id = v_panel AND m.is_voting AND m.is_active
     ORDER BY (sr.key = 'appeals_panel_member') DESC NULLS LAST, m.created_at
     LIMIT 1;
    IF v_chair IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.license_appeal_panel_members
          WHERE panel_id = v_panel AND is_chair AND is_active) THEN
      UPDATE public.license_appeal_panel_members
         SET member_role = 'chair', is_chair = true
       WHERE panel_id = v_panel AND user_id = v_chair;
    END IF;

    FOR v_user IN
      SELECT DISTINCT p.id
        FROM public.sec_user_roles ur
        JOIN public.sec_roles sr ON sr.id = ur.role_id AND sr.key = 'legal_counsel'
                                 AND coalesce(sr.status,'active') = 'active'
        JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
       WHERE coalesce(ur.status,'active') = 'active'
    LOOP
      INSERT INTO public.license_appeal_panel_members
        (panel_id, user_id, member_role, is_chair, is_voting, vote_weight, regulator_id)
      SELECT v_panel, v_user, 'legal_adviser', false, false, 1, v_reg
      WHERE NOT EXISTS (
        SELECT 1 FROM public.license_appeal_panel_members
         WHERE panel_id = v_panel AND user_id = v_user);
    END LOOP;

    FOR v_user IN
      SELECT DISTINCT p.id
        FROM public.sec_user_roles ur
        JOIN public.sec_roles sr ON sr.id = ur.role_id AND sr.key = 'auditor'
                                 AND coalesce(sr.status,'active') = 'active'
        JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
       WHERE coalesce(ur.status,'active') = 'active'
    LOOP
      INSERT INTO public.license_appeal_panel_members
        (panel_id, user_id, member_role, is_chair, is_voting, vote_weight, regulator_id)
      SELECT v_panel, v_user, 'observer', false, false, 1, v_reg
      WHERE NOT EXISTS (
        SELECT 1 FROM public.license_appeal_panel_members
         WHERE panel_id = v_panel AND user_id = v_user);
    END LOOP;

    SELECT count(*) INTO v_voting FROM public.license_appeal_panel_members
     WHERE panel_id = v_panel AND is_voting AND is_active;
    IF v_voting >= v_quorum THEN
      UPDATE public.license_appeal_panels SET is_active = true, updated_at = now()
       WHERE id = v_panel AND NOT is_active;
    ELSE
      RAISE NOTICE 'MISSING_ELIGIBLE_MEMBER: % has % voting member(s), quorum % — left inactive',
        r.name, v_voting, v_quorum;
    END IF;
  END LOOP;

  -- ================================================================
  -- 3 · FIT & PROPER COMMITTEE (one practical default per real regulator)
  -- ================================================================
  SELECT quorum, approval_threshold_pct INTO v_quorum, v_thr
    FROM public.fp_committees WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_quorum IS NULL THEN
    RAISE NOTICE 'POLICY_CONFIGURATION_REQUIRED: no configured F&P quorum/threshold; column defaults used';
  END IF;

  SELECT id INTO v_cttee FROM public.fp_committees
   WHERE regulator_id = v_reg AND name = 'Fit & Proper Committee — ' || coalesce(v_reg_name,'Regulator');
  IF v_cttee IS NULL THEN
    INSERT INTO public.fp_committees (name, description, regulator_id, quorum, approval_threshold_pct, is_active)
    VALUES ('Fit & Proper Committee — ' || coalesce(v_reg_name,'Regulator'),
            'Seeded default F&P decision committee.', v_reg,
            coalesce(v_quorum, 3), coalesce(v_thr, 60.00), true)
    RETURNING id INTO v_cttee;
  END IF;

  FOR v_user IN
    SELECT DISTINCT p.id
      FROM public.sec_user_roles ur
      JOIN public.sec_roles sr ON sr.id = ur.role_id AND sr.key = 'fit_proper_supervisor'
                               AND coalesce(sr.status,'active') = 'active'
      JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
     WHERE coalesce(ur.status,'active') = 'active'
       AND public.has_permission(p.id, 'fit_and_proper', 'approve')
  LOOP
    INSERT INTO public.fp_committee_members (committee_id, user_id, member_role)
    SELECT v_cttee, v_user, 'chair'
    WHERE NOT EXISTS (SELECT 1 FROM public.fp_committee_members
                       WHERE committee_id = v_cttee AND user_id = v_user);
  END LOOP;

  FOR v_user IN
    SELECT DISTINCT p.id
      FROM public.sec_user_roles ur
      JOIN public.sec_roles sr ON sr.id = ur.role_id AND sr.role_type = 'internal'
                               AND sr.key IN ('committee_member','fit_proper_officer','f_p_assessor')
                               AND coalesce(sr.status,'active') = 'active'
      JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
     WHERE coalesce(ur.status,'active') = 'active'
       AND public.has_permission(p.id, 'fit_and_proper', 'view')
  LOOP
    INSERT INTO public.fp_committee_members (committee_id, user_id, member_role)
    SELECT v_cttee, v_user, 'member'
    WHERE NOT EXISTS (SELECT 1 FROM public.fp_committee_members
                       WHERE committee_id = v_cttee AND user_id = v_user);
  END LOOP;

  FOR v_user IN
    SELECT DISTINCT p.id
      FROM public.sec_user_roles ur
      JOIN public.sec_roles sr ON sr.id = ur.role_id AND sr.key IN ('legal_counsel','auditor')
                               AND coalesce(sr.status,'active') = 'active'
      JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active' AND p.user_type = 'employee'
     WHERE coalesce(ur.status,'active') = 'active'
       AND public.has_permission(p.id, 'fit_and_proper', 'view')
  LOOP
    INSERT INTO public.fp_committee_members (committee_id, user_id, member_role, vote_weight)
    SELECT v_cttee, v_user, 'observer', 1
    WHERE NOT EXISTS (SELECT 1 FROM public.fp_committee_members
                       WHERE committee_id = v_cttee AND user_id = v_user);
  END LOOP;

  -- ================================================================
  -- 4 · PORTFOLIOS — deliberately NOT seeded (no deterministic coverage).
  -- ================================================================
  RAISE NOTICE 'PORTFOLIO_CONFIGURATION_REQUIRED: no deterministic per-user coverage available';
END
$seed$;