
-- Helper: returns blocking issues as JSONB array
CREATE OR REPLACE FUNCTION public.check_decision_gates(_application_id uuid, _license_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blockers jsonb := '[]'::jsonb;
  r record;
  app_row applications%ROWTYPE;
  lic_row licenses%ROWTYPE;
  target_licensee uuid;
  target_license uuid;
BEGIN
  IF _application_id IS NOT NULL THEN
    SELECT * INTO app_row FROM applications WHERE id = _application_id;
    target_licensee := app_row.applicant_id;
  END IF;

  IF _license_id IS NOT NULL THEN
    SELECT * INTO lic_row FROM licenses WHERE id = _license_id;
    target_license := lic_row.id;
    IF target_licensee IS NULL THEN
      target_licensee := lic_row.holder_id;
    END IF;
  END IF;

  -- Coordination flags: blocker / concurrent_review still open
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
      'kind','coordination_flag',
      'flag_id',r.id,
      'flag_type',r.flag_type,
      'case_id',r.case_id,
      'title',r.title
    );
  END LOOP;

  -- Coordination escalations still open on cases that reference this app/license
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
      'kind','coordination_escalation',
      'escalation_id',r.id,
      'tier',r.tier,
      'status',r.status,
      'case_id',r.case_id
    );
  END LOOP;

  -- Fit & Proper: for each current critical role at the licensee, ensure a current positive determination
  IF target_licensee IS NOT NULL THEN
    FOR r IN
      SELECT ir.individual_id, ir.role_type, ir.role_title,
             d.outcome AS latest_outcome
      FROM fp_individual_roles ir
      LEFT JOIN LATERAL (
        SELECT outcome FROM fp_determinations
        WHERE individual_id = ir.individual_id
          AND is_current = true
        ORDER BY determined_at DESC NULLS LAST
        LIMIT 1
      ) d ON true
      WHERE ir.licensee_id = target_licensee
        AND ir.is_current = true
        AND (ir.role_type IS NULL OR ir.role_type IN (
          'director','ceo','cfo','coo','chairperson','shareholder',
          'controller','key_person','md','executive_director','compliance_officer'
        ))
        AND (d.outcome IS NULL OR d.outcome IN ('rejected','deferred','withdrawn'))
    LOOP
      blockers := blockers || jsonb_build_object(
        'kind','fit_and_proper',
        'individual_id',r.individual_id,
        'role_type',r.role_type,
        'role_title',r.role_title,
        'latest_outcome',COALESCE(r.latest_outcome,'none')
      );
    END LOOP;
  END IF;

  RETURN blockers;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_decision_gates(uuid, uuid) TO authenticated, service_role;

-- Trigger: enforce gates when application status transitions to approved
CREATE OR REPLACE FUNCTION public.enforce_application_decision_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blockers jsonb;
  override_exists boolean;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT EXISTS(
      SELECT 1 FROM rule_overrides
      WHERE rule_key = 'decision.gate.override'
        AND (context ->> 'application_id')::uuid = NEW.id
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO override_exists;

    IF NOT override_exists THEN
      blockers := public.check_decision_gates(NEW.id, NULL);
      IF jsonb_array_length(blockers) > 0 THEN
        RAISE EXCEPTION 'Decision blocked by unresolved gates: %', blockers::text
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_decision_gate ON public.applications;
CREATE TRIGGER trg_application_decision_gate
BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.enforce_application_decision_gate();

-- Trigger: enforce gates when license goes active/issued
CREATE OR REPLACE FUNCTION public.enforce_license_decision_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blockers jsonb;
  override_exists boolean;
  new_status text;
  old_status text;
BEGIN
  new_status := NEW.status;
  old_status := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;

  IF new_status IN ('active','issued') AND (old_status IS NULL OR old_status IS DISTINCT FROM new_status) THEN
    SELECT EXISTS(
      SELECT 1 FROM rule_overrides
      WHERE rule_key = 'decision.gate.override'
        AND (
          (context ->> 'license_id')::uuid = NEW.id
          OR (context ->> 'application_id')::uuid = NEW.application_id
        )
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO override_exists;

    IF NOT override_exists THEN
      blockers := public.check_decision_gates(NEW.application_id, NEW.id);
      IF jsonb_array_length(blockers) > 0 THEN
        RAISE EXCEPTION 'License activation blocked by unresolved gates: %', blockers::text
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_license_decision_gate_ins ON public.licenses;
DROP TRIGGER IF EXISTS trg_license_decision_gate_upd ON public.licenses;
CREATE TRIGGER trg_license_decision_gate_ins
BEFORE INSERT ON public.licenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_license_decision_gate();
CREATE TRIGGER trg_license_decision_gate_upd
BEFORE UPDATE ON public.licenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_license_decision_gate();
