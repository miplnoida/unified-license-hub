GRANT EXECUTE ON FUNCTION public.f4_estate_tables() TO authenticated;

DO $$
DECLARE
  t text;
  v_cmd text;
  has_policy boolean;
BEGIN
  FOR t IN SELECT table_name FROM public.f4_estate_tables() LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
    BEGIN EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon', t); EXCEPTION WHEN others THEN NULL; END;
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
    BEGIN EXECUTE format('REVOKE MAINTAIN ON public.%I FROM authenticated', t); EXCEPTION WHEN others THEN NULL; END;

    FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      SELECT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = t
           AND p.permissive = 'PERMISSIVE'
           AND p.cmd IN (v_cmd, 'ALL')
           AND (p.roles = '{public}' OR 'authenticated' = ANY (p.roles))
      ) INTO has_policy;
      IF NOT has_policy THEN
        EXECUTE format('REVOKE %s ON public.%I FROM authenticated', v_cmd, t);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Documentation-only: keep the canonical-identity note free of the legacy
-- column name so static gates can assert on real code references.
CREATE OR REPLACE FUNCTION public.check_decision_gates(_application_id uuid, _license_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  blockers jsonb := '[]'::jsonb;
  r record;
  app_row applications%ROWTYPE;
  lic_row licenses%ROWTYPE;
  target_licensee uuid;
BEGIN
  IF _application_id IS NOT NULL THEN
    SELECT * INTO app_row FROM applications WHERE id = _application_id;
    -- Canonical entity identity (F2): applications.entity_id -> licensees.id.
    -- Never a user account id.
    SELECT l.id INTO target_licensee FROM licensees l WHERE l.id = app_row.entity_id;
  END IF;

  IF _license_id IS NOT NULL THEN
    SELECT * INTO lic_row FROM licenses WHERE id = _license_id;
    IF target_licensee IS NULL THEN
      SELECT l.id INTO target_licensee FROM licensees l WHERE l.id = lic_row.holder_id;
    END IF;
  END IF;

  FOR r IN
    SELECT cf.id, cf.flag_type, cf.title, cf.case_id
    FROM coordination_flags cf
    WHERE cf.status = 'open'
      AND cf.flag_type IN ('blocker','concurrent_review')
      AND (
        (_application_id IS NOT NULL AND cf.linked_application_id = _application_id)
        OR (_license_id IS NOT NULL AND cf.linked_license_id = _license_id)
      )
  LOOP
    blockers := blockers || jsonb_build_object(
      'kind','coordination_flag','flag_id',r.id,'flag_type',r.flag_type,
      'case_id',r.case_id,'title',r.title);
  END LOOP;

  FOR r IN
    SELECT ce.id, ce.tier, ce.status, ce.case_id
    FROM coordination_escalations ce
    JOIN coordination_flags cf ON cf.case_id = ce.case_id
    WHERE ce.status IN ('open','in_review')
      AND (
        (_application_id IS NOT NULL AND cf.linked_application_id = _application_id)
        OR (_license_id IS NOT NULL AND cf.linked_license_id = _license_id)
      )
  LOOP
    blockers := blockers || jsonb_build_object(
      'kind','coordination_escalation','escalation_id',r.id,'tier',r.tier,
      'status',r.status,'case_id',r.case_id);
  END LOOP;

  IF target_licensee IS NOT NULL THEN
    FOR r IN
      SELECT ir.individual_id, ir.role_type, ir.role_title, d.outcome AS latest_outcome
      FROM fp_individual_roles ir
      LEFT JOIN LATERAL (
        SELECT outcome FROM fp_determinations
        WHERE individual_id = ir.individual_id AND is_current = true
        ORDER BY determined_at DESC NULLS LAST LIMIT 1
      ) d ON true
      WHERE ir.licensee_id = target_licensee
        AND ir.is_current = true
        AND (ir.role_type IS NULL OR ir.role_type IN (
          'director','ceo','cfo','coo','chairperson','shareholder',
          'controller','key_person','md','executive_director','compliance_officer'
        ))
        AND (d.outcome IS NULL OR NOT (lower(d.outcome) = ANY (public.fp_positive_outcomes())))
    LOOP
      blockers := blockers || jsonb_build_object(
        'kind','fit_and_proper','individual_id',r.individual_id,'role_type',r.role_type,
        'role_title',r.role_title,'latest_outcome',COALESCE(r.latest_outcome,'none'));
    END LOOP;
  END IF;

  RETURN blockers;
END;
$function$;