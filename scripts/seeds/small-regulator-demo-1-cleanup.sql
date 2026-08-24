-- SMALL-REGULATOR-DEMO-1 — targeted cleanup.
-- Removes ONLY the additional multi-function role/team/case assignments added by
-- the SMALL-REGULATOR-DEMO-1 seed, restoring the one-person-per-role
-- certification fixture. Non-production only; fails closed on production.
DO $$
DECLARE
  v_a uuid; v_b uuid; v_c uuid; v_exam uuid;
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'SMALL-REGULATOR-DEMO-1 cleanup is non-production only';
  END IF;

  SELECT id INTO v_a FROM public.profiles WHERE email = 'licensing_supervisor@mishainfotech.com';
  SELECT id INTO v_b FROM public.profiles WHERE email = 'complaints_supervisor@mishainfotech.com';
  SELECT id INTO v_c FROM public.profiles WHERE email = 'fit_proper_supervisor@mishainfotech.com';

  -- 1. additional canonical roles
  DELETE FROM public.sec_user_roles ur
   USING public.sec_roles r
   WHERE r.id = ur.role_id
     AND ((ur.user_id = v_a AND r.key IN ('prudential_supervisor','returns_supervisor'))
       OR (ur.user_id = v_b AND r.key IN ('conduct_supervisor','enforcement_supervisor'))
       OR (ur.user_id = v_c AND r.key IN ('inspection_supervisor')));

  -- 2. additional team memberships
  DELETE FROM public.regulatory_team_members m
   USING public.regulatory_teams t
   WHERE t.id = m.team_id
     AND ((m.user_id = v_a AND t.code IN ('TEAM-PRUDENTIAL','TEAM-RETURNS','TEAM-INSPECTION'))
       OR (m.user_id = v_b AND t.code IN ('TEAM-CONDUCT','TEAM-ENFORCEMENT')));

  -- 3. demo entity supervision assignments (history-preserving close, then delete demo rows)
  DELETE FROM public.entity_supervision_assignments
   WHERE assignment_reason LIKE 'SMALLREG-MANUAL-%';

  -- 4. demo examination and its case team
  SELECT id INTO v_exam FROM public.examinations WHERE reference = 'SMALLREG-MANUAL-EXM-001';
  IF v_exam IS NOT NULL THEN
    DELETE FROM public.examination_team_members WHERE examination_id = v_exam;
    DELETE FROM public.examination_events WHERE examination_id = v_exam;
    DELETE FROM public.examinations WHERE id = v_exam;
  END IF;
END $$;
